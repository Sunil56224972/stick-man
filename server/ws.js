/*
 * Minimal WebSocket server (RFC 6455), text frames only, no dependencies.
 *
 * Just enough for the multiplayer lobby: the HTTP upgrade handshake, masked
 * client frames of any legal length, fragmentation, ping/pong, close, a hard
 * payload cap and a heartbeat that drops dead connections.
 */
'use strict';
const crypto = require('crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 4096;

function frame(opcode, payload) {
    const len = payload.length;
    let head;
    if (len < 126) {
        head = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
        head = Buffer.alloc(4);
        head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2);
    } else {
        head = Buffer.alloc(10);
        head[0] = 0x80 | opcode; head[1] = 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(len, 6);
    }
    return Buffer.concat([head, payload]);
}

class Conn {
    constructor(socket, ip) {
        this.socket = socket;
        this.ip = ip;
        this.buf = Buffer.alloc(0);
        this.parts = [];
        this.size = 0;
        this.open = true;
        this.alive = true;
        this.onmessage = null;
        this.onclose = null;
        this._closedOnce = false;
        socket.setNoDelay(true);
        socket.on('data', (d) => this._data(d));
        socket.on('close', () => this._closed());
        socket.on('error', () => socket.destroy());
    }

    send(text) {
        if (!this.open || this.socket.destroyed) return;
        this.socket.write(frame(1, Buffer.from(String(text), 'utf8')));
    }

    ping() {
        if (this.open && !this.socket.destroyed) this.socket.write(frame(9, Buffer.alloc(0)));
    }

    close(code) {
        if (!this.open) return;
        this.open = false;
        const p = Buffer.alloc(2);
        p.writeUInt16BE(code || 1000);
        try { this.socket.write(frame(8, p)); this.socket.end(); } catch (e) { this.socket.destroy(); }
    }

    terminate() { this.open = false; this.socket.destroy(); }

    _fail(code) { this.close(code); this.buf = Buffer.alloc(0); }

    _closed() {
        this.open = false;
        if (this._closedOnce) return;
        this._closedOnce = true;
        if (this.onclose) this.onclose();
    }

    _data(chunk) {
        this.alive = true;
        this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
        while (this.open && this.buf.length >= 2) {
            const b = this.buf;
            const fin = !!(b[0] & 0x80), op = b[0] & 0x0f, masked = !!(b[1] & 0x80);
            let len = b[1] & 0x7f, off = 2;
            if ((b[0] & 0x70) !== 0 || !masked) return this._fail(1002);   // reserved bits / unmasked client frame
            if (len === 126) {
                if (b.length < 4) return;
                len = b.readUInt16BE(2); off = 4;
            } else if (len === 127) {
                if (b.length < 10) return;
                if (b.readUInt32BE(2) !== 0) return this._fail(1009);
                len = b.readUInt32BE(6); off = 10;
            }
            if (len > MAX_PAYLOAD) return this._fail(1009);
            if (op >= 8 && (len > 125 || !fin)) return this._fail(1002);
            if (b.length < off + 4 + len) return;

            const mask = b.subarray(off, off + 4);
            const payload = Buffer.alloc(len);
            for (let i = 0; i < len; i++) payload[i] = b[off + 4 + i] ^ mask[i & 3];
            this.buf = b.subarray(off + 4 + len);
            this._frame(fin, op, payload);
        }
    }

    _frame(fin, op, payload) {
        switch (op) {
            case 1:
                if (this.parts.length) return this._fail(1002);
                this.parts = [payload]; this.size = payload.length;
                break;
            case 0:
                if (!this.parts.length) return this._fail(1002);
                this.parts.push(payload); this.size += payload.length;
                if (this.size > MAX_PAYLOAD) return this._fail(1009);
                break;
            case 2: return this._fail(1003);
            case 8: return this.close(1000);
            case 9:
                if (this.open) this.socket.write(frame(10, payload));
                return;
            case 10: return;
            default: return this._fail(1002);
        }
        if (fin) {
            const text = Buffer.concat(this.parts).toString('utf8');
            this.parts = []; this.size = 0;
            if (this.onmessage) this.onmessage(text);
        }
    }
}

// Hooks WebSocket upgrades on `server`. opts: { path, onConnection(conn, req), maxConnections }
function attach(server, opts) {
    const conns = new Set();

    function reject(socket, status, text) {
        socket.write('HTTP/1.1 ' + status + ' ' + text + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
    }

    server.on('upgrade', (req, socket, head) => {
        const url = (req.url || '').split('?')[0];
        if (url !== opts.path) return reject(socket, 404, 'Not Found');
        const key = req.headers['sec-websocket-key'];
        if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') {
            return reject(socket, 400, 'Bad Request');
        }
        if (conns.size >= (opts.maxConnections || 500)) return reject(socket, 503, 'Service Unavailable');

        const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');

        const conn = new Conn(socket, req.socket.remoteAddress);
        conns.add(conn);
        socket.on('close', () => conns.delete(conn));
        opts.onConnection(conn, req);
        if (head && head.length) conn._data(head);
    });

    // Browsers answer pings automatically; a silent peer for two rounds is gone.
    const beat = setInterval(() => {
        conns.forEach((c) => {
            if (!c.alive) return c.terminate();
            c.alive = false;
            c.ping();
        });
    }, opts.heartbeatMs || 25000);
    beat.unref();

    return {
        connections: conns,
        close() { clearInterval(beat); conns.forEach((c) => c.terminate()); }
    };
}

module.exports = { attach, frame, MAX_PAYLOAD };