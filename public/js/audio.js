/*
 * Stick Hero - sound.
 *
 * Everything is synthesised with the Web Audio API, so there are no audio
 * files to ship. The context is created on the first user gesture because
 * browsers refuse to start audio earlier.
 */
(function (root) {
    'use strict';
    var SH = (root.SH = root.SH || {});

    function Sound(enabled) {
        this.enabled = enabled !== false;
        this.ctx = null;
        this.master = null;
        this.noise = null;
        this.stretchNode = null;
    }

    Sound.prototype.unlock = function () {
        if (!this.ctx) {
            var Ctor = root.AudioContext || root.webkitAudioContext;
            if (!Ctor) return;
            try { this.ctx = new Ctor(); } catch (e) { return; }
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.55;
            this.master.connect(this.ctx.destination);

            // One second of white noise, reused for thuds and crashes.
            var len = this.ctx.sampleRate;
            var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            var data = buf.getChannelData(0);
            for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
            this.noise = buf;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    };

    Sound.prototype.setEnabled = function (on) {
        this.enabled = !!on;
        if (!this.enabled) this.stretchStop();
    };

    Sound.prototype._ok = function () {
        return this.enabled && this.ctx && this.ctx.state !== 'closed';
    };

    // Short enveloped oscillator. o: {type, freq, to, dur, vol, delay}
    Sound.prototype._tone = function (o) {
        if (!this._ok()) return;
        var c = this.ctx;
        var t = c.currentTime + (o.delay || 0);
        var dur = o.dur || 0.15;
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(o.freq, t);
        if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(o.vol || 0.2, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g);
        g.connect(this.master);
        osc.start(t);
        osc.stop(t + dur + 0.03);
    };

    // Filtered noise burst. o: {freq, to, dur, vol, filter, delay}
    Sound.prototype._burst = function (o) {
        if (!this._ok() || !this.noise) return;
        var c = this.ctx;
        var t = c.currentTime + (o.delay || 0);
        var src = c.createBufferSource();
        var filter = c.createBiquadFilter();
        var g = c.createGain();
        src.buffer = this.noise;
        filter.type = o.filter || 'lowpass';
        filter.frequency.setValueAtTime(o.freq || 800, t);
        if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
        g.gain.setValueAtTime(o.vol || 0.3, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
        src.connect(filter);
        filter.connect(g);
        g.connect(this.master);
        src.start(t);
        src.stop(t + o.dur + 0.03);
    };

    // The stretch tone follows the stick: longer stick, higher pitch.
    Sound.prototype.stretchStart = function () {
        if (!this._ok()) return;
        this.stretchStop();
        var c = this.ctx;
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 170;
        g.gain.setValueAtTime(0.0001, c.currentTime);
        g.gain.linearRampToValueAtTime(0.07, c.currentTime + 0.04);
        osc.connect(g);
        g.connect(this.master);
        osc.start();
        this.stretchNode = { osc: osc, gain: g };
    };

    Sound.prototype.stretchTo = function (len) {
        if (!this.stretchNode) return;
        this.stretchNode.osc.frequency.setTargetAtTime(170 + len * 1.7, this.ctx.currentTime, 0.03);
    };

    Sound.prototype.stretchStop = function () {
        var n = this.stretchNode;
        if (!n) return;
        this.stretchNode = null;
        try {
            var t = this.ctx.currentTime;
            n.gain.gain.cancelScheduledValues(t);
            n.gain.gain.setTargetAtTime(0.0001, t, 0.02);
            n.osc.stop(t + 0.12);
        } catch (e) { /* context already gone */ }
    };

    Sound.prototype.drop = function () {
        this._tone({ type: 'sine', freq: 150, to: 38, dur: 0.14, vol: 0.32 });
        this._burst({ freq: 1400, to: 200, dur: 0.09, vol: 0.12 });
    };

    Sound.prototype.step = function () {
        this._tone({ type: 'sine', freq: 230 + Math.random() * 50, dur: 0.045, vol: 0.05 });
    };

    // Each consecutive perfect climbs a whole tone.
    Sound.prototype.perfect = function (combo) {
        var base = 523.25 * Math.pow(2, (Math.min(combo, 8) * 2) / 12);
        this._tone({ type: 'triangle', freq: base, dur: 0.28, vol: 0.2 });
        this._tone({ type: 'triangle', freq: base * 1.5, dur: 0.32, vol: 0.16, delay: 0.07 });
        this._tone({ type: 'sine', freq: base * 2, dur: 0.4, vol: 0.09, delay: 0.14 });
    };

    Sound.prototype.cherry = function () {
        this._tone({ type: 'triangle', freq: 988, to: 1319, dur: 0.14, vol: 0.2 });
        this._tone({ type: 'sine', freq: 1976, dur: 0.18, vol: 0.07, delay: 0.06 });
    };

    Sound.prototype.flip = function () {
        this._tone({ type: 'sine', freq: 300, to: 520, dur: 0.09, vol: 0.1 });
    };

    Sound.prototype.crash = function () {
        this._burst({ freq: 2200, to: 120, dur: 0.35, vol: 0.4 });
        this._tone({ type: 'sawtooth', freq: 130, to: 36, dur: 0.28, vol: 0.22 });
    };

    Sound.prototype.fall = function () {
        this._tone({ type: 'sine', freq: 420, to: 70, dur: 0.75, vol: 0.16 });
    };

    Sound.prototype.click = function () {
        this._tone({ type: 'square', freq: 520, to: 380, dur: 0.05, vol: 0.04 });
    };

    Sound.prototype.unlockChime = function () {
        [659, 784, 988, 1319].forEach(function (f, i) {
            this._tone({ type: 'triangle', freq: f, dur: 0.26, vol: 0.14, delay: i * 0.075 });
        }, this);
    };

    Sound.prototype.nope = function () {
        this._tone({ type: 'square', freq: 190, to: 150, dur: 0.14, vol: 0.06 });
    };

    Sound.prototype.gameOver = function () {
        [392, 330, 262].forEach(function (f, i) {
            this._tone({ type: 'triangle', freq: f, dur: 0.32, vol: 0.14, delay: 0.3 + i * 0.16 });
        }, this);
    };

    SH.Sound = Sound;
})(typeof window !== 'undefined' ? window : globalThis);