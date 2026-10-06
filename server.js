/*
 * Tiny game server: `npm start`.
 * Serves ./public (refuses path traversal) and hosts the multiplayer
 * WebSocket endpoint at /ws. No dependencies.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const ws = require('./server/ws');
const rooms = require('./server/rooms');

const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 8089;

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.json': 'application/json'
};

function resolve(urlPath) {
    let rel;
    try { rel = decodeURIComponent(urlPath.split('?')[0]); } catch (e) { return null; }
    if (rel.endsWith('/')) rel += 'index.html';
    const full = path.normalize(path.join(ROOT, rel));
    return full.startsWith(ROOT + path.sep) ? full : null;
}

const server = http.createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    const file = resolve(req.url);
    if (!file) { res.writeHead(400); return res.end('Bad request'); }

    fs.stat(file, (err, stat) => {
        if (err || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
        res.writeHead(200, {
            'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        fs.createReadStream(file).pipe(res);
    });
});

// Multiplayer: WebSocket endpoint at /ws. Rooms live in memory, nothing is stored.
const lobby = rooms.createLobby();
ws.attach(server, { path: '/ws', onConnection: (conn) => lobby.connect(conn), maxConnections: 400 });
server.lobby = lobby;

if (require.main === module) {
    server.listen(PORT, () => console.log(`Stick Hero running at http://localhost:${PORT}/`));
}

module.exports = server;