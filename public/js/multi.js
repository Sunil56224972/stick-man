/*
 * Stick Hero - multiplayer front end.
 *
 * Owns the room lobby, the live standings strip, the 3-2-1 countdown and the
 * results card. It talks to the server through SH.net and to the game through
 * a handful of hooks main.js hands over, so the single-player code never has
 * to know a race exists.
 *
 * States: idle -> join -> lobby -> countdown -> race -> results -> lobby ...
 */
(function (root) {
    'use strict';
    var SH = (root.SH = root.SH || {});
    var doc = root.document;
    function $(id) { return doc.getElementById(id); }
    function ico(id) { return '<svg class="ico" aria-hidden="true"><use href="#' + id + '"/></svg>'; }

    var DOTS = ['#e4472f', '#4aa8d8', '#3fae78', '#f4b73a'];
    var MAX = 4;

    var M = {
        state: 'idle',     // idle | join | lobby | countdown | race | results
        room: null,
        me: 0,
        invite: ''
    };
    var api = null, el = {}, tickTimers = [], resultTimer = 0, goTimer = 0;

    // --- helpers ------------------------------------------------------------------

    function player(id) {
        if (!M.room) return null;
        for (var i = 0; i < M.room.players.length; i++) if (M.room.players[i].id === id) return M.room.players[i];
        return null;
    }
    function isHost() { return !!M.room && M.room.host === M.me; }
    function colorOf(p) { return DOTS[M.room.players.indexOf(p) % DOTS.length]; }
    function clearTimers() {
        tickTimers.forEach(clearTimeout);
        tickTimers = [];
        clearTimeout(resultTimer);
        clearTimeout(goTimer);
    }

    function cleanName(s) { return String(s || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 14); }
    function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }

    function setStatus(kind, text, retry) {
        var box = el['mp-status'];
        box.dataset.state = kind;
        el['mp-status-text'].textContent = text;
        el['btn-mp-retry'].hidden = !retry;
    }

    // --- lifecycle ------------------------------------------------------------------

    M.init = function (hooks) {
        api = hooks;
        [
            'screen-mp', 'mp-status', 'mp-status-text', 'btn-mp-retry', 'mp-view-join', 'mp-view-lobby', 'mp-name', 'mp-code',
            'btn-mp-create', 'btn-mp-join', 'mp-code-show', 'btn-mp-copy', 'btn-mp-ready', 'mp-note', 'mp-players',
            'mp-count-label', 'mp-maps', 'mp-map-note', 'mp-strip', 'mp-count', 'screen-mpresult', 'mpr-list', 'mpr-sub',
            'mpr-stamp', 'btn-mpr-again', 'btn-mpr-leave', 'btn-mp-close'
        ].forEach(function (id) { el[id] = $(id); });

        try {
            var q = new URLSearchParams(root.location.search).get('room');
            if (q) M.invite = cleanCode(q);
        } catch (e) { /* no query support: no invite */ }

        SH.net.onmessage = onMessage;
        SH.net.onclose = onClose;

        el['btn-mp-close'].addEventListener('click', function () { api.sound.click(); M.close(); });
        el['btn-mp-retry'].addEventListener('click', function () { api.sound.click(); connect(); });
        el['btn-mp-create'].addEventListener('click', onCreate);
        el['btn-mp-join'].addEventListener('click', onJoin);
        el['btn-mp-copy'].addEventListener('click', copyInvite);
        el['btn-mp-ready'].addEventListener('click', onReadyButton);
        el['btn-mpr-again'].addEventListener('click', function () { api.sound.click(); SH.net.send({ t: 'again' }); });
        el['btn-mpr-leave'].addEventListener('click', function () { api.sound.click(); M.leave(); api.showTitle(); });
        el['mp-maps'].addEventListener('click', function (e) {
            var b = e.target.closest('[data-map]');
            if (!b || !isHost() || M.state !== 'lobby') return;
            api.sound.click();
            SH.net.send({ t: 'map', map: b.dataset.map });
        });
        el['mp-code'].addEventListener('input', function () {
            var c = cleanCode(this.value);
            if (this.value !== c) this.value = c;
        });
        el['mp-name'].addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); (cleanCode(el['mp-code'].value).length === 4 ? onJoin : onCreate)(); } });
        el['mp-code'].addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); onJoin(); } });
        // tapping the dimmed backdrop leaves a lobby the same way the X does
        el['screen-mp'].addEventListener('pointerdown', function (e) { if (e.target === this) M.close(); });
    };

    // True while a race (countdown included) is being played on this screen.
    M.racing = function () { return M.state === 'countdown' || M.state === 'race'; };
    M.inRoom = function () { return !!M.room; };
    M.mapId = function () { return M.room ? M.room.map : null; };

    M.open = function () {
        M.state = 'join';
        api.enterLobbyScene();
        el['mp-name'].value = api.store.data.name || '';
        el['mp-code'].value = M.invite || '';
        showView('join');
        api.ui.show('mp');
        connect();
        setTimeout(function () {
            var f = M.invite ? el['btn-mp-join'] : el['mp-name'];
            if (!el['screen-mp'].hidden) f.focus({ preventScroll: true });
        }, 60);
    };

    // Back out of the lobby (or the join form) to the title.
    M.close = function () {
        M.leave();
        api.showTitle();
    };

    M.leave = function () {
        clearTimers();
        if (SH.net.open && M.room) SH.net.send({ t: 'leave' });
        SH.net.close();
        M.room = null;
        M.me = 0;
        M.state = 'idle';
        el['mp-strip'].hidden = true;
        el['mp-count'].hidden = true;
        api.ui.hide('mp');
        api.ui.hide('mpresult');
    };

    function showView(name) {
        el['mp-view-join'].hidden = name !== 'join';
        el['mp-view-lobby'].hidden = name !== 'lobby';
    }

    function connect() {
        setStatus('connecting', 'Connecting...', false);
        SH.net.connect().then(function () {
            if (M.state === 'idle') return;
            setStatus('online', 'Connected', false);
        }, function (err) {
            if (M.state === 'idle') return;
            setStatus('offline', err && err.code === 'timeout' ? 'The server took too long to answer.' : 'Can\u2019t reach the multiplayer server.', true);
        });
    }

    function ensureOnline(then) {
        if (SH.net.open) return then();
        setStatus('connecting', 'Connecting...', false);
        SH.net.connect().then(function () { setStatus('online', 'Connected', false); then(); }, function () {
            setStatus('offline', 'Can\u2019t reach the multiplayer server.', true);
            api.sound.nope();
        });
    }

    // --- joining ----------------------------------------------------------------------

    function saveName() {
        var n = cleanName(el['mp-name'].value);
        api.store.data.name = n;
        api.store.save();
        return n;
    }

    function onCreate() {
        api.sound.click();
        var name = saveName();
        ensureOnline(function () { SH.net.send({ t: 'create', name: name, map: api.store.data.equipped.map }); });
    }

    function onJoin() {
        var code = cleanCode(el['mp-code'].value);
        if (code.length !== 4) { api.sound.nope(); api.ui.toast('Enter the 4-letter room code'); el['mp-code'].focus(); return; }
        api.sound.click();
        var name = saveName();
        ensureOnline(function () { SH.net.send({ t: 'join', code: code, name: name }); });
    }

    function inviteLink() {
        var url = root.location.origin + root.location.pathname + '?room=' + (M.room ? M.room.code : '');
        try {
            var s = new URLSearchParams(root.location.search).get('server');
            if (s) url += '&server=' + encodeURIComponent(s);
        } catch (e) { /* ignore */ }
        return url;
    }

    function copyInvite() {
        var link = inviteLink();
        api.sound.click();
        var done = function () { api.ui.toast('Invite link copied'); };
        var fallback = function () {
            var t = doc.createElement('textarea');
            t.value = link;
            t.style.cssText = 'position:fixed;opacity:0;left:-9999px';
            doc.body.appendChild(t);
            t.select();
            var ok = false;
            try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
            doc.body.removeChild(t);
            if (ok) done(); else api.ui.toast('Share code ' + M.room.code);
        };
        if (root.navigator.clipboard && root.navigator.clipboard.writeText) {
            root.navigator.clipboard.writeText(link).then(done, fallback);
        } else fallback();
    }

    function onReadyButton() {
        var me = player(M.me);
        if (!me || M.state !== 'lobby') return;
        if (isHost()) {
            api.sound.click();
            SH.net.send({ t: 'start' });
        } else {
            SH.net.send({ t: 'ready', ready: !me.ready });
        }
    }

    // --- messages ---------------------------------------------------------------------

    function onMessage(m) {
        switch (m.t) {
            case 'joined':
                M.me = m.you;
                setRoom(m.room);
                M.state = 'lobby';
                M.invite = '';
                showView('lobby');
                api.sound.mpJoin();
                renderLobby();
                break;

            case 'room': {
                var before = M.room ? M.room.players.length : 0;
                var wasResults = M.state === 'results';
                setRoom(m.room);
                if (M.state === 'results' && m.room.state === 'lobby') {
                    M.state = 'lobby';
                    api.ui.hide('mpresult');
                    api.enterLobbyScene();
                    showView('lobby');
                    api.ui.show('mp');
                }
                if (M.state === 'lobby') {
                    if (m.room.players.length > before && !wasResults) api.sound.mpJoin();
                    renderLobby();
                } else renderStrip();
                break;
            }

            case 'countdown':
                setRoom(m.room);
                beginCountdown(m.ms);
                break;

            case 'go':
                setRoom(m.room);
                goRace();
                break;

            case 'score': {
                var p = player(m.id);
                if (p) p.score = m.score;
                renderStrip();
                break;
            }

            case 'out': {
                var q = player(m.id);
                if (q) { q.alive = false; q.score = m.score; }
                if (m.id !== M.me) api.sound.mpOut();
                renderStrip();
                break;
            }

            case 'results':
                setRoom(m.room);
                showResults(m.winner);
                break;

            case 'notice':
                api.ui.toast(m.msg);
                break;

            case 'err':
                api.sound.nope();
                api.ui.toast(m.msg);
                if (M.state === 'join') setStatus('online', m.msg, false);
                break;
        }
    }

    function onClose() {
        if (M.state === 'idle') return;
        var inJoin = M.state === 'join';
        if (inJoin) { setStatus('offline', 'Connection lost.', true); return; }
        M.leave();
        api.showTitle();
        api.ui.toast('Connection lost. You left the room.');
    }

    function setRoom(room) {
        M.room = room;
        if (api.onRoom) api.onRoom(room);
    }

    // --- lobby ---------------------------------------------------------------------------

    function renderLobby() {
        var room = M.room;
        if (!room) return;
        var host = isHost(), me = player(M.me);
        el['mp-code-show'].textContent = room.code;
        el['mp-count-label'].textContent = room.players.length + ' / ' + MAX;

        var html = '';
        room.players.forEach(function (p, i) {
            html += '<li class="mp-player' + (p.id === M.me ? ' is-me' : '') + '">' +
                '<i class="mp-swatch" style="background:' + DOTS[i % DOTS.length] + '"></i>' +
                '<span class="mp-name"></span>' +
                (p.id === room.host ? '<span class="mp-tag mp-tag-host">' + ico('i-crown') + '</span>' : '') +
                (p.id === M.me ? '<span class="mp-tag">You</span>' : '') +
                '<span class="mp-pill ' + (p.ready || p.id === room.host ? 'is-ready' : '') + '">' + (p.id === room.host ? 'Host' : p.ready ? 'Ready' : 'Waiting') + '</span></li>';
        });
        for (var s = room.players.length; s < MAX; s++) {
            html += '<li class="mp-player is-empty"><i class="mp-swatch"></i><span class="mp-name">Open seat</span></li>';
        }
        el['mp-players'].innerHTML = html;
        // names go in as text, never as markup
        var names = el['mp-players'].querySelectorAll('.mp-name');
        room.players.forEach(function (p, i) { names[i].textContent = p.name; });

        // map picker
        var picks = '';
        SH.maps.forEach(function (map) {
            var t = map.themes[0];
            picks += '<button type="button" class="mp-map' + (map.id === room.map ? ' is-on' : '') + '" data-map="' + map.id + '"' +
                (host ? '' : ' disabled') + ' aria-pressed="' + (map.id === room.map ? 'true' : 'false') + '">' +
                '<i style="background:linear-gradient(' + t.skyTop + ',' + t.skyBot + ' 55%,' + t.near + ' 56%)"></i><span>' + map.name + '</span></button>';
        });
        el['mp-maps'].innerHTML = picks;
        el['mp-map-note'].textContent = host ? 'you choose' : 'host chooses';

        // main action
        var btn = el['btn-mp-ready'], note = el['mp-note'];
        var others = room.players.filter(function (p) { return p.id !== room.host; });
        var allReady = others.length > 0 && others.every(function (p) { return p.ready; });
        if (host) {
            btn.innerHTML = ico('i-play') + 'Start race';
            btn.disabled = !allReady;
            note.textContent = others.length === 0 ? 'Share the code with a friend to begin.'
                : allReady ? 'Everyone is ready. Go!' : 'Waiting for friends to ready up.';
        } else {
            btn.disabled = false;
            btn.innerHTML = (me && me.ready ? ico('i-check') + 'Ready!' : 'I\u2019m ready');
            note.textContent = me && me.ready ? 'Waiting for the host to start.' : 'Tap ready when you are set.';
        }
        btn.classList.toggle('btn-on', !host && !!(me && me.ready));
        btn.classList.toggle('btn-primary', host || !(me && me.ready));
    }

    // --- countdown and race -----------------------------------------------------------------

    function beginCountdown(ms) {
        clearTimers();
        M.state = 'countdown';
        api.ui.hide('mp');
        api.ui.hide('mpresult');
        api.prepare(M.room.seed, M.room.map);
        renderStrip();
        var steps = Math.max(1, Math.round(ms / 1000));
        for (var i = 0; i < steps; i++) {
            (function (n, delay) {
                tickTimers.push(setTimeout(function () { showCount(String(n)); api.sound.mpTick(); }, delay));
            })(steps - i, i * (ms / steps));
        }
    }

    function showCount(text) {
        var c = el['mp-count'];
        c.textContent = text;
        c.hidden = false;
        c.classList.remove('go');
        c.style.animation = 'none';
        void c.offsetWidth;
        c.style.animation = '';
        if (text === 'GO!') c.classList.add('go');
    }

    function goRace() {
        clearTimeout(goTimer);
        tickTimers.forEach(clearTimeout);
        tickTimers = [];
        M.state = 'race';
        showCount('GO!');
        api.sound.mpGo();
        api.go();
        goTimer = setTimeout(function () { el['mp-count'].hidden = true; }, 750);
        renderStrip();
    }

    M.reportScore = function (score, bridges) {
        if (M.state === 'race') SH.net.send({ t: 'score', score: score, n: bridges });
    };
    M.reportDead = function () {
        if (M.state === 'race') SH.net.send({ t: 'dead' });
    };

    function renderStrip() {
        var strip = el['mp-strip'];
        if (!M.room || (M.state !== 'race' && M.state !== 'countdown')) { strip.hidden = true; return; }
        var order = M.room.players.slice().sort(function (a, b) { return (b.score - a.score) || (a.id - b.id); });
        strip.innerHTML = '';
        order.forEach(function (p, i) {
            var li = doc.createElement('li');
            li.className = 'mp-chip' + (p.id === M.me ? ' is-me' : '') + (p.alive ? '' : ' is-out');
            var dot = doc.createElement('i');
            dot.style.background = colorOf(p);
            var nm = doc.createElement('span');
            nm.className = 'mp-chip-name';
            nm.textContent = p.name;
            var sc = doc.createElement('b');
            sc.textContent = p.score;
            li.appendChild(dot); li.appendChild(nm); li.appendChild(sc);
            li.setAttribute('aria-label', (i + 1) + '. ' + p.name + ', ' + p.score + (p.alive ? '' : ', out'));
            strip.appendChild(li);
        });
        strip.hidden = false;
    }

    // --- results ----------------------------------------------------------------------------

    function showResults(winnerId) {
        clearTimers();
        M.state = 'results';
        el['mp-count'].hidden = true;
        el['mp-strip'].hidden = true;
        var room = M.room;
        var order = room.players.slice().sort(function (a, b) { return a.place - b.place; });
        var iWon = winnerId === M.me;
        var list = el['mpr-list'];
        list.innerHTML = '';
        order.forEach(function (p) {
            var li = doc.createElement('li');
            li.className = 'mpr-row' + (p.id === M.me ? ' is-me' : '') + (p.place === 1 ? ' is-win' : '');
            li.innerHTML = '<span class="mpr-place">' + (p.place === 1 ? ico('i-crown') : p.place) + '</span><span class="mpr-name"></span><b class="mpr-score">' + p.score + '</b>';
            li.querySelector('.mpr-name').textContent = p.name + (p.id === M.me ? ' (you)' : '');
            if (!p.connected) li.classList.add('is-gone');
            list.appendChild(li);
        });
        var winner = player(winnerId);
        el['mpr-sub'].textContent = iWon ? 'You crossed the farthest. Nicely done.' : (winner ? winner.name + ' took it.' : '');
        el['mpr-stamp'].hidden = !iWon;
        // let the last fall play out before the card covers it
        resultTimer = setTimeout(function () {
            if (M.state !== 'results') return;
            api.ui.show('mpresult');
            if (iWon) api.sound.mpWin(); else api.sound.gameOver();
            el['btn-mpr-again'].focus({ preventScroll: true });
        }, 900);
    }

    SH.multi = M;
})(window);