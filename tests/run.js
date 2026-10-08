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
['storage', 'maps', 'catalog', 'game'].forEach((name) => {
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

// --- footsteps -------------------------------------------------------------------

// Walk a perfect bridge and record when (in ms of walking) each footstep fires.
function recordSteps(len, flipAt) {
    const times = [], dist = [];
    const g = new SH.Game({ onEvent: (n) => { if (n === 'step') { times.push(g.time); dist.push(g.walkDist); } } });
    g.rng = seeded(7);
    g.press(); while (g.currentStick().length < len) g.update(8); g.release();
    until(g, 'walking');
    const t0 = g.time;
    if (flipAt != null) { while (g.heroX < g.currentStick().x + flipAt) g.update(8); g.press(); }
    while (g.phase === 'walking') g.update(8);
    return { g, times: times.map((t) => t - t0), dist };
}

test('footsteps come at a natural walking cadence, not a rattle', () => {
    const { times } = recordSteps(230);
    assert.ok(times.length >= 3, 'expected several steps, got ' + times.length);
    for (let i = 1; i < times.length; i++) {
        const gap = times[i] - times[i - 1];
        // 2.5 to 5 steps a second is a walk; faster sounds like a machine gun
        assert.ok(gap >= 200 && gap <= 400, 'step gap ' + gap + 'ms is not a walking rhythm');
    }
});

test('footsteps are evenly spaced', () => {
    const { dist } = recordSteps(230);
    for (let i = 1; i < dist.length; i++) {
        assert.ok(Math.abs(dist[i] - dist[i - 1] - SH.Game.C.STEP_DIST) < 1.5, 'uneven stride');
    }
});

test('no footsteps while hanging under the stick', () => {
    const flippedRun = recordSteps(230, 20).times.length;
    const normalRun = recordSteps(230).times.length;
    assert.ok(flippedRun < normalRun, 'flipped hero should be silent underneath');
});

test('a short stick still gets its first step well after the stick lands', () => {
    const { times } = recordSteps(60);
    if (times.length) assert.ok(times[0] > 60, 'first footfall too soon: ' + times[0] + 'ms');
});

test('the legs hit their widest stride exactly when a footfall fires', () => {
    // renderer: phase = walkDist * PI / STEP_DIST, swing = sin(phase); feet land at |sin| = 1
    const C = SH.Game.C;
    const { dist } = recordSteps(230);
    dist.forEach((d) => {
        const swing = Math.abs(Math.sin(d * Math.PI / C.STEP_DIST));
        assert.ok(swing > 0.99, 'foot lands mid-swing (|sin| = ' + swing.toFixed(2) + ')');
    });
});
test('starts waiting with at least 5 platforms and a zero-length stick', () => {
    const { g } = newGame();
    assert.strictEqual(g.phase, 'waiting');
    assert.ok(g.platforms.length >= 5);
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

test('skipping a platform with a long stick keeps the course ahead full', () => {
    const { g } = newGame(11);
    playPerfect(g); finishCrossing(g);
    const root = g.currentStick().x;
    const ahead = g.platforms.filter((p) => p.x > root);
    const far = ahead[1];
    stretchTo(g, far.x + far.w / 2 - root);
    until(g, 'walking');
    assert.strictEqual(g.target, far, 'the stick should land on the second platform');
    finishCrossing(g);
    const now = g.platforms.filter((p) => p.x > far.x);
    const last = g.platforms[g.platforms.length - 1];
    assert.ok(now.length >= Game.C.AHEAD_COUNT, 'only ' + now.length + ' platforms ahead');
    assert.ok(last.x + last.w >= far.x + far.w + Game.C.AHEAD_DIST, 'course ends too close');
});

test('a fresh course already fills the widest screen', () => {
    const { g } = newGame(3);
    const last = g.platforms[g.platforms.length - 1];
    assert.ok(g.platforms.length - 1 >= Game.C.AHEAD_COUNT);
    assert.ok(last.x + last.w >= Game.C.START_X + Game.C.START_W + Game.C.AHEAD_DIST);
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
    ['heroes', 'sticks', 'maps'].forEach((t) => {
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

console.log('\nMaps');

const PAL_KEYS = ['skyTop', 'skyBot', 'far', 'mid', 'near', 'pillar', 'rim', 'tree', 'cloud', 'mist', 'accent'];
const PILLARS = ['brick', 'lacquer', 'sandstone', 'ice', 'neon', 'basalt'];
const WEATHER = ['petals', 'snow', 'embers', 'dust', 'rain', 'fireflies'];
const SHAPES = ['rolling', 'peaks', 'volcano', 'mesa', 'dunes', 'skyline'];

test('there are six maps and the first is the free default', () => {
    assert.strictEqual(SH.maps.length, 6);
    assert.strictEqual(SH.maps[0].id, 'meadow');
    assert.strictEqual(SH.maps[0].cost, 0);
});

test('every map defines three full palettes of valid hex colours', () => {
    SH.maps.forEach((m) => {
        assert.strictEqual(m.themes.length, 3, m.id);
        m.themes.forEach((th) => PAL_KEYS.forEach((k) => {
            assert.ok(/^#[0-9a-f]{6}$/i.test(th[k]), m.id + ' ' + k + ' = ' + th[k]);
        }));
    });
});

test('every map uses a known pillar, weather and ridge shape', () => {
    SH.maps.forEach((m) => {
        assert.ok(PILLARS.includes(m.pillar), m.id + ' pillar ' + m.pillar);
        assert.ok(WEATHER.includes(m.weather), m.id + ' weather ' + m.weather);
        assert.strictEqual(m.layers.length, 3, m.id);
        m.layers.forEach((L) => {
            assert.ok(SHAPES.includes(L.shape), m.id + ' shape ' + L.shape);
            assert.ok(['far', 'mid', 'near'].includes(L.color));
        });
    });
});

test('maps are priced in ascending order and are all distinct', () => {
    const costs = SH.maps.map((m) => m.cost);
    assert.strictEqual(JSON.stringify(costs), JSON.stringify(costs.slice().sort((a, b) => a - b)));
    assert.strictEqual(new Set(SH.maps.map((m) => m.pillar)).size, 6);
    assert.strictEqual(new Set(SH.maps.map((m) => m.weather)).size, 6);
});

test('catalog resolves maps and falls back to the first for unknown ids', () => {
    assert.strictEqual(SH.catalog.find('maps', 'frost').name, 'Frozen Peaks');
    assert.strictEqual(SH.catalog.find('maps', 'nope').id, 'meadow');
    assert.strictEqual(SH.catalog.slot('maps'), 'map');
});

test('a save from before maps existed gets the starter map', () => {
    const d = SH.store._sanitize({ best: 9, heroes: ['classic'], sticks: ['wood'], equipped: { hero: 'classic', stick: 'wood' } });
    assert.strictEqual(JSON.stringify(d.maps), '["meadow"]');
    assert.strictEqual(d.equipped.map, 'meadow');
});

test('an unowned or unknown equipped map is reset to the starter', () => {
    const d = SH.store._sanitize({ maps: ['meadow'], equipped: { map: 'volcano' } });
    assert.strictEqual(d.equipped.map, 'meadow');
    const e = SH.store._sanitize({ maps: ['meadow', 'volcano'], equipped: { map: 'volcano' } });
    assert.strictEqual(e.equipped.map, 'volcano');
});

test('map feats: Globetrotter at 3 maps, Frequent Flyer needs score 15 off the meadow', () => {
    const s = freshStore();
    s.data.maps.push('sakura', 'desert');
    assert.ok(SH.catalog.evaluateFeats(s, null).some((f) => f.id === 'globetrotter'));
    const run = (map) => ({ score: 16, cherries: 0, perfects: 0, bestCombo: 0, map });
    assert.ok(!SH.catalog.evaluateFeats(freshStore(), run('meadow')).some((f) => f.id === 'frequent-flyer'));
    assert.ok(SH.catalog.evaluateFeats(freshStore(), run('frost')).some((f) => f.id === 'frequent-flyer'));
});

console.log('\nLive spectating');

// A real player and a ghost on the same seed. The ghost only ever sees snapshots.
function liveRun(seed, steps, frameMs, sendEvery) {
    const real = new Game({ seed });
    const ghost = new Game({ seed, ghost: true });
    let lastErr = 0, worst = 0, sent = 0, t = 0;
    const script = [];
    for (let i = 0; i < steps; i++) script.push(i % 3 === 0 ? 'bad' : 'good');
    let idx = 0;
    for (let ms = 0; ms < 60000 && real.phase !== 'over' && idx <= steps; ms += frameMs) {
        if (real.phase === 'waiting' && idx < steps) {
            real.press();
            real._want = script[idx++] === 'good' ? real.idealLength() : real.idealLength() * 0.6;
        }
        if (real.phase === 'stretching' && real.currentStick().length >= real._want) real.release();
        real.update(frameMs);
        t += frameMs;
        if (t >= sendEvery) { t = 0; ghost.mirror(real.snapshot()); sent++; }
        ghost.update(frameMs);
        if (real.phase === 'walking' && ghost.phase === 'walking') worst = Math.max(worst, Math.abs(real.heroX - ghost.heroX));
    }
    ghost.mirror(real.snapshot());
    return { real, ghost, worst, sent };
}

test('a ghost follows a real run through every bridge, then the fall', () => {
    const { real, ghost } = liveRun(4242, 5, 16, 50);
    assert.strictEqual(real.phase, 'over');
    for (let i = 0; i < 200; i++) ghost.update(16);
    assert.strictEqual(ghost.phase, 'over');
    assert.strictEqual(ghost.score, real.score);
    assert.strictEqual(ghost.fallKind, real.fallKind);
});

test('a ghost builds the same course as the player it mirrors', () => {
    const { real, ghost } = liveRun(99, 3, 16, 50);
    const n = Math.min(real.platforms.length, ghost.platforms.length);
    assert.ok(n >= 4);
    for (let i = 0; i < n; i++) assert.deepStrictEqual(ghost.platforms[i], real.platforms[i]);
});

test('a ghost stays within a few pixels of the real hero while walking', () => {
    const { worst } = liveRun(7, 4, 16, 50);
    assert.ok(worst < 14, 'drifted ' + worst + 'px');
});

test('a ghost survives dropped snapshots and slow frames', () => {
    const { real, ghost } = liveRun(31, 4, 33, 250);
    for (let i = 0; i < 300; i++) ghost.update(33);
    assert.strictEqual(ghost.score, real.score);
    assert.strictEqual(ghost.phase, 'over');
});

test('a ghost ignores stale snapshots and junk', () => {
    const real = new Game({ seed: 5 }), ghost = new Game({ seed: 5, ghost: true });
    real.press(); tick(real, 400); real.release(); tick(real, 100);
    assert.strictEqual(real.phase, 'turning');
    const early = real.snapshot();
    until(real, 'walking'); tick(real, 100);
    ghost.mirror(real.snapshot());
    const x = ghost.heroX;
    ghost.mirror(early);
    assert.strictEqual(ghost.heroX, x);
    ghost.mirror(null); ghost.mirror({ p: 'nope' });
    assert.strictEqual(ghost.heroX, x);
});

test('a ghost never invents scores or platforms on its own', () => {
    const ghost = new Game({ seed: 8, ghost: true });
    const made = ghost.made;
    for (let i = 0; i < 100; i++) ghost.update(16);
    assert.strictEqual(ghost.score, 0);
    assert.strictEqual(ghost.made, made);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);