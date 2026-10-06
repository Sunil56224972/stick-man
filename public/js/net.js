/*
 * Stick Hero - network client.
 *
 * A thin wrapper over WebSocket: resolves the server address, connects with a
 * timeout, parses JSON, keeps the socket warm with a ping and reports a
 * clean "unreachable" error instead of throwing, so the UI can explain it.
 */
(function (root) {
    'use strict';
    var SH = (root.SH = root.SH || {});

    function socketScheme() { return root.location.protocol === 'https:' ? 'wss://' : 'ws://'; }

    function serverUrl() {
        var param = '';
        try { param = new URLSearchParams(root.location.search).get('server') || ''; } catch (e) { param = ''; }
        var base = param || (root.SH_CONFIG && root.SH_CONFIG.server) || '';
        if (!base) return socketScheme() + root.location.host + '/ws';
        base = base.replace(/\/+$/, '');
        if (/^wss?:\/\//.test(base)) return /\/ws$/.test(base) ? base : base + '/ws';
        if (/^https?:\/\//.test(base)) return base.replace(/^http/, 'ws') + '/ws';
        return socketScheme() + base + '/ws';
    }

    var Net = {
        ws: null,
        open: false,
        onmessage: function () {},
        onclose: function () {},
        url: serverUrl
    };

    var beat = 0;

    // Resolves when the socket is open; rejects with {code: 'unreachable' | 'timeout'}.
    Net.connect = function () {
        if (Net.open) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            var ws, settled = false;
            try { ws = new root.WebSocket(serverUrl()); } catch (e) { reject({ code: 'unreachable' }); return; }
            Net.ws = ws;
            var timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                detach(ws);
                try { ws.close(); } catch (e) { /* already closing */ }
                reject({ code: 'timeout' });
            }, 6000);

            ws.onopen = function () {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                Net.open = true;
                clearInterval(beat);
                beat = setInterval(function () { Net.send({ t: 'ping' }); }, 20000);
                resolve();
            };
            ws.onmessage = function (ev) {
                var m;
                try { m = JSON.parse(ev.data); } catch (e) { return; }
                if (m && typeof m.t === 'string') Net.onmessage(m);
            };
            ws.onerror = function () { /* the close handler reports it */ };
            ws.onclose = function () {
                clearTimeout(timer);
                clearInterval(beat);
                var wasOpen = Net.open;
                Net.open = false;
                Net.ws = null;
                if (!settled) { settled = true; reject({ code: 'unreachable' }); return; }
                if (wasOpen) Net.onclose();
            };
        });
    };

    function detach(ws) { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; }

    Net.send = function (obj) {
        if (!Net.open || !Net.ws || Net.ws.readyState !== 1) return false;
        Net.ws.send(JSON.stringify(obj));
        return true;
    };

    // Deliberate close: no onclose callback.
    Net.close = function () {
        clearInterval(beat);
        var ws = Net.ws;
        Net.open = false;
        Net.ws = null;
        if (ws) { detach(ws); try { ws.close(1000); } catch (e) { /* ignore */ } }
    };

    SH.net = Net;
})(window);