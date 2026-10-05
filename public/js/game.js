/*
 * Stick Hero - game simulation.
 *
 * Pure logic: no DOM, no canvas, no audio. The renderer reads the public
 * fields, the UI listens to events. That keeps the rules testable in Node.
 *
 * Units are world pixels and milliseconds. The ground line is y = 0 and
 * everything that matters sits on it; the renderer decides where that is
 * on screen.
 */
(function (root) {
    'use strict';
    var SH = (root.SH = root.SH || {});

    var C = {
        START_X: 50,
        START_W: 50,
        HERO_EDGE: 10,        // how far in from a platform edge the hero stops
        HERO_HALF: 8,         // half of the hero's body width
        PERFECT: 10,          // width of the red target on each platform
        STRETCH: 0.25,        // px of stick per ms while holding
        TURN: 0.25,           // degrees per ms while the stick drops
        WALK: 0.26,           // px per ms
        STICK_MAX: 320,
        STICK_MIN: 4,         // shorter than this counts as an accidental tap
        MAX_DT: 40,           // clamp so a background tab can't teleport the hero
        CHERRY_REACH: 16,
        FALL_TIME: 750,       // ms spent falling before the run is over
        GRAVITY: 0.0016,
        STEP_DIST: 56,         // one footfall every 56 px (~4.6 a second); the leg animation is locked to this
    STEP_PHASE: 28         // walkDist at which the first foot lands (mid-swing extreme)
    };

    function Game(opts) {
        opts = opts || {};
        this.rng = opts.rng || Math.random;
        this.listener = opts.onEvent || function () {};
        this.reset();
    }

    Game.prototype.emit = function (name, data) { this.listener(name, data || {}); };

    Game.prototype.reset = function () {
        this.phase = 'waiting'; // waiting | stretching | turning | walking | transitioning | falling | over
        this.score = 0;
        this.combo = 0;
        this.bestCombo = 0;
        this.perfects = 0;
        this.cherriesRun = 0;
        this.flips = 0;
        this.time = 0;

        this.offset = 0;       // camera scroll
        this.goal = 0;         // camera target while transitioning
        this.heroY = 0;        // downward displacement while falling
        this.heroVY = 0;
        this.heroVX = 0;
        this.flipped = false;
        this.walkDist = 0;
        this.stepIdx = 0;
        this.fallTimer = 0;
        this.fallKind = null;  // 'miss' | 'pillar'
        this.target = null;    // platform the current stick landed on
        this.perfectHit = false;

        this.platforms = [{ x: C.START_X, w: C.START_W }];
        this.cherries = [];
        for (var i = 0; i < 4; i++) this._addPlatform();

        var p0 = this.platforms[0];
        this.sticks = [{ x: p0.x + p0.w, length: 0, rotation: 0 }];
        this.heroX = p0.x + p0.w - C.HERO_EDGE;
    };

    // Gaps widen and platforms narrow as the score climbs, up to a ceiling.
    Game.prototype.difficulty = function () {
        var s = this.score;
        return {
            gapMin: 45 + Math.min(s * 1.2, 35),
            gapMax: 150 + Math.min(s * 3, 90),
            widthMin: 22 + Math.max(0, 10 - s * 0.5),
            widthMax: 95 - Math.min(s * 0.9, 38)
        };
    };

    Game.prototype._rand = function (a, b) { return a + Math.floor(this.rng() * (b - a + 1)); };

    Game.prototype._addPlatform = function () {
        var d = this.difficulty();
        var last = this.platforms[this.platforms.length - 1];
        var edge = last.x + last.w;
        var gap = this._rand(Math.floor(d.gapMin), Math.floor(d.gapMax));
        var w = this._rand(Math.floor(d.widthMin), Math.floor(d.widthMax));

        // Cherries hang under the bridge line, only in gaps wide enough to flip in.
        if (gap >= 80 && this.rng() < 0.6) {
            var drift = (this.rng() - 0.5) * gap * 0.25;
            this.cherries.push({ x: edge + gap / 2 + drift, taken: false });
        }
        this.platforms.push({ x: edge + gap, w: w });
    };

    Game.prototype.currentStick = function () { return this.sticks[this.sticks.length - 1]; };

    // First platform that begins past the current stick's root.
    Game.prototype.nextPlatform = function () {
        var s = this.currentStick();
        for (var i = 0; i < this.platforms.length; i++) {
            if (this.platforms[i].x > s.x) return this.platforms[i];
        }
        return null;
    };

    // Stick length that lands dead centre on the next platform (used by tests and the demo bot).
    Game.prototype.idealLength = function () {
        var p = this.nextPlatform();
        return p ? p.x + p.w / 2 - this.currentStick().x : 0;
    };

    Game.prototype.run = function () {
        return { score: this.score, cherries: this.cherriesRun, perfects: this.perfects, bestCombo: this.bestCombo, flips: this.flips };
    };

    // --- input --------------------------------------------------------------

    Game.prototype.press = function () {
        if (this.phase === 'waiting') {
            this.phase = 'stretching';
            this.emit('stretchStart');
        } else if (this.phase === 'walking') {
            this._flip();
        }
    };

    Game.prototype.release = function () {
        if (this.phase !== 'stretching') return;
        var s = this.currentStick();
        this.emit('stretchEnd', { length: s.length });
        if (s.length < C.STICK_MIN) {
            s.length = 0;
            this.phase = 'waiting';
            return;
        }
        this.phase = 'turning';
    };

    // Used when the player pauses mid-hold: the stretch is thrown away so a
    // later resume does not leave the stick growing with nobody holding it.
    Game.prototype.cancelStretch = function () {
        if (this.phase !== 'stretching') return;
        this.currentStick().length = 0;
        this.phase = 'waiting';
        this.emit('stretchEnd', { length: 0 });
    };
    Game.prototype._flip = function () {
        var s = this.currentStick();
        var next = this.target;
        // The hero can only hang from the stick itself: not while still on the
        // starting platform, and not once the next pillar is in the way.
        var overGap = this.heroX > s.x + 2;
        var pillarAhead = next && this.heroX > next.x - 6;
        if (!this.flipped && (!overGap || pillarAhead)) {
            this.emit('flipDenied');
            return;
        }
        this.flipped = !this.flipped;
        this.flips++;
        this.emit('flip', { upside: this.flipped });
    };

    // --- simulation ---------------------------------------------------------

    Game.prototype.update = function (rawDt) {
        var dt = Math.min(rawDt, C.MAX_DT);
        if (dt <= 0) return;
        this.time += dt;
        var s = this.currentStick();

        switch (this.phase) {
            case 'stretching':
                s.length = Math.min(C.STICK_MAX, s.length + dt * C.STRETCH);
                this.emit('stretch', { length: s.length });
                break;

            case 'turning':
                s.rotation += dt * C.TURN;
                if (s.rotation >= 90) {
                    s.rotation = 90;
                    this._drop();
                }
                break;

            case 'walking':
                this._walk(dt, s);
                break;

            case 'transitioning':
                this._scroll(dt, s);
                break;

            case 'falling':
                this._fall(dt, s);
                break;
        }
    };

    Game.prototype._drop = function () {
        var s = this.currentStick();
        var end = s.x + s.length;
        var hit = null;
        for (var i = 0; i < this.platforms.length; i++) {
            var p = this.platforms[i];
            if (p.x < end && end < p.x + p.w) { hit = p; break; }
        }
        this.target = hit;
        this.perfectHit = false;
        this.emit('drop', { hit: !!hit });

        if (hit) {
            var mid = hit.x + hit.w / 2;
            this.perfectHit = Math.abs(end - mid) < C.PERFECT / 2;
            if (this.perfectHit) {
                this.combo++;
                this.perfects++;
                if (this.combo > this.bestCombo) this.bestCombo = this.combo;
                var bonus = this.combo * 2;
                this.score += bonus;
                this.emit('perfect', { combo: this.combo, bonus: bonus, x: mid });
            } else {
                this.combo = 0;
                this.score += 1;
                this.emit('point', { x: end, bonus: 1 });
            }
            this.emit('score', { score: this.score });
            this._addPlatform();
        } else {
            this.combo = 0;
        }
        this.phase = 'walking';
        this.stepIdx = Math.floor((this.walkDist + C.STEP_PHASE) / C.STEP_DIST);
    };

    Game.prototype._walk = function (dt, stick) {
        var move = dt * C.WALK;
        this.heroX += move;
        this.walkDist += move;
        var idx = Math.floor((this.walkDist + C.STEP_PHASE) / C.STEP_DIST);
        if (idx > this.stepIdx) {
            this.stepIdx = idx;
            if (!this.flipped) this.emit('step', { n: idx });
        }

        if (this.flipped) {
            for (var i = 0; i < this.cherries.length; i++) {
                var c = this.cherries[i];
                if (!c.taken && Math.abs(this.heroX - c.x) < C.CHERRY_REACH) {
                    c.taken = true;
                    this.cherriesRun++;
                    this.emit('cherry', { x: c.x });
                }
            }
        }

        var t = this.target;
        if (t) {
            // Still hanging when the pillar arrives: face-first into the wall.
            if (this.flipped && this.heroX >= t.x - 4) {
                this._startFall('pillar');
                return;
            }
            var stop = t.x + t.w - C.HERO_EDGE;
            if (this.heroX >= stop) {
                this.heroX = stop;
                this.flipped = false;
                this.goal = t.x + t.w - 100;
                this.phase = 'transitioning';
                this.emit('arrive', { combo: this.combo });
            }
        } else if (this.heroX >= stick.x + stick.length + C.HERO_HALF) {
            this._startFall('miss');
        }
    };

    Game.prototype._scroll = function (dt, stick) {
        var remaining = this.goal - this.offset;
        if (remaining <= 0.5) {
            this.offset = this.goal;
            this._finishTransition();
            return;
        }
        var step = Math.max(dt * 0.22, remaining * dt * 0.006);
        this.offset += Math.min(step, remaining);
    };

    Game.prototype._finishTransition = function () {
        var t = this.target;
        this.sticks.push({ x: t.x + t.w, length: 0, rotation: 0 });
        this.target = null;
        this.flipped = false;
        this.phase = 'waiting';
        this._cull();
        this.emit('ready');
    };

    // Drop things far behind the camera so long runs don't grow without bound.
    Game.prototype._cull = function () {
        var limit = this.offset - 1600;
        while (this.platforms.length > 6 && this.platforms[0].x + this.platforms[0].w < limit) this.platforms.shift();
        while (this.sticks.length > 2 && this.sticks[0].x + this.sticks[0].length < limit) this.sticks.shift();
        this.cherries = this.cherries.filter(function (c) { return c.x > limit; });
    };

    Game.prototype._startFall = function (kind) {
        this.phase = 'falling';
        this.fallKind = kind;
        this.fallTimer = 0;
        this.heroVY = 0;
        this.heroVX = kind === 'pillar' ? -0.07 : 0.04;
        this.combo = 0;
        this.emit(kind === 'pillar' ? 'crash' : 'fall', { kind: kind });
    };

    Game.prototype._fall = function (dt, stick) {
        this.fallTimer += dt;
        if (this.fallKind === 'miss' && stick.rotation < 180) {
            stick.rotation = Math.min(180, stick.rotation + dt * C.TURN);
        }
        this.heroVY += C.GRAVITY * dt;
        this.heroY += this.heroVY * dt;
        this.heroX += this.heroVX * dt;
        if (this.fallTimer >= C.FALL_TIME) {
            this.phase = 'over';
            this.emit('over', this.run());
        }
    };

    Game.C = C;
    SH.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);