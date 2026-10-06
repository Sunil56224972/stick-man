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

    function Renderer(canvas, opts) {
        this.canvas = canvas;
        this.mini = !!(opts && opts.mini);   // small spectator panel: fit the world, no weather
        this.themeT = 0;          // 0 day, 1 dusk, 2 night (animated)
        this.palette = {};
        this.particles = [];
        this.texts = [];
        this.shakeMag = 0;
        this.view = { s: 1, originX: 0, groundY: 0, w: 0, h: 0 };
        this.lastNow = 0;

        this.scene = SH.scenery.newState();
        this.weather = new SH.scenery.Weather();
        this.map = SH.maps[0];
    }

    // --- layout ---------------------------------------------------------------

    Renderer.prototype.layout = function (w, h) {
        // World is ~450 units wide when a long gap is on screen; fit that, but
        // cap the zoom so wide monitors do not blow the art up too far.
        if (this.mini) {
            var g = Math.round(h * 0.8), ms = Math.max(0.12, Math.min(w / 330, g / 150));
            this.view = { s: ms, w: w, h: h, groundY: g, originX: 6, mini: true };
            return;
        }
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
        this.palette = SH.scenery.palette(this.map, this.themeT);
    };
    // --- main entry -----------------------------------------------------------

    Renderer.prototype.render = function (game, now, skins) {
        var dt = this.lastNow ? Math.min(now - this.lastNow, 50) : 16;
        this.lastNow = now;

        var c = D.prepare(this.canvas);
        var ctx = c.ctx;
        if (c.w !== this.view.w || c.h !== this.view.h) this.layout(c.w, c.h);

        this.map = skins.map || SH.maps[0];
        this._stepTheme(game.score, dt);
        this._stepFx(dt);

        var v = this.view, pal = this.palette, s = v.s;
        ctx.save();
        if (this.shakeMag > 0) {
            ctx.translate((Math.random() - 0.5) * this.shakeMag, (Math.random() - 0.5) * this.shakeMag);
        }

        SH.scenery.sky(ctx, v, pal, this.map, this.themeT, now, this.scene);
        SH.scenery.hills(ctx, v, pal, this.map, game.offset, this.themeT);

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

        // weather falls in front of the scene, behind the HUD
        var night = Math.max(0, this.themeT - 1);
        if (!this.mini) {
            this.weather.step(this.map.weather, v.w, v.h, dt, night);
            this.weather.draw(ctx, now, night);
        }

        ctx.restore();
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
        var style = this.map.pillar;

        game.platforms.forEach(function (p) {
            if (p.x + p.w < left || p.x > right) return;
            SH.scenery.pillar(ctx, style, pal, p.x, p.w, depth);

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

        if (game.phase === 'walking') phase = game.walkDist * Math.PI / SH.Game.C.STEP_DIST;
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