/*
 * Stick Hero - scene renderer.
 *
 * Reads a Game and paints it: parallax sky, hills, pillars, stick, hero,
 * cherries and particles. Owns all purely visual state (theme blend, camera
 * shake, particles, floating text) so the simulation stays clean.
 */
(function (root) {
    'use strict';
    var SH = (root.SH = root.SH || {});
    var D = SH.draw;

    // Day, dusk and night palettes. The renderer blends between neighbours.
    var THEMES = [
        { skyTop: '#8fd3e8', skyBot: '#fdf0d5', far: '#b9d9c8', mid: '#8fc487', near: '#62a76d',
          pillar: '#2a2540', rim: '#4a4466', tree: '#3f8a5a', cloud: '#ffffff', mist: '#1d1b2b' },
        { skyTop: '#ef8a5c', skyBot: '#ffe2a9', far: '#e0a58f', mid: '#c06a6e', near: '#8f4d66',
          pillar: '#2c2036', rim: '#5a3f58', tree: '#6d3f5c', cloud: '#ffd3b0', mist: '#2a1830' },
        { skyTop: '#0e1330', skyBot: '#383a72', far: '#2d3563', mid: '#242b55', near: '#1b2147',
          pillar: '#12152b', rim: '#2f3566', tree: '#171c3d', cloud: '#5b5f9c', mist: '#070a1c' }
    ];

    var KEYS = ['skyTop', 'skyBot', 'far', 'mid', 'near', 'pillar', 'rim', 'tree', 'cloud', 'mist'];

    function Renderer(canvas) {
        this.canvas = canvas;
        this.themeT = 0;          // 0 day, 1 dusk, 2 night (animated)
        this.palette = {};
        this.particles = [];
        this.texts = [];
        this.shakeMag = 0;
        this.view = { s: 1, originX: 0, groundY: 0, w: 0, h: 0 };
        this.lastNow = 0;

        var i;
        this.stars = [];
        for (i = 0; i < 70; i++) {
            this.stars.push({ x: Math.random(), y: Math.random() * 0.55, r: Math.random() * 1.3 + 0.4, p: Math.random() * 6.28 });
        }
        this.clouds = [];
        for (i = 0; i < 7; i++) {
            this.clouds.push({ x: Math.random() * 1.4, y: 0.08 + Math.random() * 0.25, s: 0.6 + Math.random() * 0.9, v: 0.004 + Math.random() * 0.006 });
        }
    }

    // --- layout ---------------------------------------------------------------

    Renderer.prototype.layout = function (w, h) {
        // World is ~450 units wide when a long gap is on screen; fit that, but
        // cap the zoom so wide monitors do not blow the art up too far.
        var short = h < 480;                       // phone held sideways
        var ground = Math.round(h * (short ? 0.74 : 0.6));
        var s = short ? Math.min(w / 460, (ground - 52) / 320) : Math.min(w / 460, h / 520, 1.5);
        s = Math.max(s, 0.5);
        var v = this.view;
        v.s = s;
        v.w = w;
        v.h = h;
        v.originX = Math.max(8, (w - 440 * s) / 2);
        v.groundY = ground;
    };

    Renderer.prototype.worldToScreenX = function (x, offset) {
        return this.view.originX + (x - offset) * this.view.s;
    };

    // --- effects --------------------------------------------------------------

    Renderer.prototype.shake = function (mag) { this.shakeMag = Math.max(this.shakeMag, mag); };

    Renderer.prototype.burst = function (x, y, count, colors, power) {
        power = power || 1;
        for (var i = 0; i < count; i++) {
            var a = Math.random() * Math.PI * 2;
            var v = (0.05 + Math.random() * 0.22) * power;
            this.particles.push({
                x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.1 * power,
                r: 1.6 + Math.random() * 2.6, life: 1, decay: 0.0012 + Math.random() * 0.0014,
                color: colors[(Math.random() * colors.length) | 0], spin: Math.random() * 6
            });
        }
    };

    Renderer.prototype.dust = function (x, y, count) {
        for (var i = 0; i < count; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 8, y: y, vx: (Math.random() - 0.5) * 0.08, vy: -Math.random() * 0.06,
                r: 1.5 + Math.random() * 2, life: 0.7, decay: 0.0018, color: 'rgba(255,255,255,.55)', spin: 0, soft: true
            });
        }
    };

    Renderer.prototype.floatText = function (text, x, y, color, size) {
        this.texts.push({ text: text, x: x, y: y, life: 1, color: color || '#fff', size: size || 18 });
    };

    Renderer.prototype.clearFx = function () {
        this.particles.length = 0;
        this.texts.length = 0;
        this.shakeMag = 0;
    };

    Renderer.prototype._stepFx = function (dt) {
        var i, p;
        for (i = this.particles.length - 1; i >= 0; i--) {
            p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 0.0006 * dt;
            p.life -= p.decay * dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        for (i = this.texts.length - 1; i >= 0; i--) {
            p = this.texts[i];
            p.y -= 0.035 * dt;
            p.life -= 0.0011 * dt;
            if (p.life <= 0) this.texts.splice(i, 1);
        }
        this.shakeMag *= Math.pow(0.992, dt);
        if (this.shakeMag < 0.05) this.shakeMag = 0;
    };

    // --- theme ---------------------------------------------------------------

    Renderer.prototype._stepTheme = function (score, dt) {
        var target = score >= 20 ? 2 : score >= 10 ? 1 : 0;
        var d = target - this.themeT;
        var step = dt * 0.0006;
        this.themeT = Math.abs(d) <= step ? target : this.themeT + Math.sign(d) * step;

        var lo = Math.min(1, Math.floor(this.themeT));
        var f = this.themeT - lo;
        var a = THEMES[lo], b = THEMES[Math.min(2, lo + 1)];
        for (var i = 0; i < KEYS.length; i++) this.palette[KEYS[i]] = D.mix(a[KEYS[i]], b[KEYS[i]], f);
    };

    // --- main entry -----------------------------------------------------------

    Renderer.prototype.render = function (game, now, skins) {
        var dt = this.lastNow ? Math.min(now - this.lastNow, 50) : 16;
        this.lastNow = now;

        var c = D.prepare(this.canvas);
        var ctx = c.ctx;
        if (c.w !== this.view.w || c.h !== this.view.h) this.layout(c.w, c.h);

        this._stepTheme(game.score, dt);
        this._stepFx(dt);

        var v = this.view, pal = this.palette, s = v.s;
        ctx.save();
        if (this.shakeMag > 0) {
            ctx.translate((Math.random() - 0.5) * this.shakeMag, (Math.random() - 0.5) * this.shakeMag);
        }

        this._sky(ctx, now);
        this._hills(ctx, game.offset, now);

        // world space: origin at ground level, y up is negative
        ctx.save();
        ctx.translate(v.originX - game.offset * s, v.groundY);
        ctx.scale(s, s);

        this._abyss(ctx, game);
        this._pillars(ctx, game);
        this._cherries(ctx, game, now);
        this._sticks(ctx, game, skins.stick, now);
        this._hero(ctx, game, skins.hero, now);
        this._particles(ctx);
        this._texts(ctx);
        ctx.restore();

        ctx.restore();
    };

    Renderer.prototype._sky = function (ctx, now) {
        var v = this.view, pal = this.palette, i;
        var g = ctx.createLinearGradient(0, 0, 0, v.h * 0.78);
        g.addColorStop(0, pal.skyTop);
        g.addColorStop(1, pal.skyBot);
        ctx.fillStyle = g;
        ctx.fillRect(-20, -20, v.w + 40, v.h + 40);

        var t = this.themeT;
        var night = Math.max(0, t - 1);          // 0..1 as night arrives
        var dusk = 1 - Math.abs(t - 1);          // peaks at dusk
        dusk = Math.max(0, dusk);

        // stars
        if (night > 0.01) {
            for (i = 0; i < this.stars.length; i++) {
                var st = this.stars[i];
                var tw = 0.55 + 0.45 * Math.sin(now * 0.002 + st.p);
                ctx.globalAlpha = night * tw;
                ctx.fillStyle = '#fff6d6';
                ctx.beginPath();
                ctx.arc(st.x * v.w, st.y * v.h, st.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // sun slides down into dusk then disappears, moon rises for night
        var r = Math.max(26, Math.min(v.w, v.h) * 0.07);
        var sunY = v.h * (0.2 + 0.28 * Math.max(0, Math.min(1, t)));
        var sunA = t < 1 ? 1 : Math.max(0, 2 - t - 0.2);
        if (sunA > 0.01) {
            ctx.globalAlpha = sunA;
            var sg = ctx.createRadialGradient(v.w * 0.76, sunY, r * 0.2, v.w * 0.76, sunY, r * 2.6);
            sg.addColorStop(0, 'rgba(255,236,170,.9)');
            sg.addColorStop(1, 'rgba(255,236,170,0)');
            ctx.fillStyle = sg;
            ctx.fillRect(v.w * 0.76 - r * 3, sunY - r * 3, r * 6, r * 6);
            ctx.fillStyle = dusk > 0.4 ? '#ffd08a' : '#fff1b8';
            ctx.beginPath();
            ctx.arc(v.w * 0.76, sunY, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        if (night > 0.01) {
            var mx = v.w * 0.8, my = v.h * 0.18 + (1 - night) * 40;
            ctx.globalAlpha = night;
            ctx.fillStyle = '#f4efd2';
            ctx.beginPath();
            ctx.arc(mx, my, r * 0.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(190,185,150,.45)';
            [[-0.25, -0.2, 0.2], [0.2, 0.15, 0.28], [-0.1, 0.35, 0.13]].forEach(function (k) {
                ctx.beginPath();
                ctx.arc(mx + k[0] * r, my + k[1] * r, k[2] * r * 0.8, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
        }

        // clouds
        var cloudA = 1 - Math.min(1, night * 0.75);
        for (i = 0; i < this.clouds.length; i++) {
            var cl = this.clouds[i];
            cl.x += cl.v * 0.016;
            if (cl.x > 1.25) cl.x = -0.25;
            this._cloud(ctx, cl.x * v.w, cl.y * v.h, 34 * cl.s * (v.s + 0.4), cloudA * 0.85);
        }
    };

    Renderer.prototype._cloud = function (ctx, x, y, r, a) {
        ctx.globalAlpha = a;
        ctx.fillStyle = this.palette.cloud;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
        ctx.arc(x + r * 0.55, y - r * 0.2, r * 0.7, 0, Math.PI * 2);
        ctx.arc(x + r * 1.2, y, r * 0.5, 0, Math.PI * 2);
        ctx.rect(x, y, r * 1.2, r * 0.5);
        ctx.fill();
        ctx.globalAlpha = 1;
    };

    // Three parallax ridges plus pine trees on the nearest one.
    Renderer.prototype._hills = function (ctx, offset, now) {
        var v = this.view, pal = this.palette, s = v.s;
        var base = v.groundY;
        var layers = [
            { color: pal.far, y: base - 70 * s, amp: 34 * s, f: 0.011, k: 0.08, seed: 0.0 },
            { color: pal.mid, y: base - 36 * s, amp: 24 * s, f: 0.017, k: 0.16, seed: 2.1 },
            { color: pal.near, y: base - 10 * s, amp: 14 * s, f: 0.026, k: 0.3, seed: 4.3 }
        ];
        layers.forEach(function (L, idx) {
            var scroll = offset * s * L.k;
            ctx.beginPath();
            ctx.moveTo(0, v.h);
            for (var x = 0; x <= v.w + 6; x += 6) {
                var p = x + scroll;
                var y = L.y - (Math.sin(p * L.f + L.seed) + Math.sin(p * L.f * 2.3 + L.seed * 1.7) * 0.5) * L.amp * 0.6;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(v.w + 6, v.h);
            ctx.closePath();
            ctx.fillStyle = L.color;
            ctx.fill();

            if (idx === 2) {
                // pines sit on the near ridge at stable hashed positions
                var spacing = 46 * s;
                var first = Math.floor(scroll / spacing) - 1;
                var count = Math.ceil(v.w / spacing) + 3;
                for (var i = first; i < first + count; i++) {
                    if (D.hash(i + 3.3) < 0.35) continue;
                    var tx = i * spacing - scroll + (D.hash(i) - 0.5) * spacing * 0.6;
                    var p2 = tx + scroll;
                    var ty = L.y - (Math.sin(p2 * L.f + L.seed) + Math.sin(p2 * L.f * 2.3 + L.seed * 1.7) * 0.5) * L.amp * 0.6;
                    var h = (22 + D.hash(i * 7.1) * 22) * s;
                    ctx.fillStyle = pal.tree;
                    ctx.beginPath();
                    ctx.moveTo(tx - h * 0.28, ty + 2);
                    ctx.lineTo(tx, ty - h);
                    ctx.lineTo(tx + h * 0.28, ty + 2);
                    ctx.closePath();
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(tx - h * 0.22, ty - h * 0.35);
                    ctx.lineTo(tx, ty - h * 1.12);
                    ctx.lineTo(tx + h * 0.22, ty - h * 0.35);
                    ctx.fill();
                }
            }
        });
    };

    // Darkens the chasm below ground so cherries and the hanging hero read well.
    Renderer.prototype._abyss = function (ctx, game) {
        var v = this.view, s = v.s;
        var left = game.offset - v.originX / s - 20;
        var width = v.w / s + 40;
        var depth = (v.h - v.groundY) / s + 20;
        var g = ctx.createLinearGradient(0, 0, 0, depth);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.15, this.palette.mist + '55');
        g.addColorStop(1, this.palette.mist + 'dd');
        ctx.fillStyle = g;
        ctx.fillRect(left, 0, width, depth);
    };

    Renderer.prototype._pillars = function (ctx, game) {
        var v = this.view, pal = this.palette, s = v.s;
        var depth = (v.h - v.groundY) / s + 40;
        var left = game.offset - v.originX / s - 100;
        var right = left + v.w / s + 200;
        var stickRoot = game.currentStick().x;

        game.platforms.forEach(function (p) {
            if (p.x + p.w < left || p.x > right) return;
            ctx.fillStyle = pal.pillar;
            ctx.fillRect(p.x, 0, p.w, depth);

            // lit left edge and top lip
            ctx.fillStyle = pal.rim;
            ctx.fillRect(p.x, 0, 3, depth);
            ctx.fillRect(p.x, 0, p.w, 3);

            // brick courses, deterministic per platform
            ctx.fillStyle = 'rgba(255,255,255,.05)';
            for (var y = 14; y < depth; y += 18) ctx.fillRect(p.x + 3, y, p.w - 3, 1.5);
            ctx.fillStyle = 'rgba(0,0,0,.18)';
            for (var y2 = 14; y2 < depth; y2 += 18) {
                var off = D.hash(p.x + y2) * (p.w - 8);
                ctx.fillRect(p.x + 3 + off, y2 - 18 + 1.5, 1.5, 16.5);
            }

            // red landing target on platforms still ahead
            if (p.x > stickRoot) {
                var cx = p.x + p.w / 2 - 5;
                ctx.fillStyle = '#e4472f';
                ctx.fillRect(cx, 0, 10, 5);
                ctx.fillStyle = 'rgba(255,255,255,.55)';
                ctx.fillRect(cx + 4, 0, 2, 5);
            }
        });
    };

    Renderer.prototype._cherries = function (ctx, game, now) {
        var left = game.offset - 40, right = game.offset + this.view.w / this.view.s + 40;
        game.cherries.forEach(function (c) {
            if (c.taken || c.x < left || c.x > right) return;
            // soft glow so they pop against the chasm
            var g = ctx.createRadialGradient(c.x, 22, 2, c.x, 22, 20);
            g.addColorStop(0, 'rgba(255,214,120,.45)');
            g.addColorStop(1, 'rgba(255,214,120,0)');
            ctx.fillStyle = g;
            ctx.fillRect(c.x - 20, 2, 40, 40);
            D.cherry(ctx, c.x, 22, now, 1.15);
        });
    };

    Renderer.prototype._sticks = function (ctx, game, style, now) {
        var h = D.STICK_W / 2;
        game.sticks.forEach(function (st) {
            if (st.length <= 0) return;
            ctx.save();
            ctx.translate(st.x, -h);
            ctx.rotate(st.rotation * Math.PI / 180);
            D.stick(ctx, style.style, st.length, now);
            ctx.restore();
        });
    };

    Renderer.prototype._hero = function (ctx, game, skin, now) {
        var st = game.currentStick();
        var y = 0, phase = null, rot = 0, squash = 1;

        // stand on the stick once past the platform edge
        var lift = 0;
        if (game.phase === 'walking' || game.phase === 'falling') {
            lift = Math.max(0, Math.min(1, (game.heroX - st.x + 2) / 4)) * D.STICK_W;
            if (game.target) {
                var drop = Math.max(0, Math.min(1, (game.heroX - game.target.x + 2) / 4));
                lift *= 1 - drop;
            }
        }

        if (game.phase === 'walking') phase = game.walkDist * 0.2;
        if (game.phase === 'stretching') squash = 0.93;
        if (game.phase === 'falling') {
            y = game.heroY;
            rot = game.fallTimer * (game.fallKind === 'pillar' ? -0.006 : 0.005);
            lift = game.fallKind === 'pillar' ? 0 : lift;
        }

        // hanging hero hangs from the stick's underside, so no lift
        var flip = game.flipped;
        D.hero(ctx, skin, {
            x: game.heroX, y: flip ? y + 1 : y - lift, t: now,
            phase: phase, flip: flip, rot: rot, squash: squash
        });
    };

    Renderer.prototype._particles = function (ctx) {
        for (var i = 0; i < this.particles.length; i++) {
            var p = this.particles[i];
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            if (p.soft) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * (1.5 - p.life), 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.spin + p.life * 5);
                ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;
    };

    Renderer.prototype._texts = function (ctx) {
        ctx.textAlign = 'center';
        for (var i = 0; i < this.texts.length; i++) {
            var t = this.texts[i];
            ctx.globalAlpha = Math.min(1, t.life * 1.6);
            ctx.font = t.size + 'px "Lilita One", "Nunito", sans-serif';
            ctx.lineWidth = 4;
            ctx.strokeStyle = D.INK;
            ctx.lineJoin = 'round';
            ctx.strokeText(t.text, t.x, t.y);
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, t.x, t.y);
        }
        ctx.globalAlpha = 1;
    };

    SH.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);