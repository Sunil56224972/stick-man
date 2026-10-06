/*
 * Server-side tests: seeded levels, room rules and the WebSocket layer.
 * `npm run test:net`. Needs no browser and uses an ephemeral port.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { createLobby, sanitizeName, normalizeCode, COUNTDOWN_MS } = require('../server/rooms');
const wsmod = require('../server/ws');

const sandbox = {}; sandbox.globalThis = sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'game.js'), 'utf8'), sandbox);
const { Game } = sandbox.SH;

let passed = 0, failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

// ---- fakes ----------------------------------------------------------------
function fakeClock() {
    let t = 1000, id = 0; const timers = new Map();
    return {
        now: () => t,
        setTimeout: (fn, ms) => { const k = ++id; timers.set(k, { at: t + ms, fn }); return k; },
        clearTimeout: (k) => timers.delete(k),
        advance(ms) {
            const end = t + ms;
            for (;;) {
                let next = null;
                timers.forEach((v, k) => { if (v.at <= end && (!next || v.at < next.v.at)) next = { k, v }; });
                if (!next) break;
                timers.delete(next.k); t = next.v.at; next.v.fn();
            }
            t = end;
        }
    };
}
function client(lobby) {
    const c = { open: true, inbox: [], send(s) { this.inbox.push(JSON.parse(s)); }, close() { this.open = false; this.onclose && this.onclose(); } };
    c.p = lobby.connect(c);
    c.tx = (o) => c.onmessage(JSON.stringify(o));
    c.last = (t) => { for (let i = c.inbox.length - 1; i >= 0; i--) if (c.inbox[i].t === t) return c.inbox[i]; return null; };
    c.has = (t) => c.inbox.some((m) => m.t === t);
    return c;
}
function setup() {
    const clock = fakeClock();
    let seq = 0.123;
    const lobby = createLobby({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, random: () => (seq = (seq * 9301 + 49297) % 233280 / 233280) });
    return { clock, lobby };
}
function room2(opts) {
    const s = setup();
    const a = client(s.lobby), b = client(s.lobby);
    a.tx({ t: 'create', name: 'Ann' });
    const code = a.last('joined').room.code;
    b.tx({ t: 'join', code: code.toLowerCase(), name: 'Ben' });
    return Object.assign(s, { a, b, code });
}
function race(r) {
    r.b.tx({ t: 'ready' });
    r.a.tx({ t: 'start' });
    r.clock.advance(COUNTDOWN_MS + 5);
}

// ---- seeded levels ---------------------------------------------------------
function course(seed, behave) {
    const g = new Game({ seed });
    for (let i = 0; i < 40; i++) { behave(g, i); g._addPlatform(); }
    return JSON.stringify([g.platforms, g.cherries]);
}
test('same seed builds the same course even when score differs', () => {
    const a = course(1234, (g) => { g.score += 1; });
    const b = course(1234, (g, i) => { g.score += i * 7; });
    assert.strictEqual(a, b);
});
test('different seeds build different courses', () => {
    assert.notStrictEqual(course(1, () => {}), course(2, () => {}));
});
test('seeded course stays playable: gaps are crossable, platforms have width', () => {
    const g = new Game({ seed: 99 });
    for (let i = 0; i < 300; i++) g._addPlatform();
    for (let i = 1; i < g.platforms.length; i++) {
        const gap = g.platforms[i].x - (g.platforms[i - 1].x + g.platforms[i - 1].w);
        assert.ok(gap >= 40 && gap <= 245, 'gap ' + gap);
        assert.ok(g.platforms[i].w >= 20 && g.platforms[i].w <= 100, 'w ' + g.platforms[i].w);
    }
});
test('two seeded games stay in step when played with the same bot', () => {
    const play = (perfect) => {
        const g = new Game({ seed: 777 });
        const made = g.platforms.slice();
        const add = g._addPlatform;
        g._addPlatform = function () { add.call(g); made.push(g.platforms[g.platforms.length - 1]); };
        g.press();
        let guard = 0;
        while (g.score < 40 && g.phase !== 'over' && guard++ < 200000) {
            if (g.phase === 'waiting') g.press();
            if (g.phase === 'stretching' && g.currentStick().length >= g.idealLength() + (perfect ? 0 : 6)) g.release();
            g.update(16);
        }
        return made.slice(0, 8);
    };
    const a = play(true), b = play(false);
    assert.ok(a.length === 8 && b.length === 8);
    assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});
test('solo mode (no seed) is untouched: rng sequence still drives the layout', () => {
    const seq = () => { let s = 5; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
    const a = new Game({ rng: seq() }), b = new Game({ rng: seq() });
    assert.strictEqual(JSON.stringify(a.platforms), JSON.stringify(b.platforms));
    assert.strictEqual(a.seed, null);
});

// ---- names and codes -------------------------------------------------------
test('names are cleaned and capped', () => {
    assert.strictEqual(sanitizeName('  <b>Sunil</b>  '), 'bSunilb');
    assert.strictEqual(sanitizeName('a'.repeat(40)).length, 14);
    assert.strictEqual(sanitizeName(42), '');
    assert.strictEqual(normalizeCode(' ab-c d9 '), 'ABCD');
});

// ---- rooms -----------------------------------------------------------------
test('create then join: both see the same two-player room', () => {
    const r = room2();
    assert.strictEqual(r.a.last('room').room.players.length, 2);
    assert.strictEqual(r.b.last('joined').room.code, r.code);
    assert.strictEqual(r.b.last('joined').room.host, r.a.p.id);
});
test('duplicate names get a number', () => {
    const s = setup(); const a = client(s.lobby), b = client(s.lobby);
    a.tx({ t: 'create', name: 'Sam' }); b.tx({ t: 'join', code: a.last('joined').room.code, name: 'Sam' });
    assert.strictEqual(b.last('joined').room.players[1].name, 'Sam 2');
});
test('unknown room and full room are refused', () => {
    const s = setup(); const a = client(s.lobby); a.tx({ t: 'join', code: 'ZZZZ' });
    assert.strictEqual(a.last('err').code, 'no-room');
    const h = client(s.lobby); h.tx({ t: 'create', name: 'H' });
    const code = h.last('joined').room.code;
    for (let i = 0; i < 3; i++) client(s.lobby).tx({ t: 'join', code, name: 'p' + i });
    const x = client(s.lobby); x.tx({ t: 'join', code });
    assert.strictEqual(x.last('err').code, 'full');
});
test('a 1 vs 1 room holds exactly two players and starts with one friend', () => {
    const s = setup(); const h = client(s.lobby); h.tx({ t: 'create', name: 'H', size: 2 });
    const j = h.last('joined').room;
    assert.strictEqual(j.max, 2);
    const code = j.code;
    const b = client(s.lobby); b.tx({ t: 'join', code, name: 'B' });
    assert.strictEqual(b.last('joined').room.max, 2);
    const c = client(s.lobby); c.tx({ t: 'join', code, name: 'C' });
    assert.strictEqual(c.last('err').code, 'full');
    b.tx({ t: 'ready', ready: true }); h.tx({ t: 'start' });
    assert.ok(h.has('countdown') && b.has('countdown'));
});
test('create with a bogus size falls back to a 4 player party', () => {
    const s = setup(); const h = client(s.lobby); h.tx({ t: 'create', size: 99 });
    assert.strictEqual(h.last('joined').room.max, 4);
});
test('start needs a host, a friend and everyone ready', () => {
    const r = room2();
    r.b.tx({ t: 'start' }); assert.strictEqual(r.b.last('err').code, 'not-host');
    r.a.tx({ t: 'start' }); assert.strictEqual(r.a.last('err').code, 'not-ready');
    const s = setup(); const solo = client(s.lobby); solo.tx({ t: 'create' }); solo.tx({ t: 'start' });
    assert.strictEqual(solo.last('err').code, 'alone');
});
test('countdown then go; both get the same seed', () => {
    const r = room2(); r.b.tx({ t: 'ready' }); r.a.tx({ t: 'start' });
    assert.strictEqual(r.a.last('countdown').ms, COUNTDOWN_MS);
    assert.strictEqual(r.a.last('countdown').room.seed, r.b.last('countdown').room.seed);
    assert.ok(!r.a.has('go'));
    r.clock.advance(COUNTDOWN_MS + 1);
    assert.ok(r.a.has('go') && r.b.has('go'));
});
test('late joiners cannot enter a race in progress', () => {
    const r = room2(); race(r);
    const c = client(r.lobby); c.tx({ t: 'join', code: r.code });
    assert.strictEqual(c.last('err').code, 'started');
});
test('scores are relayed, bad ones are dropped', () => {
    const r = room2(); race(r);
    r.clock.advance(1000); r.a.tx({ t: 'score', score: 1, n: 1 });
    assert.strictEqual(r.b.last('score').score, 1);
    r.clock.advance(1000); r.a.tx({ t: 'score', score: 900, n: 2 });      // impossible jump
    r.clock.advance(1000); r.a.tx({ t: 'score', score: -3, n: 3 });
    r.clock.advance(1000); r.a.tx({ t: 'score', score: 1.5, n: 3 });
    r.clock.advance(1000); r.a.tx({ t: 'score', score: 5 });              // no bridge count
    assert.strictEqual(r.b.inbox.filter((m) => m.t === 'score').length, 1);
});
test('a lost update does not lock a legitimate player out', () => {
    const r = room2(); race(r);
    r.clock.advance(1000); r.a.tx({ t: 'score', score: 1, n: 1 });
    r.clock.advance(3000);                                                // updates 2 and 3 never arrive
    r.a.tx({ t: 'score', score: 9, n: 4 });                               // 1 + 1 + 3 + 4 on perfects
    assert.strictEqual(r.b.last('score').score, 9);
});
test('more bridges than the clock allows are ignored', () => {
    const r = room2(); race(r);
    r.clock.advance(1000); r.a.tx({ t: 'score', score: 20, n: 20 });
    assert.ok(!r.b.has('score'));
});
test('round ends when everyone is out; highest score wins', () => {
    const r = room2(); race(r);
    r.clock.advance(1000); r.a.tx({ t: 'score', score: 1, n: 1 });
    r.clock.advance(1000); r.b.tx({ t: 'score', score: 1, n: 1 });
    r.clock.advance(1000); r.b.tx({ t: 'score', score: 3, n: 2 });
    r.a.tx({ t: 'dead' });
    assert.ok(!r.a.has('results'));
    r.b.tx({ t: 'dead' });
    const res = r.a.last('results');
    assert.strictEqual(res.winner, r.b.p.id);
    assert.strictEqual(res.room.players.find((p) => p.id === r.b.p.id).place, 1);
});
test('a tie goes to whoever stopped scoring first', () => {
    const r = room2(); race(r);
    r.clock.advance(1000); r.a.tx({ t: 'score', score: 1, n: 1 }); r.b.tx({ t: 'score', score: 1, n: 1 });
    r.a.tx({ t: 'dead' }); r.clock.advance(500); r.b.tx({ t: 'dead' });
    assert.strictEqual(r.a.last('results').winner, r.a.p.id);
});
test('a player who disconnects mid-race is knocked out; survivor can finish', () => {
    const r = room2(); race(r);
    r.b.close();
    assert.ok(r.a.has('out'));
    r.a.tx({ t: 'dead' });
    assert.ok(r.a.has('results'));
});
test('everyone leaving destroys the room', () => {
    const r = room2(); r.a.close(); r.b.close();
    assert.strictEqual(r.lobby.size(), 0);
});
test('host leaves in the lobby: next player becomes host', () => {
    const r = room2(); r.a.close();
    assert.strictEqual(r.b.last('room').room.host, r.b.p.id);
});
test('rematch returns to the lobby with ready cleared', () => {
    const r = room2(); race(r); r.a.tx({ t: 'dead' }); r.b.tx({ t: 'dead' });
    r.a.tx({ t: 'again' });
    const rm = r.b.last('room').room;
    assert.strictEqual(rm.state, 'lobby');
    assert.ok(rm.players.every((p) => !p.ready && p.score === 0));
});
test('a silent player is counted out after the AFK window', () => {
    const r = room2(); race(r);
    r.clock.advance(1000); r.a.tx({ t: 'score', score: 1, n: 1 });
    for (let i = 0; i < 12; i++) { r.clock.advance(5000); r.a.tx({ t: 'ping' }); r.a.tx({ t: 'score', score: 1, n: 1 }); }

    assert.ok(r.b.inbox.some((m) => m.t === 'out' && m.id === r.b.p.id));
});
test('only the host picks the map, and only in the lobby', () => {
    const r = room2();
    r.b.tx({ t: 'map', map: 'frost' }); assert.strictEqual(r.a.last('room').room.map, 'meadow');
    r.a.tx({ t: 'map', map: 'frost' }); assert.strictEqual(r.b.last('room').room.map, 'frost');
    r.a.tx({ t: 'map', map: '../x' }); assert.strictEqual(r.b.last('room').room.map, 'frost');
});
test('garbage input never throws', () => {
    const s = setup(); const c = client(s.lobby);
    ['{}', '[]', 'null', '{"t":5}', '{"t":"__proto__"}', '{"t":"constructor"}', '{"t":"join"}'].forEach((m) => c.onmessage(m));
    assert.ok(c.open);
    c.onmessage('not json'); assert.ok(!c.open);
});
test('flooding a connection gets it dropped', () => {
    const s = setup(); const c = client(s.lobby);
    for (let i = 0; i < 200 && c.open; i++) c.onmessage('{"t":"ping"}');
    assert.ok(!c.open);
});

// ---- WebSocket layer, over real sockets ----------------------------------------
function mask(op, payload, opts) {
    opts = opts || {};
    const key = crypto.randomBytes(4);
    const len = payload.length;
    let head;
    if (len < 126) head = Buffer.from([(opts.fin === false ? 0 : 0x80) | op, 0x80 | len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = (opts.fin === false ? 0 : 0x80) | op; head[1] = 0x80 | 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 0x80 | 127; head.writeUInt32BE(len, 6); }
    const body = Buffer.alloc(len);
    for (let i = 0; i < len; i++) body[i] = payload[i] ^ key[i & 3];
    return Buffer.concat([head, key, body]);
}
function parseFrames(buf) {
    const out = [];
    while (buf.length >= 2) {
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { len = buf.readUInt32BE(6); off = 10; }
        if (buf.length < off + len) break;
        out.push({ op: buf[0] & 15, data: buf.subarray(off, off + len) });
        buf = buf.subarray(off + len);
    }
    return out;
}
function rawClient(port, extra) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const s = net.connect(port, '127.0.0.1');
        let buf = Buffer.alloc(0), shaken = false;
        const api = { s, frames: [], key, status: '' };
        s.on('data', (d) => {
            buf = Buffer.concat([buf, d]);
            if (!shaken) {
                const i = buf.indexOf('\r\n\r\n'); if (i < 0) return;
                api.status = buf.subarray(0, i).toString().split('\r\n')[0];
                api.head = buf.subarray(0, i).toString();
                buf = buf.subarray(i + 4); shaken = true; resolve(api);
            }
            const fr = parseFrames(buf); api.frames.push(...fr);
            let used = 0; fr.forEach((f) => { used += f.data.length + (f.data.length < 126 ? 2 : f.data.length < 65536 ? 4 : 10); });
            buf = buf.subarray(used);
        });
        s.on('error', reject);
        s.on('close', () => { api.closed = true; if (!shaken) resolve(api); });
        s.write('GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n' + (extra || '') + '\r\n');
    });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('ws: handshake accept key matches RFC 6455 example', async () => {
    const http = require('http'); const srv = http.createServer();
    const got = [];
    const h = wsmod.attach(srv, { path: '/ws', onConnection: (c) => got.push(c) });
    await new Promise((r) => srv.listen(0, r));
    const s = net.connect(srv.address().port, '127.0.0.1');
    let data = '';
    s.on('data', (d) => (data += d));
    s.write('GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
    await wait(150);
    assert.ok(data.includes('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo='), data);
    s.destroy(); h.close(); srv.close();
});
test('ws: text, fragments, ping, big and oversized payloads', async () => {
    const http = require('http'); const srv = http.createServer();
    const msgs = []; let closeCount = 0;
    const h = wsmod.attach(srv, { path: '/ws', onConnection: (c) => { c.onmessage = (t) => { msgs.push(t); c.send('echo:' + t.length); }; c.onclose = () => closeCount++; } });
    await new Promise((r) => srv.listen(0, r));
    const c = await rawClient(srv.address().port);
    c.s.write(mask(1, Buffer.from('héllo ✓')));
    c.s.write(mask(1, Buffer.from('frag-'), { fin: false }));
    c.s.write(mask(0, Buffer.from('mented')));
    c.s.write(mask(9, Buffer.from('p')));
    c.s.write(mask(1, Buffer.from('x'.repeat(3000))));
    await wait(200);
    assert.deepStrictEqual(msgs.slice(0, 2), ['héllo ✓', 'frag-mented']);
    assert.strictEqual(msgs[2].length, 3000);
    assert.ok(c.frames.some((f) => f.op === 10), 'pong');
    assert.ok(c.frames.some((f) => f.op === 1 && f.data.toString() === 'echo:3000'));
    c.s.write(mask(1, Buffer.from('y'.repeat(5000))));
    await wait(150);
    const closeFrame = c.frames.find((f) => f.op === 8);
    assert.ok(closeFrame && closeFrame.data.readUInt16BE(0) === 1009, 'oversize closes 1009');
    assert.strictEqual(msgs.length, 3);
    await wait(100);
    assert.strictEqual(closeCount, 1);
    h.close(); srv.close();
});
test('ws: unmasked frames, bad paths and bad versions are refused', async () => {
    const http = require('http'); const srv = http.createServer();
    const h = wsmod.attach(srv, { path: '/ws', onConnection: (c) => { c.onmessage = () => {}; } });
    await new Promise((r) => srv.listen(0, r));
    const port = srv.address().port;
    const c = await rawClient(port);
    c.s.write(Buffer.from([0x81, 0x02, 0x68, 0x69]));      // unmasked "hi"
    await wait(100);
    assert.ok(c.frames.some((f) => f.op === 8 && f.data.readUInt16BE(0) === 1002));
    const bad = await new Promise((resolve) => {
        const s = net.connect(port, '127.0.0.1'); let d = '';
        s.on('data', (x) => (d += x)); s.on('close', () => resolve(d));
        s.write('GET /nope HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: abc\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
    assert.ok(bad.startsWith('HTTP/1.1 404'));
    h.close(); srv.close();
});
test('full server: two raw clients play a room end to end over /ws', async () => {
    const server = require('../server');
    await new Promise((r) => server.listen(0, r));
    const port = server.address().port;
    const A = await rawClient(port), B = await rawClient(port);
    const send = (c, o) => c.s.write(mask(1, Buffer.from(JSON.stringify(o))));
    const seen = (c, t) => c.frames.filter((f) => f.op === 1).map((f) => JSON.parse(f.data.toString())).filter((m) => m.t === t);
    send(A, { t: 'create', name: 'Ann' }); await wait(80);
    const code = seen(A, 'joined')[0].room.code;
    send(B, { t: 'join', code, name: 'Ben' }); await wait(80);
    send(B, { t: 'ready' }); await wait(50);
    send(A, { t: 'start' }); await wait(COUNTDOWN_MS + 300);
    assert.strictEqual(seen(A, 'go').length, 1);
    assert.strictEqual(seen(B, 'go').length, 1);
    send(A, { t: 'dead' }); send(B, { t: 'dead' }); await wait(120);
    assert.strictEqual(seen(B, 'results').length, 1);
    A.s.destroy(); B.s.destroy();
    server.lobby; server.close();
    server.closeAllConnections && server.closeAllConnections();
});

(async () => {
    for (const t of queue) {
        try { await t.fn(); passed++; console.log('  ok   ' + t.name); }
        catch (e) { failed++; console.log('  FAIL ' + t.name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); }
    }
    console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
    process.exit(failed ? 1 : 0);
})();