/*
 * Stick Hero - sound.
 *
 * Everything is synthesised with the Web Audio API, so there are no audio
 * files to ship. The palette follows the game: wood and stone for the stick,
 * a taiko for impacts and a koto-style pluck for rewards, all tuned to one
 * Japanese "in" pentatonic scale so overlapping sounds never clash.
 *
 * The context is created on the first user gesture because browsers refuse
 * to start audio earlier.
 */
(function (root) {
    'use strict';
    var SH = (root.SH = root.SH || {});

    // A minor "in" pentatonic: A B C E F, two octaves and a bit.
    var SCALE = [
        220.00, 246.94, 261.63, 329.63, 349.23,
        440.00, 493.88, 523.25, 659.25, 698.46,
        880.00, 987.77, 1046.50, 1318.51, 1396.91
    ];
    function note(i) { return SCALE[Math.max(0, Math.min(SCALE.length - 1, i))]; }

    function Sound(enabled) {
        this.enabled = enabled !== false;
        this.ctx = null;
        this.master = null;
        this.dry = null;
        this.wet = null;
        this.noise = null;
        this.creak = null;
        this.footLeft = true;
    }

    Sound.prototype.unlock = function () {
        if (!this.ctx) {
            var Ctor = root.AudioContext || root.webkitAudioContext;
            if (!Ctor) return;
            try { this.ctx = new Ctor(); } catch (e) { return; }
            var c = this.ctx;

            // master -> gentle compressor -> speakers, so stacked sounds never clip
            this.master = c.createGain();
            this.master.gain.value = 1.7;
            var comp = c.createDynamicsCompressor();
            comp.threshold.value = -16;
            comp.ratio.value = 4;
            comp.attack.value = 0.004;
            comp.release.value = 0.2;
            this.master.connect(comp);
            comp.connect(c.destination);

            // everything is sent dry and, optionally, through a small stone-hall reverb
            this.dry = c.createGain();
            this.dry.connect(this.master);
            this.wet = c.createGain();
            this.wet.gain.value = 0.5;
            var verb = c.createConvolver();
            verb.buffer = this._impulse(1.3, 2.6);
            this.wet.connect(verb);
            verb.connect(this.master);

            // two seconds of white noise, reused for every scrape, whoosh and crack
            var len = c.sampleRate * 2;
            var buf = c.createBuffer(1, len, c.sampleRate);
            var data = buf.getChannelData(0);
            for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
            this.noise = buf;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    };

    // Decaying stereo noise: a cheap, convincing room.
    Sound.prototype._impulse = function (seconds, decay) {
        var c = this.ctx;
        var len = Math.floor(c.sampleRate * seconds);
        var buf = c.createBuffer(2, len, c.sampleRate);
        for (var ch = 0; ch < 2; ch++) {
            var d = buf.getChannelData(ch);
            for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
        return buf;
    };

    Sound.prototype.setEnabled = function (on) {
        this.enabled = !!on;
        if (!this.enabled) this.stretchStop();
    };

    Sound.prototype._ok = function () {
        return this.enabled && this.ctx && this.ctx.state !== 'closed';
    };

    // Route a node to the mix. reverb is 0..1.
    Sound.prototype._send = function (node, reverb) {
        node.connect(this.dry);
        if (reverb) {
            var s = this.ctx.createGain();
            s.gain.value = reverb;
            node.connect(s);
            s.connect(this.wet);
        }
    };

    // Short enveloped oscillator. o: {type, freq, to, dur, vol, delay, attack, reverb}
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
        g.gain.linearRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.004));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g);
        this._send(g, o.reverb);
        osc.start(t);
        osc.stop(t + dur + 0.03);
    };

    // Filtered noise burst. o: {freq, to, dur, vol, filter, q, delay, attack, reverb}
    Sound.prototype._burst = function (o) {
        if (!this._ok() || !this.noise) return;
        var c = this.ctx;
        var t = c.currentTime + (o.delay || 0);
        var src = c.createBufferSource();
        var filter = c.createBiquadFilter();
        var g = c.createGain();
        src.buffer = this.noise;
        src.loop = true;
        filter.type = o.filter || 'lowpass';
        filter.Q.value = o.q || 1;
        filter.frequency.setValueAtTime(o.freq || 800, t);
        if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(o.vol || 0.3, t + (o.attack || 0.003));
        g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
        src.connect(filter);
        filter.connect(g);
        this._send(g, o.reverb);
        src.start(t, Math.random());
        src.stop(t + o.dur + 0.03);
    };

    // Plucked string: bright attack, fast-fading overtone, soft tail.
    Sound.prototype._pluck = function (freq, vol, delay, reverb) {
        this._tone({ type: 'triangle', freq: freq * 1.012, to: freq, dur: 0.7, vol: vol, delay: delay, reverb: reverb == null ? 0.5 : reverb });
        this._tone({ type: 'sine', freq: freq * 2, dur: 0.22, vol: vol * 0.5, delay: delay, reverb: 0.3 });
        this._tone({ type: 'square', freq: freq * 3, dur: 0.04, vol: vol * 0.12, delay: delay });
    };

    // Soft marimba/wood-bar note, used for pickups.
    Sound.prototype._bar = function (freq, vol, delay) {
        this._tone({ type: 'sine', freq: freq, dur: 0.35, vol: vol, delay: delay, reverb: 0.35 });
        this._tone({ type: 'sine', freq: freq * 4, dur: 0.06, vol: vol * 0.35, delay: delay });
    };

    // Taiko drum hit: pitch-dropping body plus a skin slap.
    Sound.prototype._taiko = function (vol, delay) {
        this._tone({ type: 'sine', freq: 140, to: 48, dur: 0.38, vol: vol, delay: delay, reverb: 0.4 });
        this._tone({ type: 'triangle', freq: 220, to: 90, dur: 0.12, vol: vol * 0.5, delay: delay });
        this._burst({ filter: 'bandpass', freq: 1800, q: 0.8, dur: 0.05, vol: vol * 0.45, delay: delay });
    };

    // --- stick: creaking bamboo that tightens as it grows -------------------------

    Sound.prototype.stretchStart = function () {
        if (!this._ok() || !this.noise) return;
        this.stretchStop();
        var c = this.ctx;
        var src = c.createBufferSource();
        var band = c.createBiquadFilter();
        var gain = c.createGain();
        var body = c.createOscillator();
        var bodyGain = c.createGain();
        var lfo = c.createOscillator();
        var lfoDepth = c.createGain();

        src.buffer = this.noise;
        src.loop = true;
        band.type = 'bandpass';
        band.Q.value = 7;
        band.frequency.value = 420;

        // the ratchet: a fast tremolo on the scrape makes it creak instead of hiss
        lfo.type = 'square';
        lfo.frequency.value = 13;
        lfoDepth.gain.value = 0.045;
        gain.gain.setValueAtTime(0.0001, c.currentTime);
        gain.gain.linearRampToValueAtTime(0.07, c.currentTime + 0.05);
        lfo.connect(lfoDepth);
        lfoDepth.connect(gain.gain);

        body.type = 'triangle';
        body.frequency.value = 110;
        bodyGain.gain.setValueAtTime(0.0001, c.currentTime);
        bodyGain.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.08);

        src.connect(band);
        band.connect(gain);
        body.connect(bodyGain);
        this._send(gain, 0.1);
        this._send(bodyGain, 0);
        src.start();
        body.start();
        lfo.start();
        this.creak = { src: src, band: band, gain: gain, body: body, bodyGain: bodyGain, lfo: lfo };
    };

    Sound.prototype.stretchTo = function (len) {
        var n = this.creak;
        if (!n) return;
        var t = this.ctx.currentTime;
        n.band.frequency.setTargetAtTime(420 + len * 5.5, t, 0.04);
        n.body.frequency.setTargetAtTime(110 + len * 0.9, t, 0.04);
        n.lfo.frequency.setTargetAtTime(13 + len * 0.06, t, 0.04);
    };

    Sound.prototype.stretchStop = function () {
        var n = this.creak;
        if (!n) return;
        this.creak = null;
        try {
            var t = this.ctx.currentTime;
            n.gain.gain.cancelScheduledValues(t);
            n.gain.gain.setTargetAtTime(0.0001, t, 0.02);
            n.bodyGain.gain.cancelScheduledValues(t);
            n.bodyGain.gain.setTargetAtTime(0.0001, t, 0.02);
            n.src.stop(t + 0.15);
            n.body.stop(t + 0.15);
            n.lfo.stop(t + 0.15);
        } catch (e) { /* context already gone */ }
    };

    // The stick is let go and sweeps through the air (about a third of a second).
    Sound.prototype.swoosh = function (len) {
        var weight = Math.min(1, (len || 100) / 260);
        this._burst({ filter: 'bandpass', q: 1.2, freq: 500, to: 2600 - weight * 1200, dur: 0.34, vol: 0.12 + weight * 0.08, attack: 0.12 });
        this._tone({ type: 'sine', freq: 190 - weight * 60, to: 90, dur: 0.34, vol: 0.05, attack: 0.1 });
    };

    // The stick lands: a wooden knock on stone. A miss lands soft and hollow.
    Sound.prototype.drop = function (hit) {
        if (hit === false) {
            this._tone({ type: 'sine', freq: 200, to: 110, dur: 0.16, vol: 0.26 });
            this._burst({ filter: 'lowpass', freq: 900, to: 200, dur: 0.12, vol: 0.2 });
            return;
        }
        this._tone({ type: 'sine', freq: 340, to: 210, dur: 0.09, vol: 0.3 });
        this._tone({ type: 'triangle', freq: 880, to: 520, dur: 0.045, vol: 0.12 });
        this._tone({ type: 'sine', freq: 96, to: 52, dur: 0.16, vol: 0.28 });
        this._burst({ filter: 'bandpass', freq: 2600, q: 1.4, dur: 0.035, vol: 0.2 });
    };

    // Footsteps alternate left and right, like soft sandals on timber.
    Sound.prototype.step = function () {
        this.footLeft = !this.footLeft;
        var f = this.footLeft ? 760 : 620;
        this._burst({ filter: 'bandpass', freq: f, q: 1.1, dur: 0.06, vol: 0.32 });
        this._tone({ type: 'sine', freq: this.footLeft ? 150 : 128, to: 80, dur: 0.07, vol: 0.14 });
    };

    // --- scoring ------------------------------------------------------------------

    // A normal landing: one soft wood-bar note.
    Sound.prototype.point = function () {
        this._bar(note(5), 0.2, 0.03);
    };

    // Each consecutive perfect climbs the scale and gains another pluck.
    Sound.prototype.perfect = function (combo) {
        var i = 3 + Math.min(combo - 1, 8);
        this._taiko(0.2, 0);
        this._pluck(note(i), 0.17, 0.02);
        this._pluck(note(i + 2), 0.15, 0.09);
        if (combo >= 2) this._pluck(note(i + 4), 0.13, 0.16);
        if (combo >= 4) this._pluck(note(i + 5), 0.11, 0.23);
        this._burst({ filter: 'highpass', freq: 6000, dur: 0.25, vol: 0.05, delay: 0.02, attack: 0.02, reverb: 0.5 });
    };

    Sound.prototype.cherry = function () {
        this._bar(note(8), 0.15, 0);
        this._bar(note(10), 0.14, 0.07);
        this._burst({ filter: 'highpass', freq: 5000, dur: 0.1, vol: 0.04, delay: 0.05 });
    };

    // Flipping under the bridge: a quick cloth swish, rising going down and falling coming back.
    Sound.prototype.flip = function (upside) {
        if (upside) {
            this._burst({ filter: 'bandpass', q: 2, freq: 700, to: 2200, dur: 0.14, vol: 0.45, attack: 0.03 });
            this._tone({ type: 'sine', freq: 300, to: 560, dur: 0.1, vol: 0.14 });
        } else {
            this._burst({ filter: 'bandpass', q: 2, freq: 2200, to: 700, dur: 0.14, vol: 0.45, attack: 0.03 });
            this._tone({ type: 'sine', freq: 560, to: 300, dur: 0.1, vol: 0.14 });
        }
    };

    Sound.prototype.flipDenied = function () {
        this._tone({ type: 'triangle', freq: 190, to: 140, dur: 0.12, vol: 0.2 });
        this._burst({ filter: 'lowpass', freq: 500, dur: 0.07, vol: 0.15 });
    };

    // The sky changes at score 10 (dusk) and 20 (night): a temple bell and a wind chime.
    Sound.prototype.skyChange = function (level) {
        var f = level >= 2 ? note(2) : note(5);
        this._tone({ type: 'sine', freq: f, dur: 1.6, vol: 0.14, reverb: 0.8 });
        this._tone({ type: 'sine', freq: f * 2.76, dur: 0.9, vol: 0.05, reverb: 0.8 });
        this._tone({ type: 'sine', freq: f * 5.4, dur: 0.4, vol: 0.025, reverb: 0.8 });
        [note(10), note(12), note(13)].forEach(function (n, i) {
            this._bar(n, 0.06, 0.25 + i * 0.09);
        }, this);
    };

    // --- failing ------------------------------------------------------------------

    // Hitting the pillar wall: a heavy taiko, a crack of wood and falling rubble.
    Sound.prototype.crash = function () {
        this._taiko(0.75, 0);
        this._tone({ type: 'sawtooth', freq: 150, to: 40, dur: 0.3, vol: 0.2 });
        this._burst({ filter: 'bandpass', freq: 3200, q: 0.7, dur: 0.08, vol: 0.5 });
        this._burst({ filter: 'lowpass', freq: 2200, to: 150, dur: 0.5, vol: 0.4, delay: 0.04 });
    };

    // Falling into the gap: a falling whistle, then a distant thud.
    Sound.prototype.fall = function () {
        this._tone({ type: 'sine', freq: 780, to: 120, dur: 0.62, vol: 0.12, reverb: 0.2 });
        this._burst({ filter: 'bandpass', q: 2, freq: 1800, to: 300, dur: 0.6, vol: 0.06 });
        this._tone({ type: 'sine', freq: 70, to: 36, dur: 0.3, vol: 0.2, delay: 0.62, reverb: 0.4 });
    };

    // A short falling phrase ending on the tonic.
    Sound.prototype.gameOver = function () {
        [note(8), note(7), note(5), note(2)].forEach(function (n, i) {
            this._pluck(n, 0.13, 0.35 + i * 0.2, 0.7);
        }, this);
    };

    // A rising run for a new best score.
    Sound.prototype.newBest = function () {
        [note(5), note(7), note(8), note(10), note(12)].forEach(function (n, i) {
            this._pluck(n, 0.13, 0.35 + i * 0.1, 0.6);
        }, this);
        this._taiko(0.18, 0.85);
    };

    // --- interface ----------------------------------------------------------------

    Sound.prototype.click = function () {
        this._tone({ type: 'sine', freq: 520, to: 340, dur: 0.06, vol: 0.2 });
        this._burst({ filter: 'bandpass', freq: 2400, q: 1.5, dur: 0.025, vol: 0.16 });
    };

    Sound.prototype.unlockChime = function () {
        [note(5), note(7), note(8), note(10), note(12)].forEach(function (n, i) {
            this._pluck(n, 0.12, i * 0.07, 0.6);
        }, this);
    };

    Sound.prototype.nope = function () {
        this._tone({ type: 'triangle', freq: 170, to: 120, dur: 0.12, vol: 0.09 });
        this._tone({ type: 'triangle', freq: 150, to: 105, dur: 0.14, vol: 0.09, delay: 0.1 });
    };

    SH.Sound = Sound;
})(typeof window !== 'undefined' ? window : globalThis);