/*
 * Stick Hero - shared drawing helpers.
 *
 * Used by the scene renderer and by the armory previews, so what you buy is
 * exactly what you play with. Conventions: heroes are drawn with their feet at
 * (0,0) facing right; sticks are drawn standing up from (0,0) towards -y.
 */
(function (root) {
    'use strict';
    var SH = (root.SH = root.SH || {});

    var INK = '#1d1b2b';
    var STICK_W = 5;

    function hex(c) {
        var n = parseInt(c.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function mix(a, b, t) {
        var x = hex(a), y = hex(b);
        var r = Math.round(x[0] + (y[0] - x[0]) * t);
        var g = Math.round(x[1] + (y[1] - x[1]) * t);
        var bl = Math.round(x[2] + (y[2] - x[2]) * t);
        function h2(v) { return (v < 16 ? '0' : '') + v.toString(16); }
        return '#' + h2(r) + h2(g) + h2(bl); // always hex so callers can append an alpha suffix
    }

    function limb(ctx, x0, y0, x1, y1, color, width) {
        ctx.lineCap = 'round';
        ctx.strokeStyle = INK;
        ctx.lineWidth = width + 2.2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    /*
     * o: x, y      feet position
     *    t         clock in ms (cloth flutter)
     *    phase     walk-cycle angle, or null when standing
     *    flip      hang upside down (mirrored on y)
     *    rot       extra rotation in radians (tumbling)
     *    scale     uniform scale
     *    squash    vertical squash while crouching
     */
    function drawHero(ctx, skin, o) {
        var t = o.t || 0;
        var swing = o.phase == null ? 0 : Math.sin(o.phase) * 0.75;
        var s = o.scale || 1;

        ctx.save();
        ctx.translate(o.x, o.y);
        if (o.rot) ctx.rotate(o.rot);
        if (o.flip) ctx.scale(1, -1);
        ctx.scale(s, s * (o.squash || 1));
        ctx.lineJoin = 'round';

        // far arm and leg
        limb(ctx, 0, -18.5, Math.sin(-swing) * 6, -18.5 + Math.cos(swing) * 6, skin.legs, 3.4);
        limb(ctx, -2, -9, -2 + Math.sin(-swing) * 9.5, -9 + Math.cos(swing) * 9.5, skin.legs, 4.2);

        // torso
        roundRect(ctx, -6.5, -22, 13, 14, 4);
        ctx.fillStyle = skin.body;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = skin.belt;
        ctx.fillRect(-7, -14.8, 14, 3.2);
        ctx.restore();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = INK;
        roundRect(ctx, -6.5, -22, 13, 14, 4);
        ctx.stroke();

        // near leg and arm
        limb(ctx, 2, -9, 2 + Math.sin(swing) * 9.5, -9 + Math.cos(swing) * 9.5, skin.legs, 4.2);
        limb(ctx, 0, -18.5, Math.sin(swing) * 6, -18.5 + Math.cos(swing) * 6, skin.body, 3.4);

        // head: hood, face window, eye
        ctx.beginPath();
        ctx.arc(0.5, -27.5, 7.2, 0, Math.PI * 2);
        ctx.fillStyle = skin.body;
        ctx.fill();
        ctx.stroke();

        roundRect(ctx, 0.2, -30.2, 7.2, 5.6, 2.6);
        ctx.fillStyle = skin.face;
        ctx.fill();
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(4.7, -27.4, 1.15, 0, Math.PI * 2);
        ctx.fill();

        // headband and fluttering tails
        ctx.lineWidth = 1.4;
        ctx.fillStyle = skin.band;
        ctx.beginPath();
        ctx.rect(-6.8, -31.4, 14.6, 2.9);
        ctx.fill();
        ctx.stroke();

        var fl = Math.sin(t * 0.011) * 2.2;
        var fl2 = Math.sin(t * 0.011 + 1.4) * 2.6;
        var lift = o.phase == null ? 0.5 : 2.2;
        ctx.fillStyle = skin.band;
        ctx.beginPath();
        ctx.moveTo(-6.4, -31);
        ctx.quadraticCurveTo(-12, -33 + fl - lift, -17, -31 + fl2 - lift);
        ctx.lineTo(-12.5, -29.6 + fl);
        ctx.lineTo(-6.4, -28.8);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-6.4, -29.4);
        ctx.quadraticCurveTo(-11, -28 + fl2, -15, -25.5 + fl);
        ctx.lineTo(-10.5, -26.5 + fl2);
        ctx.lineTo(-6.4, -28);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    // Deterministic pseudo-random in [0,1) for texture marks.
    function hash(n) {
        var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return x - Math.floor(x);
    }

    // Stick standing up from (0,0). Width is STICK_W, centred on x = 0.
    function drawStick(ctx, style, len, t) {
        if (len <= 0) return;
        var w = STICK_W, h = w / 2, i, y, g;
        ctx.save();
        ctx.lineJoin = 'round';

        function body(fill) {
            ctx.fillStyle = fill;
            ctx.fillRect(-h, -len, w, len);
        }
        function outline() {
            ctx.strokeStyle = INK;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-h, -len, w, len);
        }

        if (style === 'bamboo') {
            g = ctx.createLinearGradient(-h, 0, h, 0);
            g.addColorStop(0, '#7bc86c'); g.addColorStop(0.5, '#a6e08f'); g.addColorStop(1, '#4f9d4a');
            body(g);
            for (y = 22; y < len; y += 26) {
                ctx.fillStyle = '#2f7a3a';
                ctx.fillRect(-h - 1, -y - 1.5, w + 2, 3);
                ctx.fillStyle = '#d6f5bd';
                ctx.fillRect(-h + 0.5, -y - 3, 1, 1.4);
            }
            outline();
        } else if (style === 'frost') {
            g = ctx.createLinearGradient(-h, 0, h, 0);
            g.addColorStop(0, '#9fd8f5'); g.addColorStop(0.5, '#eaf8ff'); g.addColorStop(1, '#7fbbe0');
            body(g);
            ctx.strokeStyle = 'rgba(255,255,255,.9)';
            ctx.lineWidth = 1;
            for (y = 14; y < len; y += 31) {
                ctx.beginPath();
                ctx.moveTo(-h, -y); ctx.lineTo(0, -y - 5); ctx.lineTo(h, -y);
                ctx.stroke();
            }
            outline();
        } else if (style === 'laser') {
            ctx.shadowColor = '#19d3e6';
            ctx.shadowBlur = 10;
            body('#19d3e6');
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-1, -len, 2, len);
            ctx.fillStyle = INK;
            ctx.fillRect(-h - 1.5, -3, w + 3, 3); // emitter grip
        } else if (style === 'rainbow') {
            g = ctx.createLinearGradient(0, 0, 0, -Math.max(len, 60));
            var shift = (t || 0) * 0.04;
            for (i = 0; i <= 6; i++) g.addColorStop(i / 6, 'hsl(' + ((i * 55 + shift) % 360) + ',90%,58%)');
            body(g);
            outline();
        } else if (style === 'ember') {
            var flick = 0.75 + Math.sin((t || 0) * 0.02) * 0.15;
            body('#2a2230');
            ctx.fillStyle = 'rgba(255,' + Math.round(110 + 60 * flick) + ',40,' + flick + ')';
            for (y = 6; y < len; y += 17) {
                var seg = 5 + hash(y) * 6;
                ctx.fillRect(-1.2, -y - seg, 2.4, seg);
            }
            outline();
        } else {
            // wood: warm oak with grain and the odd knot
            g = ctx.createLinearGradient(-h, 0, h, 0);
            g.addColorStop(0, '#a56a3a'); g.addColorStop(0.55, '#c88a52'); g.addColorStop(1, '#7d4b27');
            body(g);
            ctx.strokeStyle = 'rgba(70,38,16,.45)';
            ctx.lineWidth = 0.8;
            for (y = 9; y < len; y += 23) {
                var gx = (hash(y) - 0.5) * 2;
                ctx.beginPath(); ctx.moveTo(gx, -y); ctx.lineTo(gx, -y - 8 - hash(y + 1) * 8); ctx.stroke();
            }
            for (y = 40; y < len - 6; y += 71) {
                ctx.fillStyle = '#5c3519';
                ctx.beginPath(); ctx.arc((hash(y) - 0.5) * 2, -y, 1.1, 0, Math.PI * 2); ctx.fill();
            }
            outline();
        }
        ctx.restore();
    }

    // A pair of cherries with a leaf, centred on (0,0), about 20px tall.
    function drawCherry(ctx, x, y, t, scale) {
        var bob = Math.sin((t || 0) * 0.005 + x * 0.1) * 2;
        ctx.save();
        ctx.translate(x, y + bob);
        ctx.scale(scale || 1, scale || 1);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.strokeStyle = INK;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(-4.5, 3); ctx.quadraticCurveTo(-3, -6, 1, -10);
        ctx.moveTo(4.5, 4); ctx.quadraticCurveTo(3.5, -5, 1, -10);
        ctx.stroke();
        ctx.strokeStyle = '#4c9a50';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#58b368';
        ctx.beginPath();
        ctx.moveTo(1, -10);
        ctx.quadraticCurveTo(6, -15, 11, -11);
        ctx.quadraticCurveTo(6, -7, 1, -10);
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = INK;
        ctx.stroke();

        [[-4.5, 4.5, 5, '#e4472f'], [4.5, 5.5, 4.6, '#c9341f']].forEach(function (b) {
            ctx.beginPath();
            ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2);
            ctx.fillStyle = b[3];
            ctx.fill();
            ctx.stroke();
        });
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.arc(-6.2, 2.6, 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(2.9, 3.6, 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function prepare(canvas) {
        var dpr = Math.min(root.devicePixelRatio || 1, 3);
        var w = canvas.clientWidth || canvas.width;
        var h = canvas.clientHeight || canvas.height;
        if (canvas._cssW !== w || canvas._cssH !== h || canvas._dpr !== dpr) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            canvas._cssW = w; canvas._cssH = h; canvas._dpr = dpr;
        }
        var ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        return { ctx: ctx, w: w, h: h };
    }

    function previewHero(canvas, skin, t, walking) {
        var c = prepare(canvas);
        var s = Math.min(c.w, c.h) / 46;
        c.ctx.fillStyle = 'rgba(29,27,43,.18)';
        c.ctx.beginPath();
        c.ctx.ellipse(c.w / 2, c.h - 8, 13 * s / 1.6, 3.2, 0, 0, Math.PI * 2);
        c.ctx.fill();
        drawHero(c.ctx, skin, { x: c.w / 2, y: c.h - 9, t: t || 0, scale: s * 1.05, phase: walking ? (t || 0) * 0.012 : null });
    }

    function previewStick(canvas, style, t) {
        var c = prepare(canvas);
        var ctx = c.ctx;
        var pillar = Math.max(10, c.w * 0.13);
        var y = c.h * 0.6;
        ctx.fillStyle = INK;
        ctx.fillRect(0, y, pillar, c.h - y);
        ctx.fillRect(c.w - pillar, y, pillar, c.h - y);
        ctx.save();
        ctx.translate(pillar - 2, y + STICK_W / 2);
        ctx.rotate(Math.PI / 2);
        drawStick(ctx, style, c.w - pillar * 2 + 4, t || 0);
        ctx.restore();
    }

    SH.draw = {
        INK: INK,
        STICK_W: STICK_W,
        mix: mix,
        hash: hash,
        prepare: prepare,
        roundRect: roundRect,
        hero: drawHero,
        stick: drawStick,
        cherry: drawCherry,
        previewHero: previewHero,
        previewStick: previewStick
    };
})(typeof window !== 'undefined' ? window : globalThis);