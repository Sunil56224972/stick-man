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
        AHEAD_COUNT: 4,       // platforms kept beyond the one the hero stands on
        AHEAD_DIST: 1200,     // and world px of course kept past its edge, wider than any screen
        STEP_DIST: 56,         // one footfall every 56 px (~4.6 a second); the leg animation is locked to this
    STEP_PHASE: 28         // walkDist at which the first foot lands (mid-swing extreme)
    };

    // Seeded level generation for multiplayer. Every platform draws from its own
    // generator keyed by (seed, index), so two games with the same seed build the
    // same course no matter how their scores or timing differ.
    function levelRng(seed, index) {
        var a = Math.imul(seed ^ Math.imul(index + 1, 0x9E3779B1), 0x85EBCA6B) >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function Game(opts) {
        opts = opts || {};
        this.seed = opts.seed == null ? null : opts.seed >>> 0;
        this.rng = opts.rng || Math.random;
        // A ghost is a read-only copy of another player's run, kept in step by
        // mirror(). It never scores or builds platforms on its own.
        this.ghost = !!opts.ghost;
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
        this.round = 0;        // bridges fully crossed (stick index)

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

        this.made = 1;         // platforms generated so far, the start pad included
        this.platforms = [{ x: C.START_X, w: C.START_W }];
        this.cherries = [];
        this._fill(this.platforms[0]);

        var p0 = this.platforms[0];
        this.sticks = [{ x: p0.x + p0.w, length: 0, rotation: 0 }];
        this.heroX = p0.x + p0.w - C.HERO_EDGE;
    };

    // Gaps widen and platforms narrow as the score climbs, up to a ceiling.
    Game.prototype.setSeed = function (seed) { this.seed = seed == null ? null : seed >>> 0; };

    Game.prototype.difficulty = function (s) {
        if (s === undefined) s = this.score;
        return {
            gapMin: 45 + Math.min(s * 1.2, 35),
            gapMax: 150 + Math.min(s * 3, 90),
            widthMin: 22 + Math.max(0, 10 - s * 0.5),
            widthMax: 95 - Math.min(s * 0.9, 38)
        };
    };

    Game.prototype._rand = function (a, b, rng) { return a + Math.floor((rng || this.rng)() * (b - a + 1)); };

    Game.prototype._addPlatform = function () {
        var index = this.made++;
        // Solo play ramps with the score. A seeded course ramps with the platform
        // number instead, so everyone in a race faces identical gaps.
        var seeded = this.seed !== null;
        var rng = seeded ? levelRng(this.seed, index) : this.rng;
        var d = this.difficulty(seeded ? index * 2 : undefined);
        var last = this.platforms[this.platforms.length - 1];
        var edge = last.x + last.w;
        var gap = this._rand(Math.floor(d.gapMin), Math.floor(d.gapMax), rng);
        var w = this._rand(Math.floor(d.widthMin), Math.floor(d.widthMax), rng);

        // Cherries hang under the bridge line, only in gaps wide enough to flip in.
        if (gap >= 80 && rng() < 0.6) {
            var drift = (rng() - 0.5) * gap * 0.25;
            this.cherries.push({ x: edge + gap / 2 + drift, taken: false });
        }
        this.platforms.push({ x: edge + gap, w: w });
    };

    // Keeps the course ahead of `from` full. A long stick can skip a platform,
    // so topping up by count and by distance (not one per landing) means the
    // next few platforms are always on screen however far a landing jumps.
    Game.prototype._fill = function (from) {
        var edge = from.x + from.w;
        for (var guard = 0; guard < 200; guard++) {
            var ahead = 0;
            for (var i = 0; i < this.platforms.length; i++) if (this.platforms[i].x > from.x) ahead++;
            var last = this.platforms[this.platforms.length - 1];
            if (ahead >= C.AHEAD_COUNT && last.x + last.w >= edge + C.AHEAD_DIST) return;
            this._addPlatform();
        }
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

    // Platform the given stick lands on once dropped, or null for a miss.
    Game.prototype._hit = function (s) {
        var end = s.x + s.length;
        for (var i = 0; i < this.platforms.length; i++) {
            var p = this.platforms[i];
            if (p.x < end && end < p.x + p.w) return p;
        }
        return null;
    };

    Game.prototype._drop = function () {
        var s = this.currentStick();
        var end = s.x + s.length;
        var hit = this._hit(s);
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
            if (!this.ghost) this._fill(hit);
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
        this.round++;
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

    // --- live spectating ----------------------------------------------------
    // The race server relays each player's snapshot to the others. A ghost runs
    // the normal simulation between snapshots, so it moves smoothly at any
    // frame rate, and each snapshot nudges it back onto the real run.

    var RANK = { waiting: 0, stretching: 1, turning: 2, walking: 3, transitioning: 4, falling: 5, over: 6 };
    function r1(n) { return Math.round(n * 10) / 10; }

    Game.prototype.snapshot = function () {
        var s = this.currentStick();
        return {
            p: this.phase, k: this.round, m: this.made, sc: this.score,
            x: r1(this.heroX), o: r1(this.offset), sx: s.x, sl: r1(s.length), sr: r1(s.rotation),
            f: this.flipped ? 1 : 0, w: r1(this.walkDist), fk: this.fallKind, ft: Math.round(this.fallTimer), fy: r1(this.heroY)
        };
    };

    function blend(a, b, snap) { return snap || Math.abs(b - a) > 50 ? b : a + (b - a) * 0.3; }

    Game.prototype.mirror = function (s) {
        if (!s || RANK[s.p] === undefined) return;
        while (this.made < s.m && this.made < 5000) this._addPlatform();
        this.score = s.sc;

        var cur = this.currentStick();
        var fresh = false;
        if (Math.abs(cur.x - s.sx) > 0.5) {
            // a stick we have not seen yet: park the old one and start the new
            if (cur.length > 0 && cur.rotation < 90) cur.rotation = 90;
            cur = { x: s.sx, length: 0, rotation: 0 };
            this.sticks.push(cur);
            this.round = s.k;
            this.target = null;
            fresh = true;
        }
        var mine = fresh ? -1 : this.round * 10 + RANK[this.phase];
        if (s.k * 10 + RANK[s.p] < mine) return;   // we are already ahead of this snapshot

        var changed = fresh || s.p !== this.phase;
        this.phase = s.p;
        this.flipped = !!s.f;
        this.fallKind = s.fk || null;
        cur.length = blend(cur.length, s.sl, changed);
        cur.rotation = blend(cur.rotation, s.sr, changed);
        this.heroX = blend(this.heroX, s.x, changed);
        this.offset = blend(this.offset, s.o, changed);
        this.walkDist = blend(this.walkDist, s.w, changed);
        if (s.p === 'falling' || s.p === 'over') this.heroY = s.fy;
        if (!changed) return;

        this.target = RANK[s.p] >= 3 ? this._hit(cur) : null;
        if (s.p === 'walking') this.stepIdx = Math.floor((this.walkDist + C.STEP_PHASE) / C.STEP_DIST);
        if (s.p === 'transitioning' && this.target) this.goal = this.target.x + this.target.w - 100;
        if (s.p === 'falling' || s.p === 'over') {
            this.fallTimer = s.ft;
            this.heroVY = C.GRAVITY * s.ft;
            this.heroVX = this.fallKind === 'pillar' ? -0.07 : 0.04;
        }
    };

    Game.levelRng = levelRng;
    Game.C = C;
    SH.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);