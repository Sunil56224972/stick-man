/*
 * Stick Hero - content tables: heroes, sticks and feats.
 * Data plus a little feat logic. No DOM access, so it runs under Node tests.
 */
(function (root) {
    'use strict';
    var SH = (root.SH = root.SH || {});

    // body/legs: outfit, band: headband and tails, face: skin, belt: sash.
    var HEROES = [
        { id: 'classic', name: 'Classic Ninja', cost: 0,  desc: 'Ink-black shinobi, red headband. Never late.',
          body: '#2b2740', legs: '#221f33', band: '#e4472f', face: '#f2d3ac', belt: '#e4472f' },
        { id: 'shadow',  name: 'Neon Assassin', cost: 10, desc: 'Night-shift operative with cyan trim.',
          body: '#1b2b44', legs: '#142238', band: '#19d3e6', face: '#cfeef3', belt: '#19d3e6' },
        { id: 'jade',    name: 'Jade Monk',     cost: 15, desc: 'Calm, green and suspiciously good at heights.',
          body: '#2f8f6b', legs: '#256f54', band: '#f6ecd6', face: '#f2d3ac', belt: '#f4b73a' },
        { id: 'gold',    name: 'Golden Master', cost: 25, desc: 'Solid gold. Insurance not included.',
          body: '#f0b429', legs: '#c98a14', band: '#7a3fb3', face: '#fff1c9', belt: '#7a3fb3' },
        { id: 'cyber',   name: 'Crimson Ghost', cost: 50, desc: 'Burning embers and a very bad attitude.',
          body: '#b52a22', legs: '#8f1f1a', band: '#ffd23f', face: '#ffe8b0', belt: '#ffd23f' },
        { id: 'ronin',   name: 'Moonlit Ronin', cost: 80, desc: 'Wanders the rooftops under a silver moon.',
          body: '#d9dde8', legs: '#a8aec2', band: '#3b3f63', face: '#f6e6cc', belt: '#3b3f63' }
    ];

    // style maps to a renderer in draw.js
    var STICKS = [
        { id: 'wood',    name: 'Classic Timber', cost: 0,  desc: 'Plain oak. It holds, mostly.',              style: 'wood' },
        { id: 'bamboo',  name: 'Bamboo Staff',   cost: 10, desc: 'Light, springy and very green.',            style: 'bamboo' },
        { id: 'frost',   name: 'Frost Pole',     cost: 15, desc: 'Cold to the touch, slippery in spirit.',    style: 'frost' },
        { id: 'laser',   name: 'Plasma Beam',    cost: 25, desc: 'A bridge made of pure bad ideas.',          style: 'laser' },
        { id: 'rainbow', name: 'Rainbow Prism',  cost: 50, desc: 'Every colour at once, none of the weight.', style: 'rainbow' },
        { id: 'ember',   name: 'Ember Rod',      cost: 80, desc: 'Still glowing from the forge.',             style: 'ember' }
    ];

    function rarity(cost) {
        if (cost === 0) return { id: 'starter', label: 'Starter' };
        if (cost <= 15) return { id: 'common', label: 'Common' };
        if (cost <= 25) return { id: 'rare', label: 'Rare' };
        if (cost <= 50) return { id: 'epic', label: 'Epic' };
        return { id: 'legendary', label: 'Legendary' };
    }

    // d: save data, r: stats of the run that just ended.
    var FEATS = [
        { id: 'first-steps',   name: 'First Steps',    desc: 'Cross your first gap.',                  reward: 2,
          test: function (d, r) { return r.score >= 1; } },
        { id: 'double-digits', name: 'Double Digits',  desc: 'Score 10 in a single run.',              reward: 5,
          test: function (d, r) { return r.score >= 10; } },
        { id: 'night-shift',   name: 'Night Shift',    desc: 'Reach the night sky (score 20).',        reward: 8,
          test: function (d, r) { return r.score >= 20; } },
        { id: 'marathon',      name: 'Marathon',       desc: 'Score 40 in a single run.',              reward: 20,
          test: function (d, r) { return r.score >= 40; } },
        { id: 'sharpshooter',  name: 'Sharpshooter',   desc: 'Land 3 perfects in a row.',              reward: 5,
          test: function (d, r) { return r.bestCombo >= 3; } },
        { id: 'bat-mode',      name: 'Bat Mode',       desc: 'Grab 3 cherries in one run.',            reward: 4,
          test: function (d, r) { return r.cherries >= 3; } },
        { id: 'cherry-picker', name: 'Cherry Picker',  desc: 'Collect 25 cherries in total.',          reward: 5,
          test: function (d) { return d.stats.cherriesEarned >= 25; } },
        { id: 'orchard-owner', name: 'Orchard Owner',  desc: 'Collect 100 cherries in total.',         reward: 15,
          test: function (d) { return d.stats.cherriesEarned >= 100; } },
        { id: 'regular',       name: 'Regular',        desc: 'Play 10 runs.',                          reward: 5,
          test: function (d) { return d.stats.games >= 10; } },
        { id: 'wardrobe',      name: 'Wardrobe',       desc: 'Buy 4 cosmetics.',                       reward: 6,
          test: function (d) { return d.heroes.length + d.sticks.length >= 6; } }
    ];

    var EMPTY_RUN = { score: 0, cherries: 0, perfects: 0, bestCombo: 0 };

    // Marks newly earned feats, pays their reward and returns them.
    function evaluateFeats(store, run) {
        run = run || EMPTY_RUN;
        var earned = [];
        FEATS.forEach(function (f) {
            if (store.data.feats[f.id]) return;
            if (f.test(store.data, run)) {
                store.data.feats[f.id] = true;
                earned.push(f);
            }
        });
        if (earned.length) {
            var total = earned.reduce(function (sum, f) { return sum + f.reward; }, 0);
            store.addCherries(total); // also saves
        }
        return earned;
    }

    SH.catalog = {
        heroes: HEROES,
        sticks: STICKS,
        feats: FEATS,
        rarity: rarity,
        evaluateFeats: evaluateFeats,
        list: function (type) { return type === 'heroes' ? HEROES : STICKS; },
        find: function (type, id) {
            var list = type === 'heroes' ? HEROES : STICKS;
            for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
            return list[0];
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);