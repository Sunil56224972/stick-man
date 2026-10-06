/*
 * Multiplayer rooms for Stick Hero.
 *
 * A room is a short race: everyone plays the same seeded course on their own
 * machine, the server keeps the standings. It is authoritative for who is in
 * the room, who is ready, when the round starts and who wins. It never runs
 * the physics, so it only sanity-checks the scores clients report.
 *
 * Wire format: one JSON object per message, {"t": "<type>", ...}. See
 * README for the full list. The module has no I/O of its own; a connection is
 * anything with send(text), close(code), onmessage and onclose, and the clock
 * and timers are injectable, which is what the unit tests rely on.
 */
'use strict';

const MAX_PLAYERS = 4;       // largest room (party)
const DUEL_PLAYERS = 2;      // 1 vs 1 room
const MIN_TO_START = 2;
const COUNTDOWN_MS = 3000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
const NAME_MAX = 14;
const MIN_BRIDGE_MS = 600;      // a bridge cannot be built, crossed and scrolled faster than this
const AFK_MS = 45000;           // a player who reports nothing for this long is counted out
const MAX_SCORE = 5000;
const VIEW_GAP_MS = 40;         // a player's live view is relayed at most 25 times a second
const PHASES = ['waiting', 'stretching', 'turning', 'walking', 'transitioning', 'falling', 'over'];
const SKIN = /^[a-z]{2,12}$/;

// A live view is a small snapshot of one player's run. Only known numeric
// fields are copied across, so a client cannot push anything else to its room.
function cleanView(s) {
    if (!s || typeof s !== 'object' || PHASES.indexOf(s.p) < 0) return null;
    const out = { p: s.p, f: s.f ? 1 : 0, fk: s.fk === 'miss' || s.fk === 'pillar' ? s.fk : null };
    const num = (key, lo, hi) => {
        const v = s[key];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) return false;
        out[key] = v;
        return true;
    };
    const ok = num('k', 0, 2000) && num('m', 1, 2000) && num('sc', 0, MAX_SCORE) && num('x', -1e6, 1e6) &&
        num('o', -1e6, 1e6) && num('sx', -1e6, 1e6) && num('sl', 0, 400) && num('sr', 0, 200) &&
        num('w', 0, 1e7) && num('ft', 0, 5000) && num('fy', -1e4, 1e5);
    return ok ? out : null;
}

function sanitizeName(raw) {
    let s = typeof raw === 'string' ? raw : '';
    s = s.normalize('NFKC').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim();
    return Array.from(s).slice(0, NAME_MAX).join('').trim();
}

function normalizeCode(raw) {
    return typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) : '';
}

function createLobby(opts) {
    opts = opts || {};
    const now = opts.now || Date.now;
    const setT = opts.setTimeout || setTimeout;
    const clearT = opts.clearTimeout || clearTimeout;
    const random = opts.random || Math.random;
    const maxRooms = opts.maxRooms || 300;
    const rooms = new Map();
    let nextId = 1;

    function newCode() {
        for (let tries = 0; tries < 200; tries++) {
            let c = '';
            for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
            if (!rooms.has(c)) return c;
        }
        return null;
    }

    function send(p, obj) { if (p.conn.open !== false) p.conn.send(JSON.stringify(obj)); }

    function uniqueName(room, wanted) {
        let base = sanitizeName(wanted);
        if (!base) base = 'Player';
        let name = base, n = 2;
        const taken = () => room.players.some((p) => p.name.toLowerCase() === name.toLowerCase());
        while (taken()) {
            const suffix = ' ' + n++;
            name = Array.from(base).slice(0, NAME_MAX - suffix.length).join('') + suffix;
        }
        return name;
    }

    function live(room) { return room.players.filter((p) => p.connected); }

    function ranked(room) {
        // Highest score first; on a tie the one who lasted longer ranks lower, so
        // whoever reached the score first wins it.
        return room.players.slice().sort((a, b) => (b.score - a.score) || ((a.outAt || Infinity) - (b.outAt || Infinity)) || (a.id - b.id));
    }

    function snapshot(room) {
        const order = room.state === 'results' ? ranked(room) : null;
        return {
            code: room.code,
            state: room.state,
            host: room.host,
            map: room.map,
            seed: room.seed,
            max: room.max,
            players: room.players.map((p) => ({
                id: p.id, name: p.name, hero: p.hero, stick: p.stick, ready: p.ready, score: p.score,
                alive: p.alive, connected: p.connected,
                place: order ? order.indexOf(p) + 1 : 0
            }))
        };
    }

    function broadcast(room, obj, except) {
        const text = JSON.stringify(obj);
        room.players.forEach((p) => { if (p !== except && p.connected && p.conn.open !== false) p.conn.send(text); });
    }

    function pushRoom(room) { broadcast(room, { t: 'room', room: snapshot(room) }); }

    function clearTimers(room) {
        if (room.timer) { clearT(room.timer); room.timer = null; }
        if (room.afk) { clearT(room.afk); room.afk = null; }
    }

    function destroy(room) {
        clearTimers(room);
        rooms.delete(room.code);
    }

    function toLobby(room) {
        clearTimers(room);
        room.players = room.players.filter((p) => p.connected);
        room.state = 'lobby';
        room.players.forEach((p) => { p.ready = false; p.score = 0; p.alive = true; p.outAt = 0; p.updates = 0; });
        if (!room.players.some((p) => p.id === room.host) && room.players.length) room.host = room.players[0].id;
        pushRoom(room);
    }

    function finish(room) {
        clearTimers(room);
        room.state = 'results';
        const order = ranked(room);
        broadcast(room, { t: 'results', room: snapshot(room), winner: order.length ? order[0].id : 0 });
    }

    function checkEnd(room) {
        if (room.state !== 'race') return;
        if (!live(room).some((p) => p.alive)) finish(room);
    }

    function knockOut(room, p) {
        if (!p.alive) return;
        p.alive = false;
        p.outAt = now();
        broadcast(room, { t: 'out', id: p.id, score: p.score });
        checkEnd(room);
    }

    // Sweeps for players who went silent mid-race (tab frozen, phone locked).
    function armAfk(room) {
        room.afk = setT(() => {
            room.afk = null;
            if (room.state !== 'race') return;
            const t = now();
            room.players.forEach((p) => { if (p.alive && p.connected && t - p.lastSeen > AFK_MS) knockOut(room, p); });
            if (room.state === 'race') armAfk(room);
        }, 5000);
        if (room.afk && room.afk.unref) room.afk.unref();
    }

    function startCountdown(room) {
        room.state = 'countdown';
        room.seed = Math.floor(random() * 0xFFFFFFFF) >>> 0;
        room.players.forEach((p) => { p.score = 0; p.alive = true; p.outAt = 0; p.updates = 0; });
        broadcast(room, { t: 'countdown', ms: COUNTDOWN_MS, room: snapshot(room) });
        room.timer = setT(() => {
            room.timer = null;
            const t = now();
            room.state = 'race';
            room.raceStart = t;
            room.players.forEach((p) => { p.lastSeen = t; p.lastScoreAt = t; });
            // anyone who dropped during the countdown is simply out
            room.players.forEach((p) => { if (!p.connected) { p.alive = false; p.outAt = t; } });
            broadcast(room, { t: 'go', room: snapshot(room) });
            armAfk(room);
            checkEnd(room);
        }, COUNTDOWN_MS);
        if (room.timer.unref) room.timer.unref();
    }

    function removePlayer(room, p) {
        if (room.state === 'lobby') {
            room.players = room.players.filter((x) => x !== p);
        } else {
            p.connected = false;
            p.ready = false;
            if (room.state === 'race') knockOut(room, p);
        }
        if (!live(room).length) return destroy(room);
        if (room.host === p.id) room.host = live(room)[0].id;
        if (room.state === 'countdown' && live(room).length < MIN_TO_START) {
            toLobby(room);
            broadcast(room, { t: 'notice', msg: 'Not enough players. Back to the lobby.' });
            return;
        }
        if (room.state === 'race') {
            // knockOut may already have ended the round and sent results
            if (room.state === 'race') pushRoom(room);
        } else if (room.state === 'results' && !live(room).length) {
            destroy(room);
        } else {
            pushRoom(room);
        }
    }

    function fail(p, code, msg) { send(p, { t: 'err', code: code, msg: msg }); }

    // --- message handlers -------------------------------------------------------

    function onCreate(p, m) {
        if (p.room) return fail(p, 'in-room', 'You are already in a room.');
        if (rooms.size >= maxRooms) return fail(p, 'busy', 'The server is full. Try again in a minute.');
        const code = newCode();
        if (!code) return fail(p, 'busy', 'Could not make a room code.');
        const room = {
            code: code, state: 'lobby', host: p.id, map: 'meadow', seed: 0,
            players: [], timer: null, afk: null, raceStart: 0,
            max: m.size === DUEL_PLAYERS ? DUEL_PLAYERS : MAX_PLAYERS
        };
        if (typeof m.map === 'string' && /^[a-z]{2,12}$/.test(m.map)) room.map = m.map;
        rooms.set(code, room);
        enter(room, p, m);
    }

    function onJoin(p, m) {
        if (p.room) return fail(p, 'in-room', 'You are already in a room.');
        const room = rooms.get(normalizeCode(m.code));
        if (!room) return fail(p, 'no-room', 'No room with that code.');
        if (room.state !== 'lobby') return fail(p, 'started', 'That race has already started.');
        if (room.players.length >= room.max) return fail(p, 'full', 'That room is full.');
        enter(room, p, m);
    }

    function enter(room, p, m) {
        const name = m.name;
        p.room = room;
        p.hero = typeof m.hero === 'string' && SKIN.test(m.hero) ? m.hero : 'classic';
        p.stick = typeof m.stick === 'string' && SKIN.test(m.stick) ? m.stick : 'wood';
        p.lastViewAt = 0;
        p.name = uniqueName(room, name);
        p.ready = false;
        p.score = 0;
        p.alive = true;
        p.connected = true;
        p.outAt = 0;
        p.updates = 0;
        p.lastSeen = now();
        p.lastScoreAt = 0;
        room.players.push(p);
        send(p, { t: 'joined', you: p.id, room: snapshot(room) });
        broadcast(room, { t: 'room', room: snapshot(room) }, p);
    }

    function onLeave(p) {
        const room = p.room;
        if (!room) return;
        p.room = null;
        removePlayer(room, p);
    }

    function onReady(p, m) {
        const room = p.room;
        if (!room || room.state !== 'lobby') return;
        p.ready = m.ready !== false;
        pushRoom(room);
    }

    function onMap(p, m) {
        const room = p.room;
        if (!room || room.state !== 'lobby' || room.host !== p.id) return;
        if (typeof m.map !== 'string' || !/^[a-z]{2,12}$/.test(m.map)) return;
        room.map = m.map;
        pushRoom(room);
    }

    function onStart(p) {
        const room = p.room;
        if (!room || room.state !== 'lobby') return;
        if (room.host !== p.id) return fail(p, 'not-host', 'Only the host can start the race.');
        if (live(room).length < MIN_TO_START) return fail(p, 'alone', 'You need at least one friend to race.');
        if (room.players.some((x) => x.id !== room.host && !x.ready)) return fail(p, 'not-ready', 'Everyone has to be ready first.');
        startCountdown(room);
    }

    function onScore(p, m) {
        const room = p.room;
        if (!room || room.state !== 'race' || !p.alive) return;
        const t = now();
        p.lastSeen = t;
        const s = m.score, n = m.n;
        if (!Number.isInteger(s) || !Number.isInteger(n) || s <= p.score || n <= p.updates || s > MAX_SCORE) return;
        // The client says how many bridges it has crossed. Bridge k scores at most
        // 2k (a perfect on a chain of k), so n bridges are worth n*(n+1) at best,
        // and a bridge cannot be built, crossed and scrolled in under MIN_BRIDGE_MS.
        // Both bounds hold even if an earlier update was lost on the way.
        if (s > n * (n + 1)) return;
        if (n > (t - room.raceStart) / MIN_BRIDGE_MS + 1) return;
        p.updates = n;
        p.score = s;
        broadcast(room, { t: 'score', id: p.id, score: s }, p);
    }

    // Relays this player's live view to everyone else in the race.
    function onView(p, m) {
        const room = p.room;
        if (!room || room.state !== 'race' || !p.alive) return;
        const t = now();
        if (t - p.lastViewAt < VIEW_GAP_MS) return;
        const s = cleanView(m.s);
        if (!s) return;
        p.lastViewAt = t;
        p.lastSeen = t;
        broadcast(room, { t: 'view', id: p.id, s: s }, p);
    }

    function onDead(p) {
        const room = p.room;
        if (!room || room.state !== 'race') return;
        p.lastSeen = now();
        knockOut(room, p);
    }

    function onAgain(p) {
        const room = p.room;
        if (!room || room.state !== 'results') return;
        toLobby(room);
    }

    const HANDLERS = {
        create: onCreate, join: onJoin, leave: onLeave, ready: onReady, map: onMap,
        start: onStart, score: onScore, view: onView, dead: onDead, again: onAgain
    };

    // Token bucket: 40 messages a second sustained, which covers ~15 live views a second plus the rest.
    function allow(p) {
        const t = now();
        p.tokens = Math.min(60, p.tokens + (t - p.tokenAt) * 0.04);
        p.tokenAt = t;
        if (p.tokens < 1) return false;
        p.tokens -= 1;
        return true;
    }

    function connect(conn) {
        const p = {
            id: nextId++, conn: conn, room: null, name: '', ready: false, score: 0, alive: true,
            connected: true, outAt: 0, updates: 0, lastSeen: now(), lastScoreAt: 0, tokens: 60, tokenAt: now()
        };
        conn.onmessage = (text) => {
            if (!allow(p)) return conn.close(1008);
            let m;
            try { m = JSON.parse(text); } catch (e) { return conn.close(1003); }
            if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
            if (m.t === 'ping') return send(p, { t: 'pong' });
            const h = Object.prototype.hasOwnProperty.call(HANDLERS, m.t) ? HANDLERS[m.t] : null;
            if (h) h(p, m);
        };
        conn.onclose = () => { onLeave(p); };
        send(p, { t: 'hello', v: 1 });
        return p;
    }

    return {
        connect: connect,
        rooms: rooms,
        size: () => rooms.size
    };
}

module.exports = {
    createLobby, sanitizeName, normalizeCode,
    MAX_PLAYERS, DUEL_PLAYERS, VIEW_GAP_MS, cleanView, MIN_TO_START, COUNTDOWN_MS, MIN_BRIDGE_MS, AFK_MS
};