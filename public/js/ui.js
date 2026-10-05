/*
 * Stick Hero - interface layer.
 *
 * Owns every DOM node outside the canvas: HUD, screens, armory, toasts.
 * It never touches game rules; main.js tells it what to show.
 */
(function (root) {
    'use strict';
    var SH = (root.SH = root.SH || {});
    var store = SH.store, cat = SH.catalog, D = SH.draw;

    var doc = root.document;
    function $(id) { return doc.getElementById(id); }
    function ico(id) { return '<svg class="ico" aria-hidden="true"><use href="#' + id + '"/></svg>'; }

    var QUIPS = [
        'Not even one gap. Bold strategy.',
        'The stick was clearly too short. Clearly.',
        'Every bridge starts somewhere.',
        'Nice start. The ground disagrees.',
        'Getting the hang of it.',
        'Solid. Your stick-sense is improving.',
        'Now we are cooking.',
        'Properly good run.',
        'Ninja-level bridge work.',
        'The cherries are jealous.'
    ];

    var UI = {
        tab: 'heroes',
        sound: null,
        onChange: function () {},
        armoryOpen: false,
        resetArmed: false
    };

    var el = {};
    var toastTimer = 0, hintTimer = 0;

    function restart(node, cls) {
        node.classList.remove(cls);
        void node.offsetWidth; // force reflow so the animation replays
        node.classList.add(cls);
    }

    UI.init = function (opts) {
        opts = opts || {};
        UI.sound = opts.sound;
        UI.onChange = opts.onChange || UI.onChange;
        [
            'hud', 'hud-score', 'hud-best', 'hud-cherries', 'hud-combo', 'hint', 'callout', 'toast',
            'screen-title', 'screen-pause', 'screen-over', 'screen-armory', 'title-hero', 'title-stats',
            'over-badge', 'over-score', 'over-best', 'over-cherries', 'over-perfects', 'over-combo', 'over-quip',
            'over-feats', 'armory-body', 'armory-cherries', 'btn-daily', 'daily-label', 'sound-use', 'btn-sound'
        ].forEach(function (id) { el[id] = $(id); });

        doc.querySelectorAll('.tab').forEach(function (tab) {
            tab.addEventListener('click', function () { UI.setTab(tab.dataset.tab); });
            tab.addEventListener('keydown', function (e) {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                var tabs = Array.prototype.slice.call(doc.querySelectorAll('.tab'));
                var i = tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1);
                var next = tabs[(i + tabs.length) % tabs.length];
                UI.setTab(next.dataset.tab);
                next.focus();
            });
        });

        el['armory-body'].addEventListener('click', onArmoryClick);
        el['btn-daily'].addEventListener('click', onDaily);
    };

    // --- screens ---------------------------------------------------------------

    UI.show = function (name) { $('screen-' + name).hidden = false; };
    UI.hide = function (name) { $('screen-' + name).hidden = true; };
    UI.hideAll = function () { ['title', 'pause', 'over', 'armory'].forEach(UI.hide); };
    UI.hud = function (on) { el.hud.hidden = !on; };

    // --- HUD -------------------------------------------------------------------

    UI.setScore = function (n, pop) {
        el['hud-score'].textContent = n;
        if (pop) restart(el['hud-score'], 'pop');
    };
    UI.setBest = function (n) { el['hud-best'].textContent = n; };
    UI.setCherries = function (n, bump) {
        el['hud-cherries'].textContent = n;
        el['armory-cherries'].textContent = n;
        if (bump) restart(el['hud-cherries'].parentNode, 'bump');
    };
    UI.setCombo = function (n) {
        var tag = el['hud-combo'];
        if (n < 2) { tag.hidden = true; return; }
        tag.hidden = false;
        tag.textContent = 'COMBO x' + n;
        restart(tag, 'pop');
    };
    UI.setSoundIcon = function (on) {
        el['sound-use'].setAttribute('href', on ? '#i-sound-on' : '#i-sound-off');
        el['btn-sound'].setAttribute('aria-pressed', on ? 'false' : 'true');
    };

    UI.callout = function (text) {
        var c = el.callout;
        c.textContent = text;
        restart(c, 'show');
    };

    UI.hint = function (html, ms) {
        var h = el.hint;
        clearTimeout(hintTimer);
        if (!html) { h.hidden = true; return; }
        h.classList.remove('leaving');
        h.innerHTML = html;
        h.hidden = false;
        if (ms) {
            hintTimer = setTimeout(function () {
                h.classList.add('leaving');
                hintTimer = setTimeout(function () { h.hidden = true; h.classList.remove('leaving'); }, 260);
            }, ms);
        }
    };

    UI.toast = function (msg) {
        var t = el.toast;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2300);
    };

    // --- title and game over -----------------------------------------------------

    UI.refreshTitle = function () {
        var d = store.data;
        var bits = [];
        if (d.best > 0) bits.push('Best ' + d.best);
        if (d.stats.games > 0) bits.push(d.stats.games + (d.stats.games === 1 ? ' run' : ' runs'));
        if (store.canClaimDaily()) bits.push('Daily gift waiting');
        el['title-stats'].textContent = bits.join('  \u2022  ');
    };

    UI.showOver = function (r) {
        el['over-score'].textContent = r.score;
        el['over-best'].textContent = r.best;
        el['over-cherries'].textContent = r.cherries;
        el['over-perfects'].textContent = r.perfects;
        el['over-combo'].textContent = r.bestCombo;
        el['over-badge'].hidden = !r.newBest;
        el['over-quip'].textContent = QUIPS[Math.min(QUIPS.length - 1, Math.floor(r.score / 4))];

        var list = el['over-feats'];
        list.innerHTML = '';
        r.feats.forEach(function (f, i) {
            var li = doc.createElement('li');
            li.style.animationDelay = (0.25 + i * 0.12) + 's';
            li.innerHTML = ico('i-trophy') + '<span><b>' + f.name + '</b> &middot; ' + f.desc + '</span><em>+' + f.reward + '</em>' + ico('i-cherry');
            list.appendChild(li);
        });
        list.hidden = r.feats.length === 0;
        UI.show('over');
    };

    // --- armory ------------------------------------------------------------------

    UI.openArmory = function () {
        UI.armoryOpen = true;
        UI.resetArmed = false;
        UI.show('armory');
        UI.setTab(UI.tab);
        UI.refreshDaily();
        var active = doc.querySelector('.tab.is-active');
        if (active) active.focus({ preventScroll: true });
    };

    UI.closeArmory = function () {
        UI.armoryOpen = false;
        UI.hide('armory');
    };

    UI.setTab = function (name) {
        UI.tab = name;
        UI.resetArmed = false;
        doc.querySelectorAll('.tab').forEach(function (t) {
            var on = t.dataset.tab === name;
            t.classList.toggle('is-active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            t.tabIndex = on ? 0 : -1;
        });
        el['armory-body'].scrollTop = 0;
        UI.renderArmory();
    };

    UI.refreshDaily = function () {
        var can = store.canClaimDaily();
        el['btn-daily'].disabled = !can;
        el['daily-label'].textContent = can ? 'Daily gift' : 'Back tomorrow';
    };

    UI.renderArmory = function () {
        var body = el['armory-body'];
        var top = body.scrollTop;
        el['armory-cherries'].textContent = store.data.cherries;
        body.innerHTML = UI.tab === 'records' ? recordsHTML() : gridHTML(UI.tab);
        body.scrollTop = top;
    };

    function gridHTML(type) {
        var slot = type === 'heroes' ? 'hero' : 'stick';
        var equipped = store.data.equipped[slot];
        var out = '<div class="grid">';
        cat.list(type).forEach(function (item) {
            var owned = store.owns(type, item.id);
            var on = equipped === item.id;
            var r = cat.rarity(item.cost);
            var action;
            if (on) {
                action = '<button class="btn btn-on" type="button" disabled>' + ico('i-check') + 'Equipped</button>';
            } else if (owned) {
                action = '<button class="btn btn-equip" type="button" data-act="equip" data-type="' + type + '" data-id="' + item.id + '">Equip</button>';
            } else if (store.data.cherries >= item.cost) {
                action = '<button class="btn btn-buy" type="button" data-act="buy" data-type="' + type + '" data-id="' + item.id + '">' + ico('i-cherry') + item.cost + '</button>';
            } else {
                action = '<button class="btn btn-short" type="button" data-act="short" data-type="' + type + '" data-id="' + item.id + '">' + ico('i-lock') + item.cost + '</button>';
            }
            out += '<article class="card' + (on ? ' is-equipped' : '') + (owned ? '' : ' is-locked') + '">' +
                '<span class="rarity rarity-' + r.id + '">' + r.label + '</span>' +
                '<canvas class="preview ' + (type === 'heroes' ? 'bg-hero' : 'bg-stick') + '" data-type="' + type + '" data-id="' + item.id + '"></canvas>' +
                '<div class="card-name">' + item.name + '</div>' +
                '<p class="card-desc">' + item.desc + '</p>' + action + '</article>';
        });
        return out + '</div>';
    }

    function recordsHTML() {
        var d = store.data, s = d.stats;
        var avg = s.games ? Math.floor(s.totalScore / s.games) : 0;
        var cells = [
            ['Best score', d.best], ['Runs played', s.games], ['Average score', avg],
            ['Cherries found', s.cherriesEarned], ['Perfect drops', s.perfects], ['Best combo', s.bestCombo]
        ];
        var out = '<div class="records"><dl class="stat-grid">';
        cells.forEach(function (c) { out += '<div class="stat"><dt>' + c[0] + '</dt><dd>' + c[1] + '</dd></div>'; });
        out += '</dl><div><h3 class="section-title">Feats</h3><ul class="feat-list">';
        cat.feats.forEach(function (f) {
            var done = !!d.feats[f.id];
            out += '<li class="feat' + (done ? ' is-done' : '') + '"><span class="badge">' + ico(done ? 'i-trophy' : 'i-lock') + '</span>' +
                '<div><div class="feat-name">' + f.name + '</div><div class="feat-desc">' + f.desc + '</div></div>' +
                '<span class="feat-reward">+' + f.reward + ico('i-cherry') + '</span></li>';
        });
        out += '</ul></div><div class="reset-row"><button class="link-btn" type="button" data-act="reset">' +
            (UI.resetArmed ? 'Tap again to erase all progress' : 'Reset progress') + '</button></div></div>';
        return out;
    }

    function onArmoryClick(e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        var act = btn.dataset.act, type = btn.dataset.type, id = btn.dataset.id;
        var slot = type === 'heroes' ? 'hero' : 'stick';

        if (act === 'equip') {
            store.data.equipped[slot] = id;
            store.save();
            UI.sound.click();
            UI.renderArmory();
        } else if (act === 'buy') {
            var item = cat.find(type, id);
            if (!store.spendCherries(item.cost)) { UI.sound.nope(); return; }
            store.data[type].push(id);
            store.data.equipped[slot] = id;
            store.save();
            UI.sound.unlockChime();
            UI.toast(item.name + ' unlocked');
            afterEconomyChange();
        } else if (act === 'short') {
            var need = cat.find(type, id).cost - store.data.cherries;
            UI.sound.nope();
            UI.toast('Need ' + need + ' more ' + (need === 1 ? 'cherry' : 'cherries'));
        } else if (act === 'reset') {
            if (!UI.resetArmed) { UI.resetArmed = true; UI.renderArmory(); return; }
            store.reset();
            UI.resetArmed = false;
            UI.toast('Progress erased');
            UI.onChange('reset');
            UI.renderArmory();
            UI.refreshDaily();
        }
    }

    function afterEconomyChange() {
        var earned = cat.evaluateFeats(store, null);
        if (earned.length) {
            UI.toast('Feat: ' + earned.map(function (f) { return f.name + ' +' + f.reward; }).join(', '));
        }
        UI.onChange('economy');
        UI.renderArmory();
    }

    function onDaily() {
        var r = store.claimDaily();
        if (!r.ok) { UI.sound.nope(); return; }
        UI.sound.unlockChime();
        UI.toast('+' + r.amount + ' cherries' + (r.streak > 1 ? ' (' + r.streak + ' day streak)' : ''));
        UI.refreshDaily();
        UI.onChange('economy');
        UI.renderArmory();
    }

    // --- per-frame preview animation ------------------------------------------------

    UI.tick = function (now) {
        if (!el['screen-title'].hidden) {
            D.previewHero(el['title-hero'], cat.find('heroes', store.data.equipped.hero), now, false);
        }
        if (UI.armoryOpen && UI.tab !== 'records') {
            var equipped = store.data.equipped;
            el['armory-body'].querySelectorAll('canvas.preview').forEach(function (cv) {
                if (cv.dataset.type === 'heroes') {
                    D.previewHero(cv, cat.find('heroes', cv.dataset.id), now, equipped.hero === cv.dataset.id);
                } else {
                    D.previewStick(cv, cat.find('sticks', cv.dataset.id).style, now);
                }
            });
        }
    };

    SH.ui = UI;
})(window);