/*
 * Stick Hero - map scenery.
 *
 * Everything that makes one map look different from another: the sky, the
 * parallax ridges and their props, the ambient weather and the pillar
 * material. A map (see catalog.js) is plain data; this file turns it into
 * pixels. The game scene and the armory previews share the same code, so a
 * map card shows exactly what you will play on.
 */
(function (root) {
    'use strict';
    var SH = (root.SH = root.SH || {});
    var D = SH.draw;

    var TAU = Math.PI * 2;
    var KEYS = ['skyTop', 'skyBot', 'far', 'mid', 'near', 'pillar', 'rim', 'tree', 'cloud', 'mist', 'accent'];

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    // t runs 0 (day) .. 1 (dusk) .. 2 (night); neighbours are blended.
    function palette(map, t) {
        t = clamp(t, 0, 2);
        var lo = Math.min(1, Math.floor(t)), f = t - lo;
        var a = map.themes[lo], b = map.themes[lo + 1], out = {};
        for (var i = 0; i < KEYS.length; i++) out[KEYS[i]] = D.mix(a[KEYS[i]], b[KEYS[i]], f);
        return out;
    }

    // --- sky -----------------------------------------------------------------

    function newState(seed) {
        var st = { stars: [], clouds: [], last: 0 }, i;
        for (i = 0; i < 70; i++) {
            st.stars.push({
                x: seed ? D.hash(i * 1.3 + seed) : Math.random(),
                y: (seed ? D.hash(i * 2.9 + seed) : Math.random()) * 0.55,
                r: (seed ? D.hash(i * 4.1 + seed) : Math.random()) * 1.3 + 0.4,
                p: (seed ? D.hash(i * 5.7 + seed) : Math.random()) * 6.28
            });
        }
        for (i = 0; i < 7; i++) {
            st.clouds.push({
                x: (seed ? D.hash(i * 7.3 + seed) : Math.random()) * 1.4,
                y: 0.08 + (seed ? D.hash(i * 3.3 + seed) : Math.random()) * 0.25,
                s: 0.6 + (seed ? D.hash(i * 9.1 + seed) : Math.random()) * 0.9,
                v: 0.004 + (seed ? D.hash(i * 1.9 + seed) : Math.random()) * 0.006
            });
        }
        return st;
    }

    function cloud(ctx, pal, x, y, r, a) {
        ctx.globalAlpha = a;
        ctx.fillStyle = pal.cloud;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, TAU);
        ctx.arc(x + r * 0.55, y - r * 0.2, r * 0.7, 0, TAU);
        ctx.arc(x + r * 1.2, y, r * 0.5, 0, TAU);
        ctx.rect(x, y, r * 1.2, r * 0.5);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // Slow ribbons of light for the frozen map's night.
    function aurora(ctx, v, night, now) {
        var bands = [['120,255,200', 0.17], ['90,200,255', 0.23], ['190,130,255', 0.29]];
        for (var b = 0; b < bands.length; b++) {
            var top = v.h * bands[b][1], rgb = bands[b][0];
            var g = ctx.createLinearGradient(0, top - 30, 0, top + v.h * 0.2);
            g.addColorStop(0, 'rgba(' + rgb + ',0)');
            g.addColorStop(0.35, 'rgba(' + rgb + ',' + (0.32 * night).toFixed(3) + ')');
            g.addColorStop(1, 'rgba(' + rgb + ',0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, top + v.h * 0.2);
            for (var x = 0; x <= v.w + 10; x += 10) {
                ctx.lineTo(x, top + Math.sin(x * 0.008 + now * 0.0004 + b * 1.7) * 22 + Math.sin(x * 0.021 + now * 0.0007 + b) * 8);
            }
            ctx.lineTo(v.w + 10, top + v.h * 0.2);
            ctx.closePath();
            ctx.fill();
        }
    }

    function sky(ctx, v, pal, map, t, now, state) {
        var i;
        var g = ctx.createLinearGradient(0, 0, 0, v.h * 0.78);
        g.addColorStop(0, pal.skyTop);
        g.addColorStop(1, pal.skyBot);
        ctx.fillStyle = g;
        ctx.fillRect(-20, -20, v.w + 40, v.h + 40);

        var night = Math.max(0, t - 1);
        var dusk = Math.max(0, 1 - Math.abs(t - 1));

        // a glow hugging the horizon (lava light, neon haze)
        if (map.glow) {
            var hg = ctx.createLinearGradient(0, v.groundY - v.h * 0.45, 0, v.groundY);
            hg.addColorStop(0, pal.accent + '00');
            hg.addColorStop(1, pal.accent + '55');
            ctx.fillStyle = hg;
            ctx.fillRect(0, v.groundY - v.h * 0.45, v.w, v.h * 0.45);
        }

        if (night > 0.01 && map.stars !== false) {
            for (i = 0; i < state.stars.length; i++) {
                var st = state.stars[i];
                ctx.globalAlpha = night * (0.55 + 0.45 * Math.sin(now * 0.002 + st.p));
                ctx.fillStyle = '#fff6d6';
                ctx.beginPath();
                ctx.arc(st.x * v.w, st.y * v.h, st.r, 0, TAU);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        if (map.aurora && night > 0.01) aurora(ctx, v, night, now);

        var r = v.mini ? Math.max(9, Math.min(v.w, v.h) * 0.1) : Math.max(26, Math.min(v.w, v.h) * 0.07);
        var sun = map.sun;
        if (sun) {
            var sx = v.w * (sun.x || 0.76);
            var rr = r * (sun.size || 1);
            var sunY = v.h * (0.2 + 0.28 * clamp(t, 0, 1));
            var sunA = sun.stay ? 1 : (t < 1 ? 1 : Math.max(0, 2 - t - 0.2));
            if (sunA > 0.01) {
                var col = t > 1.4 && sun.night ? sun.night : (dusk > 0.4 ? sun.dusk : sun.color);
                ctx.globalAlpha = sunA;
                var sg = ctx.createRadialGradient(sx, sunY, rr * 0.2, sx, sunY, rr * 2.6);
                sg.addColorStop(0, col + 'e6');
                sg.addColorStop(1, col + '00');
                ctx.fillStyle = sg;
                ctx.fillRect(sx - rr * 3, sunY - rr * 3, rr * 6, rr * 6);
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(sx, sunY, rr, 0, TAU);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }
        if (night > 0.01 && map.moon !== false) {
            var mx = v.w * 0.8, my = v.h * 0.18 + (1 - night) * 40;
            ctx.globalAlpha = night;
            ctx.fillStyle = '#f4efd2';
            ctx.beginPath();
            ctx.arc(mx, my, r * 0.8, 0, TAU);
            ctx.fill();
            ctx.fillStyle = 'rgba(190,185,150,.45)';
            [[-0.25, -0.2, 0.2], [0.2, 0.15, 0.28], [-0.1, 0.35, 0.13]].forEach(function (k) {
                ctx.beginPath();
                ctx.arc(mx + k[0] * r, my + k[1] * r, k[2] * r * 0.8, 0, TAU);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
        }

        var cloudA = 1 - Math.min(1, night * 0.75);
        var n = map.clouds == null ? 7 : map.clouds;
        var cdt = state.last ? Math.min(now - state.last, 50) : 16;
        state.last = now;
        for (i = 0; i < n; i++) {
            var cl = state.clouds[i];
            cl.x += cl.v * cdt / 1000;
            if (cl.x > 1.25) cl.x = -0.25;
            cloud(ctx, pal, cl.x * v.w, cl.y * v.h, 34 * cl.s * (v.s + 0.4), cloudA * 0.85);
        }
    }

    // --- ridges ----------------------------------------------------------------

    // Height of a ridge at screen-space position p, roughly -1..1.
    function ridge(L, p) {
        var x = p * L.f + L.seed;
        switch (L.shape) {
            case 'peaks':
                return ((1 - Math.abs(Math.sin(x))) * 0.8 + (1 - Math.abs(Math.sin(x * 2.1 + L.seed * 1.3))) * 0.3) * 1.6 - 0.9;
            case 'volcano': {
                var pk = ((1 - Math.abs(Math.sin(x))) * 0.8 + (1 - Math.abs(Math.sin(x * 2.1 + L.seed * 1.3))) * 0.3) * 1.6 - 0.9;
                return Math.min(pk, 0.42); // flat crater rim
            }
            case 'mesa':
                return clamp(Math.sin(x) * 2.4, -1, 1) * 0.55 + Math.sin(x * 2.7 + L.seed) * 0.1;
            case 'dunes':
                return Math.sin(x) * 0.6 + Math.sin(x * 0.43 + L.seed * 2) * 0.4;
            default:
                return (Math.sin(x) + Math.sin(x * 2.3 + L.seed * 1.7) * 0.5) * 0.6;
        }
    }

    function skyline(ctx, v, pal, L, scroll, ly, s, lit) {
        var cw = L.cell * s;
        var first = Math.floor(scroll / cw) - 1;
        var count = Math.ceil(v.w / cw) + 3;
        var i, bx, bw, bh;
        ctx.fillStyle = pal[L.color];
        for (i = first; i < first + count; i++) {
            bw = cw * (0.6 + 0.32 * D.hash(i * 3.1 + L.seed));
            bh = (L.minH + D.hash(i * 1.7 + L.seed) * L.amp) * s;
            bx = i * cw - scroll;
            ctx.fillRect(bx, ly - bh, bw, v.h - (ly - bh) + 2);
            if (D.hash(i * 6.1 + L.seed) > 0.78) ctx.fillRect(bx + bw * 0.45, ly - bh - 9 * s, Math.max(1, 1.6 * s), 9 * s);
        }
        if (!L.windows) return;

        var warm = new Path2D(), cool = new Path2D(), signs = [];
        var ws = Math.max(1.4, 3 * s), gx = 6 * s, gy = 7.5 * s;
        for (i = first; i < first + count; i++) {
            bw = cw * (0.6 + 0.32 * D.hash(i * 3.1 + L.seed));
            bh = (L.minH + D.hash(i * 1.7 + L.seed) * L.amp) * s;
            bx = i * cw - scroll;
            var cols = Math.max(1, Math.floor((bw - gx * 0.6) / gx));
            var rows = Math.max(1, Math.floor((bh - 8 * s) / gy));
            for (var r = 0; r < rows; r++) {
                for (var c = 0; c < cols; c++) {
                    var h = D.hash(i * 13.7 + r * 7.3 + c * 3.9 + L.seed);
                    if (h > lit * 0.55) continue;
                    var wx = bx + gx * 0.5 + c * gx, wy = ly - bh + 6 * s + r * gy;
                    (h > lit * 0.2 ? warm : cool).rect(wx, wy, ws, ws * 1.3);
                }
            }
            if (L.neon && D.hash(i * 5.3 + L.seed) > 0.7) signs.push(bx, ly - bh, bw);
        }
        ctx.globalAlpha = 0.35 + 0.55 * lit;
        ctx.fillStyle = '#ffe08a';
        ctx.fill(warm);
        ctx.fillStyle = pal.accent;
        ctx.fill(cool);
        for (i = 0; i < signs.length; i += 3) ctx.fillRect(signs[i], signs[i + 1], signs[i + 2], Math.max(2, 2.6 * s));
        ctx.globalAlpha = 1;
    }

    // --- props that sit on a ridge -----------------------------------------------

    var PROPS = {
        pine: function (ctx, pal, tx, ty, h) {
            ctx.fillStyle = pal.tree;
            ctx.beginPath();
            ctx.moveTo(tx - h * 0.28, ty + 2); ctx.lineTo(tx, ty - h); ctx.lineTo(tx + h * 0.28, ty + 2);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(tx - h * 0.22, ty - h * 0.35); ctx.lineTo(tx, ty - h * 1.12); ctx.lineTo(tx + h * 0.22, ty - h * 0.35);
            ctx.fill();
        },
        icepine: function (ctx, pal, tx, ty, h) {
            PROPS.pine(ctx, pal, tx, ty, h);
            ctx.fillStyle = D.mix(pal.tree, '#ffffff', 0.78);
            ctx.beginPath();
            ctx.moveTo(tx - h * 0.1, ty - h * 0.72); ctx.lineTo(tx, ty - h); ctx.lineTo(tx + h * 0.1, ty - h * 0.72);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(tx - h * 0.07, ty - h * 0.84); ctx.lineTo(tx, ty - h * 1.12); ctx.lineTo(tx + h * 0.07, ty - h * 0.84);
            ctx.fill();
        },
        blossom: function (ctx, pal, tx, ty, h) {
            ctx.fillStyle = D.mix(pal.near, '#000000', 0.45);
            ctx.fillRect(tx - h * 0.05, ty - h * 0.55, h * 0.1, h * 0.6);
            var pts = [[0, -0.7, 0.3], [-0.26, -0.55, 0.22], [0.26, -0.58, 0.24], [0.04, -0.95, 0.21]];
            ctx.fillStyle = pal.accent;
            pts.forEach(function (k) { ctx.beginPath(); ctx.arc(tx + k[0] * h, ty + k[1] * h, k[2] * h, 0, TAU); ctx.fill(); });
            ctx.fillStyle = D.mix(pal.accent, '#ffffff', 0.45);
            pts.forEach(function (k) { ctx.beginPath(); ctx.arc(tx + k[0] * h - k[2] * h * 0.3, ty + k[1] * h - k[2] * h * 0.3, k[2] * h * 0.42, 0, TAU); ctx.fill(); });
        },
        cactus: function (ctx, pal, tx, ty, h) {
            var w = Math.max(2, h * 0.2);
            ctx.strokeStyle = pal.tree;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = w;
            ctx.beginPath(); ctx.moveTo(tx, ty + 2); ctx.lineTo(tx, ty - h + w / 2); ctx.stroke();
            ctx.lineWidth = w * 0.8;
            ctx.beginPath();
            ctx.moveTo(tx, ty - h * 0.4); ctx.lineTo(tx - w * 1.4, ty - h * 0.4); ctx.lineTo(tx - w * 1.4, ty - h * 0.7);
            ctx.moveTo(tx, ty - h * 0.55); ctx.lineTo(tx + w * 1.3, ty - h * 0.55); ctx.lineTo(tx + w * 1.3, ty - h * 0.82);
            ctx.stroke();
        },
        pagoda: function (ctx, pal, tx, ty, h) {
            ctx.fillStyle = pal.tree;
            for (var k = 0; k < 3; k++) {
                var tw = h * 0.62 * (1 - k * 0.2), y = ty - k * h * 0.3;
                ctx.fillRect(tx - tw * 0.3, y - h * 0.2, tw * 0.6, h * 0.2);
                ctx.beginPath();
                ctx.moveTo(tx - tw * 0.6, y - h * 0.19);
                ctx.lineTo(tx - tw * 0.3, y - h * 0.3);
                ctx.lineTo(tx + tw * 0.3, y - h * 0.3);
                ctx.lineTo(tx + tw * 0.6, y - h * 0.19);
                ctx.quadraticCurveTo(tx, y - h * 0.23, tx - tw * 0.6, y - h * 0.19);
                ctx.fill();
            }
            ctx.fillRect(tx - 1, ty - h * 1.08, 2, h * 0.2);
        },
        spire: function (ctx, pal, tx, ty, h) {
            ctx.fillStyle = pal.tree;
            ctx.beginPath();
            ctx.moveTo(tx - h * 0.25, ty + 2); ctx.lineTo(tx - h * 0.08, ty - h * 0.7); ctx.lineTo(tx + h * 0.02, ty - h * 0.45);
            ctx.lineTo(tx + h * 0.1, ty - h); ctx.lineTo(tx + h * 0.28, ty + 2);
            ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = pal.accent;
            ctx.beginPath(); ctx.arc(tx + h * 0.1, ty - h, h * 0.07, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
        }
    };

    // Three parallax layers per map. Their sizes are in world units; s scales them.
    function hills(ctx, v, pal, map, offset, t) {
        var s = v.s, base = v.groundY;
        var lit = 0.15 + 0.85 * clamp((t - 0.3) / 1.4, 0, 1);

        map.layers.forEach(function (L) {
            var scroll = offset * s * L.k;
            var ly = base - L.y * s;
            var color = pal[L.color];

            if (L.shape === 'skyline') {
                skyline(ctx, v, pal, L, scroll, ly, s, lit);
                return;
            }

            var step = L.shape === 'peaks' || L.shape === 'volcano' ? 3 : 6;
            ctx.beginPath();
            ctx.moveTo(0, v.h);
            for (var x = 0; x <= v.w + step; x += step) ctx.lineTo(x, ly - ridge(L, x + scroll) * L.amp * s);
            ctx.lineTo(v.w + step, v.h);
            ctx.closePath();

            if (L.cap) {
                var g = ctx.createLinearGradient(0, ly - L.amp * s * 0.9, 0, ly + L.amp * s * 0.9);
                var snow = D.mix(color, '#ffffff', 0.86);
                g.addColorStop(0, snow);
                g.addColorStop(0.36, snow);
                g.addColorStop(0.37, color);
                g.addColorStop(1, color);
                ctx.fillStyle = g;
            } else {
                ctx.fillStyle = color;
            }
            ctx.fill();

            if (L.prop) {
                var spacing = L.gap * s;
                var first = Math.floor(scroll / spacing) - 1;
                var count = Math.ceil(v.w / spacing) + 3;
                var draw = PROPS[L.prop];
                for (var i = first; i < first + count; i++) {
                    if (D.hash(i + 3.3 + L.seed) < L.skip) continue;
                    var tx = i * spacing - scroll + (D.hash(i + L.seed) - 0.5) * spacing * 0.6;
                    var ty = ly - ridge(L, tx + scroll) * L.amp * s;
                    var h = (L.size[0] + D.hash(i * 7.1 + L.seed) * (L.size[1] - L.size[0])) * s;
                    draw(ctx, pal, tx, ty, h);
                }
            }
        });
    }

    // --- pillars ------------------------------------------------------------------

    // Pillar body in world units: top edge at y = 0, extends down `depth`.
    function pillar(ctx, style, pal, x, w, depth) {
        var y;
        ctx.fillStyle = pal.pillar;
        ctx.fillRect(x, 0, w, depth);
        ctx.fillStyle = pal.rim;
        ctx.fillRect(x, 0, 3, depth);
        ctx.fillRect(x, 0, w, 3);

        switch (style) {
            case 'lacquer':
                ctx.fillStyle = 'rgba(255,255,255,.07)';
                ctx.fillRect(x + w * 0.3, 3, 3, depth);
                ctx.fillRect(x + w * 0.72, 3, 1.5, depth);
                ctx.fillStyle = 'rgba(232,184,74,.85)';
                for (y = 6; y < depth; y += 44) {
                    ctx.fillRect(x, y, w, 3);
                    ctx.fillStyle = 'rgba(0,0,0,.2)';
                    ctx.fillRect(x, y + 3, w, 1.5);
                    ctx.fillStyle = 'rgba(232,184,74,.85)';
                }
                break;
            case 'sandstone':
                for (y = 12; y < depth; y += 15) {
                    var hh = 4 + D.hash(x + y) * 6;
                    ctx.fillStyle = D.hash(y * 1.7 + x) > 0.5 ? 'rgba(255,214,150,.13)' : 'rgba(60,20,0,.18)';
                    ctx.fillRect(x + 3, y, w - 3, hh);
                }
                ctx.fillStyle = 'rgba(40,12,0,.25)';
                for (y = 20; y < depth; y += 38) {
                    ctx.beginPath();
                    ctx.ellipse(x + 6 + D.hash(x + y * 3) * (w - 14), y, 2.6, 1.6, 0, 0, TAU);
                    ctx.fill();
                }
                break;
            case 'ice':
                ctx.fillStyle = 'rgba(255,255,255,.09)';
                ctx.fillRect(x + 3, 3, w * 0.34, depth);
                ctx.strokeStyle = 'rgba(255,255,255,.22)';
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                for (y = 14; y < depth; y += 34) {
                    var gx = x + 6 + D.hash(x + y) * (w - 18);
                    ctx.moveTo(gx, y); ctx.lineTo(gx + 8, y - 9);
                }
                ctx.stroke();
                // snow cap with icicles
                ctx.fillStyle = '#f2f8ff';
                ctx.fillRect(x, 0, w, 4);
                for (var ix = x + 3; ix < x + w - 3; ix += 7) {
                    ctx.fillRect(ix, 4, 3, 2 + D.hash(ix) * 6);
                }
                break;
            case 'neon':
                ctx.fillStyle = 'rgba(255,255,255,.05)';
                for (y = 18; y < depth; y += 22) ctx.fillRect(x + 3, y, w - 3, 1.5);
                ctx.fillRect(x + w / 2, 3, 1.5, depth);
                ctx.fillStyle = 'rgba(255,255,255,.14)';
                for (y = 12; y < depth; y += 44) {
                    ctx.fillRect(x + 6, y, 2, 2);
                    ctx.fillRect(x + w - 8, y, 2, 2);
                }
                ctx.globalAlpha = 0.28;
                ctx.fillStyle = pal.accent;
                ctx.fillRect(x - 1, 0, w + 2, 6);
                ctx.globalAlpha = 1;
                ctx.fillRect(x, 0, w, 2.2);
                ctx.fillRect(x, 0, 2.2, depth);
                break;
            case 'basalt':
                ctx.fillStyle = 'rgba(0,0,0,.34)';
                for (var cx = x + 9; cx < x + w - 2; cx += 9) ctx.fillRect(cx, 3, 1.5, depth);
                ctx.strokeStyle = pal.accent;
                ctx.globalAlpha = 0.8;
                ctx.lineWidth = 1.3;
                ctx.lineJoin = 'round';
                ctx.beginPath();
                for (y = 16; y < depth; y += 40) {
                    var sx = x + 5 + D.hash(x + y) * (w - 12);
                    ctx.moveTo(sx, y); ctx.lineTo(sx + 4, y + 7); ctx.lineTo(sx - 1, y + 13); ctx.lineTo(sx + 3, y + 20);
                }
                ctx.stroke();
                ctx.globalAlpha = 0.65;
                ctx.fillStyle = pal.accent;
                ctx.fillRect(x, 0, w, 2);
                ctx.globalAlpha = 1;
                break;
            default: // brick
                ctx.fillStyle = 'rgba(255,255,255,.05)';
                for (y = 14; y < depth; y += 18) ctx.fillRect(x + 3, y, w - 3, 1.5);
                ctx.fillStyle = 'rgba(0,0,0,.18)';
                for (var y2 = 14; y2 < depth; y2 += 18) {
                    ctx.fillRect(x + 3 + D.hash(x + y2) * (w - 8), y2 - 18 + 1.5, 1.5, 16.5);
                }
        }
    }

    // --- weather ------------------------------------------------------------------

    var COUNTS = { petals: 26, snow: 80, embers: 38, dust: 26, rain: 110, fireflies: 16 };

    function spawn(kind, w, h, anywhere) {
        var p = { x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 2, p: Math.random() * TAU, a: 0.45 + Math.random() * 0.5 };
        if (!anywhere) {
            if (kind === 'petals' || kind === 'snow') { p.y = -10; p.x = Math.random() * w * 1.2 - w * 0.2; }
            else if (kind === 'rain') { p.y = -20; p.x = Math.random() * w * 1.2; }
            else if (kind === 'embers') { p.y = h + 10; }
            else if (kind === 'dust') { p.x = -20; }
        } else if (kind === 'embers') {
            p.y = h * (0.35 + Math.random() * 0.65);
        }
        if (kind === 'rain') { p.vy = 0.55 + Math.random() * 0.35; p.len = 9 + Math.random() * 9; }
        return p;
    }

    function Weather() { this.kind = null; this.list = []; this.w = 0; this.h = 0; }

    Weather.prototype.step = function (kind, w, h, dt, night) {
        var i, p;
        if (kind !== this.kind || w !== this.w || h !== this.h) {
            this.kind = kind; this.w = w; this.h = h; this.list = [];
            var n = Math.round((COUNTS[kind] || 0) * clamp(w * h / (1280 * 720), 0.35, 1.25));
            for (i = 0; i < n; i++) this.list.push(spawn(kind, w, h, true));
        }
        for (i = 0; i < this.list.length; i++) {
            p = this.list[i];
            p.p += dt * 0.002;
            switch (kind) {
                case 'petals':
                    p.x += (0.03 + Math.sin(p.p) * 0.03) * dt;
                    p.y += (0.03 + p.r * 0.01) * dt;
                    break;
                case 'snow':
                    p.x += (Math.sin(p.p) * 0.012 - 0.008) * dt;
                    p.y += (0.035 + p.r * 0.02) * dt;
                    break;
                case 'embers':
                    p.x += Math.sin(p.p * 1.4) * 0.02 * dt;
                    p.y -= (0.035 + p.r * 0.018) * dt;
                    break;
                case 'dust':
                    p.x += (0.09 + p.r * 0.03) * dt;
                    p.y += Math.sin(p.p) * 0.008 * dt;
                    break;
                case 'rain':
                    p.x -= 0.14 * dt;
                    p.y += p.vy * dt;
                    break;
                case 'fireflies':
                    p.x += Math.cos(p.p * 1.3) * 0.015 * dt;
                    p.y += Math.sin(p.p) * 0.012 * dt;
                    if (p.x < 0) p.x += w; else if (p.x > w) p.x -= w;
                    if (p.y < h * 0.25) p.y = h * 0.25; else if (p.y > h * 0.9) p.y = h * 0.9;
                    break;
            }
            if (kind !== 'fireflies' && (p.y > h + 24 || p.y < -30 || p.x > w + 24 || p.x < -30)) {
                this.list[i] = spawn(kind, w, h, false);
            }
        }
    };

    Weather.prototype.draw = function (ctx, now, night) {
        var kind = this.kind, i, p;
        if (!kind) return;
        if (kind === 'fireflies' && night < 0.05) return;

        if (kind === 'rain') {
            ctx.strokeStyle = 'rgba(170,220,255,.32)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (i = 0; i < this.list.length; i++) {
                p = this.list[i];
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - p.len * 0.2, p.y + p.len);
            }
            ctx.stroke();
            return;
        }

        for (i = 0; i < this.list.length; i++) {
            p = this.list[i];
            if (kind === 'petals') {
                ctx.globalAlpha = p.a;
                ctx.fillStyle = p.r > 1.8 ? '#ffb7c8' : '#ffe3ea';
                ctx.beginPath();
                ctx.ellipse(p.x, p.y, p.r * 2.2, p.r * 1.2, p.p * 2, 0, TAU);
                ctx.fill();
            } else if (kind === 'snow') {
                ctx.globalAlpha = p.a * 0.9;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * 0.9, 0, TAU);
                ctx.fill();
            } else if (kind === 'embers') {
                ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(now * 0.01 + p.p * 5)) * clamp(p.y / (this.h * 0.4), 0, 1);
                ctx.fillStyle = p.r > 1.6 ? '#ffb347' : '#ff6a1a';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * 0.8, 0, TAU);
                ctx.fill();
            } else if (kind === 'dust') {
                ctx.globalAlpha = p.a * 0.5;
                ctx.fillStyle = '#ffe4b4';
                ctx.fillRect(p.x, p.y, p.r * 5, 1.2);
            } else if (kind === 'fireflies') {
                var a = night * (0.5 + 0.5 * Math.sin(now * 0.004 + p.p * 3));
                ctx.globalAlpha = a * 0.25;
                ctx.fillStyle = '#e8ff7a';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * 3.2, 0, TAU);
                ctx.fill();
                ctx.globalAlpha = a;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * 0.9, 0, TAU);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    };

    // --- armory card preview ----------------------------------------------------------

    var previewState = newState(11);

    // A slice of the map with two pillars and the equipped hero. The sky cycles
    // slowly through day, dusk and night so every card shows all three looks.
    function preview(canvas, map, now, heroSkin) {
        var c = D.prepare(canvas), ctx = c.ctx;
        var u = (now / 4500) % 4;
        var t = u < 1 ? 0 : u < 2 ? (u - 1) * 2 : u < 3 ? 2 : 2 - (u - 3) * 2;
        var s = Math.max(0.34, c.h / 250);
        var v = { w: c.w, h: c.h, s: s, groundY: Math.round(c.h * 0.78), originX: 0, mini: true };
        var pal = palette(map, t);

        sky(ctx, v, pal, map, t, now, previewState);
        hills(ctx, v, pal, map, now * 0.02, t);

        ctx.save();
        ctx.translate(0, v.groundY);
        ctx.scale(s, s);
        var depth = (c.h - v.groundY) / s + 10;
        pillar(ctx, map.pillar, pal, -10, 64, depth);
        var rx = c.w / s - 46;
        pillar(ctx, map.pillar, pal, rx, 60, depth);
        if (heroSkin) D.hero(ctx, heroSkin, { x: 24, y: 0, t: now, phase: null, scale: 1 });
        ctx.restore();
    }

    SH.scenery = {
        KEYS: KEYS,
        palette: palette,
        newState: newState,
        sky: sky,
        hills: hills,
        pillar: pillar,
        Weather: Weather,
        preview: preview
    };
})(typeof window !== 'undefined' ? window : globalThis);