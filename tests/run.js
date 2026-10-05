/*
 * Unit tests for the DOM-free parts of Stick Hero.
 * Run with `npm test`. No dependencies: a tiny assert-based runner.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load the browser scripts into one shared global, the way index.html does.
const sandbox = { console, Math, JSON, Date, Object, Array, Number, String, isFinite };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
['storage', 'catalog', 'game'].forEach((name) => {
    const file = path.join(__dirname, '..', 'public', 'js', name + '.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
});
const SH = sandbox.SH;
const { Game } = SH;

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('  ok   ' + name); }
    catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
}

// Deterministic rng so platform layouts are repeatable.
function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function fakeStorage() {
    const m = {};
    return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m };
}
function freshStore(backend) {
    SH.store.backend = () => backend || fakeStorage();
    SH.store.reset();
    return SH.store;
}

// Drive a game step by step. Returns events seen.
function newGame(seed) {
    const events = [];
    const g = new Game({ rng: seeded(seed || 7), onEvent: (n, d) => events.push({ n, d }) });
    return { g, events };
}
function tick(g, ms) { for (let t = 0; t < ms; t += 16) g.update(16); }
function until(g, phase, limit) {
    for (let i = 0; i < (limit || 4000) && g.phase !== phase; i++) g.update(16);
    assert.strictEqual(g.phase, phase, 'never reached phase ' + phase + ' (stuck in ' + g.phase + ')');
}
// Grow the stick to (about) a target length, then release.
function stretchTo(g, len) {
    g.press();
    while (g.currentStick().length < len) g.update(8);
    g.release();
}
// Stretch that lands in the middle of the next platform.
function playPerfect(g) { stretchTo(g, g.idealLength()); until(g, 'walking'); }
function finishCrossing(g) { until(g, 'waiting'); }

console.log('\nGame simulation');

test('starts waiting with 5 platforms and a zero-length stick', () => {
    const { g } = newGame();
    assert.strictEqual(g.phase, 'waiting');
    assert.strictEqual(g.platforms.length, 5);
    assert.strictEqual(g.currentStick().length, 0);
});

test('holding grows the stick, releasing turns it', () => {
    const { g } = newGame();
    g.press();
    assert.strictEqual(g.phase, 'stretching');
    tick(g, 400);
    assert.ok(g.currentStick().length > 80);
    g.release();
    assert.strictEqual(g.phase, 'turning');
});

test('a tap too short to be a stick is ignored', () => {
    const { g } = newGame();
    g.press(); g.release();
    assert.strictEqual(g.phase, 'waiting');
    assert.strictEqual(g.currentStick().length, 0);
});

test('stick length is capped', () => {
    const { g } = newGame();
    g.press();
    tick(g, 10000);
    assert.ok(g.currentStick().length <= Game.C.STICK_MAX);
});

test('a perfect drop scores combo*2 and chains', () => {
    const { g, events } = newGame();
    playPerfect(g); finishCrossing(g);
    assert.strictEqual(g.score, 2);
    assert.strictEqual(g.combo, 1);
    playPerfect(g); finishCrossing(g);
    assert.strictEqual(g.score, 2 + 4);
    assert.strictEqual(g.combo, 2);
    assert.strictEqual(g.bestCombo, 2);
    assert.strictEqual(events.filter((e) => e.n === 'perfect').length, 2);
});

test('a plain landing scores 1 and breaks the combo', () => {
    const { g } = newGame();
    playPerfect(g); finishCrossing(g);
    const p = g.nextPlatform();
    // land near the platform's far edge, clearly off-centre
    const len = p.x + p.w - 3 - g.currentStick().x;
    stretchTo(g, len); until(g, 'walking');
    assert.strictEqual(g.perfectHit, false);
    assert.strictEqual(g.combo, 0);
    assert.strictEqual(g.score, 3);
    finishCrossing(g);
});

test('a stick that is too short makes the hero fall and the run end', () => {
    const { g, events } = newGame();
    stretchTo(g, 10);
    until(g, 'over');
    assert.ok(events.some((e) => e.n === 'fall'));
    assert.ok(events.some((e) => e.n === 'over'));
    assert.strictEqual(g.score, 0);
});

test('a stick that overshoots the platform makes the hero fall', () => {
    const { g } = newGame();
    const p = g.nextPlatform();
    stretchTo(g, p.x + p.w + 6 - g.currentStick().x);
    until(g, 'over');
    assert.strictEqual(g.fallKind, 'miss');
});

test('camera scrolls and a fresh stick is ready after crossing', () => {
    const { g } = newGame();
    playPerfect(g); finishCrossing(g);
    assert.ok(g.offset > 0);
    assert.strictEqual(g.sticks.length, 2);
    assert.strictEqual(g.currentStick().length, 0);
});

test('platform generation keeps the lookahead full', () => {
    const { g } = newGame();
    for (let i = 0; i < 6; i++) { playPerfect(g); finishCrossing(g); }
    assert.ok(g.platforms.filter((p) => p.x > g.currentStick().x).length >= 3);
});

test('difficulty ramps up but stays bounded', () => {
    const { g } = newGame();
    const easy = g.difficulty();
    g.score = 500;
    const hard = g.difficulty();
    assert.ok(hard.gapMax > easy.gapMax && hard.widthMax < easy.widthMax);
    assert.ok(hard.widthMax >= hard.widthMin + 20, 'platforms must stay landable');
    assert.ok(hard.gapMax <= Game.C.STICK_MAX - 20, 'gaps must stay reachable');
});

test('every generated gap is reachable with the max stick', () => {
    const { g } = newGame(99);
    g.score = 500;
    for (let i = 0; i < 300; i++) g._addPlatform();
    for (let i = 1; i < g.platforms.length; i++) {
        const prev = g.platforms[i - 1], cur = g.platforms[i];
        assert.ok(cur.x + cur.w / 2 - (prev.x + prev.w) < Game.C.STICK_MAX, 'unreachable gap at ' + i);
    }
});

test('delta time is clamped so a stalled tab cannot teleport the hero', () => {
    const { g } = newGame();
    g.press();
    g.update(60000);
    assert.ok(g.currentStick().length <= Game.C.STICK_MAX);
    assert.ok(g.currentStick().length <= Game.C.MAX_DT * Game.C.STRETCH + 0.001);
});

console.log('\nFlip and cherries');

function startCrossing(g) {
    // Park a cherry in the gap and walk out onto the stick.
    playPerfect(g);
    return g;
}

test('tapping while walking flips the hero', () => {
    const { g, events } = newGame();
    startCrossing(g);
    tick(g, 220); // walk out past the platform lip
    g.press();
    assert.strictEqual(g.flipped, true);
    assert.ok(events.some((e) => e.n === 'flip' && e.d.upside));
    g.press();
    assert.strictEqual(g.flipped, false);
});

test('flip is refused before the hero has left the platform', () => {
    const { g, events } = newGame();
    startCrossing(g);
    g.press();
    assert.strictEqual(g.flipped, false);
    assert.ok(events.some((e) => e.n === 'flipDenied'));
});

test('a flipped hero collects cherries; an upright hero does not', () => {
    const { g, events } = newGame();
    startCrossing(g);
    const sx = g.currentStick().x;
    g.cherries.push({ x: sx + g.currentStick().length * 0.45, taken: false });
    const c = g.cherries[g.cherries.length - 1];
    tick(g, 200);
    g.press();                      // flip
    while (g.phase === 'walking' && !c.taken) g.update(8);
    assert.strictEqual(c.taken, true);
    g.press();                      // flip back before the pillar
    until(g, 'waiting');
    assert.strictEqual(g.cherriesRun >= 1, true);
    assert.ok(events.some((e) => e.n === 'cherry'));

    const other = newGame(7);
    startCrossing(other.g);
    const c2 = { x: other.g.currentStick().x + other.g.currentStick().length * 0.45, taken: false };
    other.g.cherries.push(c2);
    until(other.g, 'waiting');      // never flips
    assert.strictEqual(c2.taken, false);
});

test('arriving still upside down crashes into the pillar', () => {
    const { g, events } = newGame();
    startCrossing(g);
    tick(g, 200);
    g.press();                      // flip and never flip back
    until(g, 'over');
    assert.strictEqual(g.fallKind, 'pillar');
    assert.ok(events.some((e) => e.n === 'crash'));
});

test('flipping back in time lets the hero arrive safely', () => {
    const { g } = newGame();
    startCrossing(g);
    tick(g, 200);
    g.press();
    const target = g.target;
    while (g.heroX < target.x - 40 && g.phase === 'walking') g.update(8);
    g.press();                      // upright again
    assert.strictEqual(g.flipped, false);
    until(g, 'waiting');
    assert.strictEqual(g.cherriesRun >= 0, true);
});

test('cancelStretch discards a held stick', () => {
    const { g } = newGame();
    g.press(); tick(g, 200);
    g.cancelStretch();
    assert.strictEqual(g.phase, 'waiting');
    assert.strictEqual(g.currentStick().length, 0);
});

test('a long scripted run never throws or stalls', () => {
    const { g } = newGame(1234);
    for (let i = 0; i < 40; i++) { playPerfect(g); finishCrossing(g); }
    assert.ok(g.score > 100);
    assert.ok(g.platforms.length < 40, 'old platforms are culled');
});

console.log('\nStorage');

test('fresh store has sane defaults', () => {
    const s = freshStore();
    s.load();
    assert.strictEqual(s.data.cherries, 0);
    assert.strictEqual(JSON.stringify(s.data.heroes), '["classic"]');
    assert.strictEqual(s.data.equipped.stick, 'wood');
});

test('save and load round-trips', () => {
    const b = fakeStorage();
    const s = freshStore(b);
    s.data.best = 42; s.data.heroes.push('gold'); s.data.equipped.hero = 'gold';
    s.addCherries(7);
    s.load();
    assert.strictEqual(s.data.best, 42);
    assert.strictEqual(s.data.cherries, 7);
    assert.strictEqual(s.data.equipped.hero, 'gold');
});

test('corrupt save falls back to defaults', () => {
    const b = fakeStorage();
    b.setItem('stickhero.save.v2', '{not json');
    SH.store.backend = () => b;
    SH.store.load();
    assert.strictEqual(SH.store.data.cherries, 0);
});

test('tampered values are coerced: negatives, wrong types, unowned equips', () => {
    const d = SH.store._sanitize({ best: -5, cherries: 'abc', heroes: ['classic'], equipped: { hero: 'gold', stick: 'nope' }, sound: 'x' });
    assert.strictEqual(d.best, 0);
    assert.strictEqual(d.cherries, 0);
    assert.strictEqual(d.equipped.hero, 'classic');
    assert.strictEqual(d.equipped.stick, 'wood');
});

test('v1 save keys migrate once', () => {
    const b = fakeStorage();
    b.setItem('stickman_high_score', '31');
    b.setItem('stickman_cherries', '12');
    b.setItem('stickman_unlocked_heroes', '["classic","gold"]');
    b.setItem('stickman_equipped_hero', 'gold');
    SH.store.backend = () => b;
    SH.store.reset();     // clears in-memory fallback
    b._m = null;
    const clean = fakeStorage();
    ['stickman_high_score', 'stickman_cherries', 'stickman_unlocked_heroes', 'stickman_equipped_hero'].forEach((k) => clean.setItem(k, b.getItem(k)));
    SH.store.backend = () => clean;
    SH.store._write = function (k, v) { clean.setItem(k, v); };
    delete clean._m;
    const legacy = SH.store._legacy();
    const d = SH.store._sanitize(legacy);
    assert.strictEqual(d.best, 31);
    assert.strictEqual(d.cherries, 12);
    assert.strictEqual(d.equipped.hero, 'gold');
});

test('storage that throws never crashes the game', () => {
    SH.store.backend = () => ({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
    SH.store.load();
    SH.store.addCherries(3);
    assert.strictEqual(SH.store.data.cherries, 3);
});

test('spendCherries refuses when short and deducts when it can', () => {
    const s = freshStore();
    s.addCherries(5);
    assert.strictEqual(s.spendCherries(10), false);
    assert.strictEqual(s.data.cherries, 5);
    assert.strictEqual(s.spendCherries(5), true);
    assert.strictEqual(s.data.cherries, 0);
});

console.log('\nDaily gift');

test('claims once per day', () => {
    const s = freshStore();
    const d1 = new Date(2026, 0, 10, 9);
    assert.strictEqual(s.claimDaily(d1).ok, true);
    assert.strictEqual(s.claimDaily(new Date(2026, 0, 10, 22)).ok, false);
    assert.strictEqual(s.data.cherries, 10);
});

test('consecutive days build a streak bonus, a gap resets it', () => {
    const s = freshStore();
    assert.strictEqual(s.claimDaily(new Date(2026, 0, 10)).amount, 10);
    assert.strictEqual(s.claimDaily(new Date(2026, 0, 11)).amount, 12);
    assert.strictEqual(s.claimDaily(new Date(2026, 0, 12)).amount, 14);
    const skip = s.claimDaily(new Date(2026, 0, 15));
    assert.strictEqual(skip.streak, 1);
    assert.strictEqual(skip.amount, 10);
});

test('streak bonus is capped', () => {
    const s = freshStore();
    let r;
    for (let i = 0; i < 15; i++) r = s.claimDaily(new Date(2026, 2, 1 + i));
    assert.strictEqual(r.amount, 22);
});

console.log('\nCatalog and feats');

test('all ids are unique and every starter is free', () => {
    ['heroes', 'sticks'].forEach((t) => {
        const ids = SH.catalog[t].map((x) => x.id);
        assert.strictEqual(new Set(ids).size, ids.length);
        assert.strictEqual(SH.catalog[t][0].cost, 0);
    });
});

test('feats pay out once and only once', () => {
    const s = freshStore();
    const run = { score: 12, cherries: 0, perfects: 0, bestCombo: 0 };
    const first = SH.catalog.evaluateFeats(s, run);
    const names = first.map((f) => f.id);
    assert.ok(names.includes('first-steps') && names.includes('double-digits'));
    const paid = s.data.cherries;
    assert.ok(paid >= 7);
    assert.strictEqual(SH.catalog.evaluateFeats(s, run).length, 0);
    assert.strictEqual(s.data.cherries, paid);
});

test('stats-based feats use lifetime totals', () => {
    const s = freshStore();
    s.data.stats.games = 10;
    const got = SH.catalog.evaluateFeats(s, null).map((f) => f.id);
    assert.strictEqual(JSON.stringify(got), '["regular"]');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);