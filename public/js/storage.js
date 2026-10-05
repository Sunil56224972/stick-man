/*
 * Stick Hero - persistence.
 *
 * One versioned JSON blob in localStorage. If storage is blocked (private
 * mode, sandboxed iframe) the save lives in memory so the game never throws.
 * Keys from the first public version ("stickman_*") are migrated once.
 */
(function (root) {
    'use strict';
    var SH = (root.SH = root.SH || {});

    var KEY = 'stickhero.save.v2';
    var memory = null;

    function defaults() {
        return {
            v: 2,
            best: 0,
            cherries: 0,
            heroes: ['classic'],
            sticks: ['wood'],
            equipped: { hero: 'classic', stick: 'wood' },
            sound: true,
            daily: { last: '', streak: 0 },
            feats: {},
            stats: { games: 0, totalScore: 0, cherriesEarned: 0, perfects: 0, bestCombo: 0, flips: 0 }
        };
    }

    function num(v, fallback) {
        v = Number(v);
        return isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
    }

    function strings(v, fallback) {
        if (!Array.isArray(v)) return fallback;
        var out = v.filter(function (x) { return typeof x === 'string'; });
        return out.length ? out : fallback;
    }

    // Coerce whatever we read from disk into a well-formed save.
    function sanitize(raw) {
        var d = defaults();
        if (!raw || typeof raw !== 'object') return d;

        d.best = num(raw.best, 0);
        d.cherries = num(raw.cherries, 0);
        d.heroes = strings(raw.heroes, d.heroes);
        d.sticks = strings(raw.sticks, d.sticks);
        if (d.heroes.indexOf('classic') < 0) d.heroes.unshift('classic');
        if (d.sticks.indexOf('wood') < 0) d.sticks.unshift('wood');

        var eq = raw.equipped || {};
        d.equipped.hero = d.heroes.indexOf(eq.hero) >= 0 ? eq.hero : 'classic';
        d.equipped.stick = d.sticks.indexOf(eq.stick) >= 0 ? eq.stick : 'wood';
        d.sound = raw.sound !== false;

        if (raw.daily && typeof raw.daily === 'object') {
            d.daily.last = typeof raw.daily.last === 'string' ? raw.daily.last : '';
            d.daily.streak = num(raw.daily.streak, 0);
        }
        if (raw.feats && typeof raw.feats === 'object') {
            Object.keys(raw.feats).forEach(function (k) { if (raw.feats[k]) d.feats[k] = true; });
        }
        if (raw.stats && typeof raw.stats === 'object') {
            Object.keys(d.stats).forEach(function (k) { d.stats[k] = num(raw.stats[k], 0); });
        }
        return d;
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function dayStamp(date) {
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    var Store = {
        data: defaults(),

        // Tests swap this for a fake. Returns a Storage-like object or null.
        backend: function () {
            try { return root.localStorage || null; } catch (e) { return null; }
        },

        _read: function (key) {
            try { var b = this.backend(); return b ? b.getItem(key) : null; } catch (e) { return null; }
        },

        _write: function (key, value) {
            try { var b = this.backend(); if (b) b.setItem(key, value); } catch (e) { /* quota or blocked */ }
        },

        _legacy: function () {
            var self = this;
            function r(k) { return self._read(k); }
            var best = r('stickman_high_score'), cherries = r('stickman_cherries');
            var heroes = r('stickman_unlocked_heroes'), sticks = r('stickman_unlocked_sticks');
            if (best === null && cherries === null && heroes === null && sticks === null) return null;
            function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
            return {
                best: best, cherries: cherries, heroes: parse(heroes), sticks: parse(sticks),
                equipped: { hero: r('stickman_equipped_hero'), stick: r('stickman_equipped_stick') },
                sound: r('stickman_sound') !== 'muted'
            };
        },

        load: function () {
            var text = this._read(KEY);
            var parsed = null;
            if (text) {
                try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
            } else if (memory) {
                parsed = memory;
            } else {
                parsed = this._legacy();
            }
            this.data = sanitize(parsed);
            return this.data;
        },

        save: function () {
            var text = JSON.stringify(this.data);
            memory = JSON.parse(text);
            this._write(KEY, text);
        },

        owns: function (type, id) { return this.data[type].indexOf(id) >= 0; },

        addCherries: function (n) {
            this.data.cherries += n;
            if (n > 0) this.data.stats.cherriesEarned += n;
            this.save();
        },

        // False when the player can't afford it.
        spendCherries: function (n) {
            if (this.data.cherries < n) return false;
            this.data.cherries -= n;
            this.save();
            return true;
        },

        today: function (now) { return dayStamp(now || new Date()); },

        canClaimDaily: function (now) { return this.data.daily.last !== this.today(now); },

        // One gift per calendar day; playing on consecutive days grows the gift.
        claimDaily: function (now) {
            now = now || new Date();
            if (!this.canClaimDaily(now)) return { ok: false };
            var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            var streak = this.data.daily.last === dayStamp(yesterday) ? this.data.daily.streak + 1 : 1;
            var amount = 10 + Math.min(streak - 1, 6) * 2;
            this.data.daily.last = this.today(now);
            this.data.daily.streak = streak;
            this.addCherries(amount);
            return { ok: true, amount: amount, streak: streak };
        },

        reset: function () {
            memory = null;
            this.data = defaults();
            this.save();
        },

        _sanitize: sanitize
    };

    SH.store = Store;
})(typeof window !== 'undefined' ? window : globalThis);