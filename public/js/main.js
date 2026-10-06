/*
 * Stick Hero - entry point.
 *
 * Connects the simulation (SH.Game), the painter (SH.Renderer), the DOM
 * (SH.ui), sound and storage. Also owns input and the frame loop.
 */
(function (root) {
    'use strict';
    var SH = root.SH;
    var store = SH.store, cat = SH.catalog, ui = SH.ui;
    var doc = root.document;

    store.load();
    var sound = new SH.Sound(store.data.sound);
    var renderer = new SH.Renderer(doc.getElementById('stage'));
    var app = doc.getElementById('app');

    var mode = 'title';        // title | play | paused | over
    var armoryReturn = null;   // which screen the armory was opened from
    var holding = false;
    var overAt = 0;            // when the game-over card appeared (input lock)
    var bestAtStart = store.data.best;
    var flipHintShown = false;
    var prevScore = 0;        // to spot the dusk and night thresholds
    var bridges = 0;          // bridges crossed this run, reported to the race server
    var leaveOpen = false;    // leave-race prompt is up (the race keeps running behind it)
    var multi = SH.multi;
    function inRace() { return multi.inRoom() && multi.racing(); }

    var COLORS_PERFECT = ['#e4472f', '#f4b73a', '#19d3e6', '#58b368', '#ffffff'];
    var COLORS_CHERRY = ['#e4472f', '#c9341f', '#ff8a70', '#58b368'];
    var COLORS_DUST = ['#f6ecd6', '#d8c9a3'];

    var game = new SH.Game({ onEvent: onGameEvent });

    // --- game events -------------------------------------------------------------

    function groundBurst(x, n, colors, power) { renderer.burst(x, -6, n, colors, power); }

    function onGameEvent(name, d) {
        switch (name) {
            case 'stretchStart':
                sound.stretchStart();
                ui.hint(null);
                break;
            case 'stretch': sound.stretchTo(d.length); break;
            case 'stretchEnd':
                sound.stretchStop();
                if (d.length >= SH.Game.C.STICK_MIN) sound.swoosh(d.length);
                break;

            case 'drop': {
                sound.drop(d.hit);
                var s = game.currentStick();
                renderer.dust(s.x + s.length, -2, 6);
                renderer.shake(d.hit ? 2.5 : 1.5);
                break;
            }

            case 'perfect': {
                sound.perfect(d.combo);
                var label = d.combo > 1 ? 'COMBO x' + d.combo + '  +' + d.bonus : 'PERFECT  +' + d.bonus;
                ui.callout(label);
                ui.setCombo(d.combo);
                groundBurst(d.x, 14 + Math.min(d.combo, 6) * 4, COLORS_PERFECT, 1 + Math.min(d.combo, 6) * 0.1);
                renderer.floatText('+' + d.bonus, d.x, -34, '#f4b73a', 22);
                renderer.shake(3 + Math.min(d.combo, 5));
                break;
            }
            case 'point':
                sound.point();
                ui.setCombo(0);
                renderer.floatText('+1', d.x, -26, '#ffffff', 18);
                break;
            case 'score': {
                ui.setScore(d.score, true);
                if (d.score >= 10 && prevScore < 10) sound.skyChange(1);
                else if (d.score >= 20 && prevScore < 20) sound.skyChange(2);
                prevScore = d.score;
                if (multi.inRoom()) {
                    bridges++;
                    multi.reportScore(d.score, bridges);
                } else if (d.score > store.data.best) {
                    store.data.best = d.score;
                    ui.setBest(d.score);
                }
                if (!flipHintShown && store.data.stats.flips === 0 && store.data.stats.games < 4 && d.score >= 1) {
                    flipHintShown = true;
                    ui.hint('<b>Tap</b> while crossing to flip under the bridge and grab cherries. Flip back before the wall!', 5200);
                }
                break;
            }

            case 'step': sound.step(d.n); break;
            case 'flipDenied': sound.flipDenied(); break;
            case 'flip':
                sound.flip(d.upside);
                store.data.stats.flips++;
                break;

            case 'cherry': {
                sound.cherry();
                store.addCherries(1);
                ui.setCherries(store.data.cherries, true);
                renderer.burst(d.x, 22, 12, COLORS_CHERRY, 0.8);
                renderer.floatText('+1', d.x, 4, '#ff8a70', 20);
                break;
            }

            case 'arrive':
                sound.settle();
                renderer.dust(game.heroX, -2, 4);
                break;

            case 'crash':
                sound.crash();
                renderer.shake(12);
                renderer.burst(game.heroX, -16, 22, COLORS_DUST.concat(['#e4472f']), 1.1);
                break;
            case 'fall':
                sound.fall();
                renderer.shake(2);
                break;

            case 'over':
                if (multi.inRoom()) finishRace(); else finishRun(d);
                break;
        }
    }

    function finishRun(run) {
        var st = store.data.stats;
        var newBest = run.score > bestAtStart;
        st.games++;
        st.totalScore += run.score;
        st.perfects += run.perfects;
        if (run.bestCombo > st.bestCombo) st.bestCombo = run.bestCombo;
        if (run.score > store.data.best) store.data.best = run.score;
        store.save();

        run.map = store.data.equipped.map;
        var feats = cat.evaluateFeats(store, run); // pays rewards and saves
        ui.setCherries(store.data.cherries);
        ui.setBest(store.data.best);

        mode = 'over';
        overAt = root.performance.now();
        if (newBest && run.score > 0) sound.newBest(); else sound.gameOver();
        ui.showOver({
            score: run.score, best: store.data.best, cherries: run.cherries,
            perfects: run.perfects, bestCombo: run.bestCombo, newBest: newBest && run.score > 0, feats: feats
        });
        var retry = doc.getElementById('btn-retry');
        if (retry) retry.focus({ preventScroll: true });
    }

    // --- flow --------------------------------------------------------------------

    // Multiplayer hooks: the lobby borrows the scene, a race borrows the game.
    function hudMode(isMulti) {
        doc.getElementById('btn-pause').hidden = isMulti;
        doc.getElementById('btn-armory').hidden = isMulti;
        doc.getElementById('btn-leave').hidden = !isMulti;
    }

    function enterLobbyScene() {
        holding = false;
        leaveOpen = false;
        game.setSeed(null);
        game.reset();
        renderer.clearFx();
        ui.hideAll();
        ui.hud(false);
        ui.hint(null);
        mode = 'lobby';
    }

    // Seeded course, same for everyone; the sim stays frozen until the server says go.
    function prepareRace(seed, mapId) {
        sound.unlock();
        holding = false;
        leaveOpen = false;
        game.setSeed(seed);
        game.reset();
        prevScore = 0;
        bridges = 0;
        renderer.clearFx();
        ui.hideAll();
        ui.hud(true);
        hudMode(true);
        syncHud();
        mode = 'mpwait';
    }

    function goRace() {
        if (mode !== 'mpwait') return;
        mode = 'play';
        // wait for the GO! banner to clear before the hint takes its spot
        setTimeout(function () { if (mode === 'play') ui.hint('<b>Hold</b> to grow the stick, <b>release</b> to drop it. Farthest wins.', 3200); }, 800);
    }

    // This player has fallen; the race goes on for the others.
    function finishRace() {
        holding = false;
        mode = 'mpout';
        multi.reportDead();
        sound.gameOver();
        ui.hint('You\u2019re out. Watching the others finish...');
    }

    function closeLeave() {
        leaveOpen = false;
        ui.hide('leave');
    }

    function askLeave() {
        if (!inRace() && mode !== 'mpout') return;
        if (mode === 'mpout') { leaveRoom(); return; }
        holding = false;
        game.cancelStretch();
        leaveOpen = true;
        ui.show('leave');
        var stay = doc.getElementById('btn-leave-stay');
        if (stay) stay.focus({ preventScroll: true });
    }

    function leaveRoom() {
        closeLeave();
        multi.leave();
        toTitle();
    }

    function syncHud() {
        ui.setScore(game.score, false);
        ui.setBest(store.data.best);
        ui.setCherries(store.data.cherries);
        ui.setCombo(0);
    }

    function startRun() {
        hudMode(false);
        game.setSeed(null);
        sound.unlock();
        holding = false;
        game.reset();
        prevScore = 0;
        renderer.clearFx();
        bestAtStart = store.data.best;
        ui.hideAll();
        ui.hud(true);
        syncHud();
        mode = 'play';
        ui.hint('<b>Hold</b> anywhere to grow the stick,<br><b>release</b> to drop it across the gap.');
    }

    function toTitle() {
        if (multi.inRoom()) multi.leave();
        hudMode(false);
        leaveOpen = false;
        game.setSeed(null);
        holding = false;
        game.reset();
        renderer.clearFx();
        ui.hideAll();
        ui.hud(false);
        ui.hint(null);
        ui.refreshTitle();
        ui.show('title');
        mode = 'title';
    }

    function pause() {
        if (mode !== 'play' || multi.inRoom()) return;
        holding = false;
        game.cancelStretch();
        mode = 'paused';
        ui.show('pause');
        var resume = doc.getElementById('btn-resume');
        if (resume) resume.focus({ preventScroll: true });
    }

    function resume() {
        if (mode !== 'paused') return;
        ui.hide('pause');
        mode = 'play';
    }

    function openArmory() {
        if (ui.armoryOpen || multi.inRoom()) return;
        if (mode === 'play') pause();
        armoryReturn = mode;
        // the paused card stays underneath; hide it so only one panel shows
        ui.hide('pause');
        ui.openArmory();
    }

    function closeArmory() {
        ui.closeArmory();
        if (armoryReturn === 'paused') ui.show('pause');
        armoryReturn = null;
        syncHud();
        ui.refreshTitle();
        if (mode === 'over') {
            var retry = doc.getElementById('btn-retry');
            if (retry) retry.focus({ preventScroll: true });
        }
    }

    // Anything the armory changed that the game should reflect right now.
    ui.init({
        sound: sound,
        onChange: function (kind) {
            ui.setCherries(store.data.cherries);
            ui.setBest(store.data.best);
            if (kind === 'reset') {
                sound.setEnabled(store.data.sound);
                ui.setSoundIcon(sound.enabled);
                bestAtStart = 0;
            }
        }
    });
    ui.setSoundIcon(sound.enabled);

    function toggleSound() {
        sound.unlock();
        sound.setEnabled(!sound.enabled);
        store.data.sound = sound.enabled;
        store.save();
        ui.setSoundIcon(sound.enabled);
        sound.click();
    }

    // --- buttons -----------------------------------------------------------------

    function on(id, fn) {
        doc.getElementById(id).addEventListener('click', function (e) {
            sound.unlock();
            this.blur();
            e.stopPropagation();
            fn();
        });
    }

    on('btn-play', startRun);
    on('btn-title-armory', openArmory);
    on('btn-pause', pause);
    on('btn-sound', toggleSound);
    on('btn-armory', openArmory);
    on('btn-resume', resume);
    on('btn-pause-restart', startRun);
    on('btn-pause-home', toTitle);
    on('btn-retry', startRun);
    on('btn-over-armory', openArmory);
    on('btn-over-home', toTitle);
    on('btn-armory-close', closeArmory);
    on('btn-title-multi', function () { multi.open(); });
    on('btn-leave', askLeave);
    on('btn-leave-stay', closeLeave);
    on('btn-leave-go', leaveRoom);

    multi.init({
        sound: sound, store: store, ui: ui,
        enterLobbyScene: enterLobbyScene, showTitle: toTitle,
        prepare: prepareRace, go: goRace
    });

    // tapping the dimmed backdrop closes the armory
    doc.getElementById('screen-armory').addEventListener('pointerdown', function (e) {
        if (e.target === this) closeArmory();
    });

    // --- play input --------------------------------------------------------------

    function pressStart() {
        if (mode !== 'play' || leaveOpen) return;
        sound.unlock();
        holding = true;
        game.press();
    }

    function pressEnd() {
        if (!holding) return;
        holding = false;
        if (mode === 'play') game.release();
    }

    app.addEventListener('pointerdown', function (e) {
        if (mode !== 'play' || e.button > 0) return;
        if (e.target.closest('button')) return;
        pressStart();
    });
    root.addEventListener('pointerup', pressEnd);
    root.addEventListener('pointercancel', pressEnd);
    // A race never freezes for anyone: losing focus only lets go of the stick.
    root.addEventListener('blur', function () { pressEnd(); pause(); });
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) { pressEnd(); pause(); } });
    app.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // --- keyboard ----------------------------------------------------------------

    root.addEventListener('keydown', function (e) {
        var key = e.key;
        var onButton = e.target && e.target.closest && e.target.closest('button');
        var typing = e.target && e.target.tagName === 'INPUT';

        if (key === 'Escape') {
            if (leaveOpen) closeLeave();
            else if (inRace() || mode === 'mpout') askLeave();
            else if (mode === 'lobby') multi.close();
            else if (ui.armoryOpen) closeArmory();
            else if (mode === 'play') pause();
            else if (mode === 'paused') resume();
            return;
        }
        if (ui.armoryOpen || typing) return;

        if (key === 'm' || key === 'M') { toggleSound(); return; }
        if (key === 'a' || key === 'A') { if (mode !== 'paused') openArmory(); return; }
        if (key === 'p' || key === 'P') {
            if (mode === 'play') pause(); else if (mode === 'paused') resume();
            return;
        }

        var action = key === ' ' || key === 'Spacebar' || key === 'Enter';
        if (!action) return;

        if (mode === 'play') {
            e.preventDefault();
            if (!e.repeat && key !== 'Enter') pressStart();
        } else if (!onButton) {
            if (mode === 'title') { e.preventDefault(); startRun(); }
            else if (mode === 'over' && root.performance.now() - overAt > 450) { e.preventDefault(); startRun(); }
            else if (mode === 'paused') { e.preventDefault(); resume(); }
        }
    });

    root.addEventListener('keyup', function (e) {
        if (e.key === ' ' || e.key === 'Spacebar') {
            if (mode === 'play') e.preventDefault();
            pressEnd();
        }
    });

    // --- frame loop --------------------------------------------------------------

    var last = 0;
    function frame(now) {
        var dt = last ? now - last : 16;
        last = now;
        // Schedule first: a paint error must never freeze the game.
        root.requestAnimationFrame(frame);
        if (mode === 'play') game.update(dt);
        if (multi.inRoom()) {
            if (mode === 'play') multi.reportView(game, now);
            multi.frame(now, dt);
        }
        renderer.render(game, now, {
            hero: cat.find('heroes', store.data.equipped.hero),
            stick: cat.find('sticks', store.data.equipped.stick),
            map: cat.find('maps', multi.mapId() || store.data.equipped.map)
        });
        ui.tick(now);
    }

    toTitle();
    root.requestAnimationFrame(frame);
    // An invite link (?room=ABCD) drops the player straight into the join form.
    if (multi.invite) multi.open();

    // Handy for the automated browser tests; harmless in production.
    SH.debug = { game: game, renderer: renderer, store: store, getMode: function () { return mode; }, multi: multi };
})(window);