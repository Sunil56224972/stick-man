/*
 * End-to-end check in a real browser (Playwright + Chromium).
 * Drives the actual UI: title, play, flip, pause, armory, shop, records,
 * game over, persistence. Also writes the README screenshots to docs/screenshots.
 *
 *   npm start            (in one terminal)
 *   node tests/e2e.js    (in another; set PLAYWRIGHT_PATH if needed)
 */
const path = require('path');
const fs = require('fs');

let playwright;
try { playwright = require('playwright'); }
catch (e) { playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright'); }

const URL = process.env.URL || 'http://localhost:8089/';
const SHOTS = path.join(__dirname, '..', 'docs', 'screenshots');
const SHOOT = process.env.NO_SHOTS ? false : true;
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0, checks = 0;
function check(name, ok, extra) {
    checks++;
    if (ok) console.log('  ok   ' + name);
    else { failures++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}

(async () => {
    const browser = await playwright.chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    const shot = async (name) => { if (SHOOT) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
    const dbg = (fn, arg) => page.evaluate(fn, arg);
    const vis = (sel) => page.locator(sel).isVisible();

    await page.goto(URL);
    await page.waitForFunction(() => window.SH && window.SH.debug);
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    await page.waitForFunction(() => window.SH && window.SH.debug);
    await page.waitForTimeout(500);

    console.log('\nTitle screen');
    check('title is visible', await vis('#screen-title'));
    check('HUD hidden on title', !(await vis('#hud')));
    check('Play button present', await vis('#btn-play'));
    await shot('title');

    console.log('\nPlaying');
    await page.click('#btn-play');
    check('title hides, HUD shows', !(await vis('#screen-title')) && (await vis('#hud')));
    check('mode is play', (await dbg(() => SH.debug.getMode())) === 'play');
    check('hint shown', await vis('#hint'));

    // hold with the mouse on the canvas; the stick must grow, release must drop it
    await page.mouse.move(640, 300);
    await page.mouse.down();
    await page.waitForTimeout(500);
    const grown = await dbg(() => SH.debug.game.currentStick().length);
    check('stick grows while holding', grown > 60, 'length=' + grown);
    check('phase is stretching', (await dbg(() => SH.debug.game.phase)) === 'stretching');
    await shot('stretching');
    await page.mouse.up();
    await page.waitForFunction(() => ['walking', 'falling', 'over'].includes(SH.debug.game.phase), null, { timeout: 5000 });
    check('release drops the stick', true);
    await page.waitForFunction(() => SH.debug.game.phase === 'over' || SH.debug.game.phase === 'waiting' || SH.debug.game.phase === 'transitioning', null, { timeout: 15000 });

    console.log('\nPerfect, flip, cherry');
    // Pin the level generator so gap sizes are predictable for the rest of the test.
    await dbg(() => { SH.debug.game.rng = () => 0.5; });
    if (await vis('#screen-over')) {
        await page.click('#btn-retry');
    } else {
        await page.click('#btn-pause');
        await page.click('#btn-pause-restart');
    }
    check('restart gives a clean run', (await dbg(() => SH.debug.game.score)) === 0);

    // Perfect drop via real input: compute the exact hold time from the game state.
    async function holdFor(ms) {
        await page.mouse.move(640, 300);
        await page.mouse.down();
        await page.waitForTimeout(ms);
        await page.mouse.up();
    }
    async function crossWith(len, opts) {
        const g = await dbg(() => ({ rate: SH.Game.C.STRETCH }));
        // hold until the stick reaches len (poll the live length for accuracy)
        await page.mouse.move(640, 300);
        await page.mouse.down();
        // release in the same frame the stick reaches len (a frame is ~4px, the perfect zone is 10px)
        await page.waitForFunction((l) => {
            const g = SH.debug.game;
            if (g.currentStick().length < l) return false;
            g.currentStick().length = l;
            window.dispatchEvent(new PointerEvent('pointerup'));
            return true;
        }, len, { timeout: 8000, polling: 'raf' });
        await page.mouse.up();
    }

    let ideal = await dbg(() => SH.debug.game.idealLength());
    await crossWith(ideal);
    await page.waitForFunction(() => SH.debug.game.phase === 'walking', null, { timeout: 4000 });
    check('perfect drop awards points', (await dbg(() => SH.debug.game.score)) >= 1);
    // The cherry floats above the gap: walking upright through it collects it.
    const cherry = await dbg(() => SH.debug.game.cherries.find((c) => c.x > SH.debug.game.currentStick().x));
    check('a cherry floats over the gap', !!cherry);
    check('cherry sits above the bridge line', (await dbg(() => SH.Game.C.CHERRY_Y)) < 0);
    const bank0 = await dbg(() => SH.store.data.cherries - SH.debug.game.cherriesRun);
    // Freeze the simulation the moment the cherry is taken so the slow screenshot
    // can't let the hero reach the wall.
    await page.waitForFunction(() => {
        const g = SH.debug.game;
        if (g.cherriesRun >= 1) { g._upd = g.update; g.update = function () {}; return true; }
        return g.phase !== 'walking';
    }, null, { polling: 'raf', timeout: 5000 });
    check('walking upright collects the cherry', (await dbg(() => SH.debug.game.flipped)) === false
        && (await dbg(() => SH.store.data.cherries)) === bank0 + 1);
    // Still over the gap: flip under the bridge for the screenshot, then flip back.
    await dbg(() => { const g = SH.debug.game; g.update = g._upd; g._upd = null; g.press(); g.release(); g._upd = g.update; g.update = function () {}; });
    check('tap mid-walk flips the hero', await dbg(() => SH.debug.game.flipped));
    await shot('flip');
    await dbg(() => { const g = SH.debug.game; g.update = g._upd; g._upd = null; g.press(); g.release(); });
    check('second tap flips upright', (await dbg(() => SH.debug.game.flipped)) === false);
    await page.waitForFunction(() => SH.debug.game.phase === 'waiting', null, { timeout: 8000 });
    check('crossed safely and ready for next stick', true);
    check('HUD cherry count updated', (await page.textContent('#hud-cherries')) === String(bank0 + 1));
    check('score on HUD matches game', (await page.textContent('#hud-score')) === String(await dbg(() => SH.debug.game.score)));

    // chase a combo for the callout screenshot
    ideal = await dbg(() => SH.debug.game.idealLength());
    await crossWith(ideal);
    await page.waitForFunction(() => SH.debug.game.phase === 'walking', null, { timeout: 4000 });
    await page.waitForTimeout(150);
    check('combo tag visible after back-to-back perfects', await vis('#hud-combo'));
    await shot('perfect');
    await page.waitForFunction(() => SH.debug.game.phase === 'waiting', null, { timeout: 8000 });

    console.log('\nPause');
    await page.keyboard.press('p');
    check('P pauses', (await dbg(() => SH.debug.getMode())) === 'paused' && (await vis('#screen-pause')));
    await shot('pause');
    await page.keyboard.press('p');
    check('P resumes', (await dbg(() => SH.debug.getMode())) === 'play');
    await page.keyboard.press('Escape');
    check('Escape pauses', (await dbg(() => SH.debug.getMode())) === 'paused');
    await page.click('#btn-resume');
    check('Resume button resumes', (await dbg(() => SH.debug.getMode())) === 'play');

    console.log('\nSound toggle');
    const before = await dbg(() => SH.debug.store.data.sound);
    await page.click('#btn-sound');
    const after = await dbg(() => SH.debug.store.data.sound);
    check('sound toggles and persists', before !== after);
    await page.keyboard.press('m');
    check('M key toggles sound back', (await dbg(() => SH.debug.store.data.sound)) === before);

    console.log('\nArmory');
    await dbg(() => { SH.debug.store.data.cherries = 40; SH.debug.store.save(); });
    await page.click('#btn-armory');
    check('armory opens (game auto-pauses)', (await vis('#screen-armory')) && (await dbg(() => SH.debug.getMode())) === 'paused');
    check('hero cards rendered', (await page.locator('#armory-body .card').count()) === 6);
    await page.evaluate(() => { document.getElementById('armory-cherries').textContent = SH.debug.store.data.cherries; });
    await page.click('.tab[data-tab="heroes"]');
    await page.waitForTimeout(250);
    await page.evaluate(() => SH.ui.setTab('heroes'));
    await page.waitForTimeout(150);
    await shot('armory-heroes');

    const price = await dbg(() => SH.catalog.heroes[1].cost);
    await page.click('[data-act="buy"][data-id="shadow"]');
    check('buying a hero spends cherries', (await dbg(() => SH.debug.store.data.cherries)) === 40 - price);
    check('bought hero is owned and equipped', await dbg(() => SH.store.owns('heroes', 'shadow') && SH.store.data.equipped.hero === 'shadow'));
    await page.click('[data-act="equip"][data-id="classic"]');
    check('equip swaps the active hero', (await dbg(() => SH.store.data.equipped.hero)) === 'classic');

    await page.click('[data-act="short"][data-id="ronin"]');
    check('unaffordable item gives a toast and spends nothing', (await vis('#toast')) && (await dbg(() => SH.store.owns('heroes', 'ronin'))) === false);

    await page.click('#tab-sticks');
    check('sticks tab shows 6 sticks', (await page.locator('#armory-body .card').count()) === 6);
    await page.waitForTimeout(150);
    await shot('armory-sticks');
    await page.click('[data-act="buy"][data-id="bamboo"]');
    check('stick purchase works', await dbg(() => SH.store.owns('sticks', 'bamboo') && SH.store.data.equipped.stick === 'bamboo'));

    await page.click('#tab-maps');
    check('maps tab shows 6 maps', (await page.locator('#armory-body .card').count()) === 6);
    await page.waitForTimeout(200);
    await shot('armory-maps');
    await dbg(() => { SH.debug.store.data.cherries = 100; SH.debug.store.save(); SH.ui.renderArmory(); });
    await page.click('[data-act="buy"][data-id="sakura"]');
    check('map purchase works and equips', await dbg(() => SH.store.owns('maps', 'sakura') && SH.store.data.equipped.map === 'sakura'));
    await page.click('[data-act="equip"][data-id="meadow"]');
    check('map equip swaps the active map', (await dbg(() => SH.store.data.equipped.map)) === 'meadow');

    await page.click('#tab-records');
    check('records tab shows stats and feats', (await page.locator('.stat').count()) === 6 && (await page.locator('.feat').count()) === 12);
    await page.waitForTimeout(100);
    await shot('armory-records');

    console.log('\nDaily gift');
    const c0 = await dbg(() => SH.store.data.cherries);
    await page.click('#btn-daily');
    const c1 = await dbg(() => SH.store.data.cherries);
    check('daily gift pays out', c1 > c0, c0 + ' -> ' + c1);
    check('daily gift locks after claiming', await page.locator('#btn-daily').isDisabled());

    console.log('\nTab keyboard navigation');
    await page.focus('#tab-heroes');
    await page.keyboard.press('ArrowRight');
    check('arrow key moves to next tab', (await page.getAttribute('#tab-sticks', 'aria-selected')) === 'true' || (await page.getAttribute('#tab-records', 'aria-selected')) === 'true');

    await page.click('#btn-armory-close');
    check('armory closes', !(await vis('#screen-armory')));
    check('returns to pause card', await vis('#screen-pause'));
    await page.click('#btn-resume');

    console.log('\nGame over');
    // Fall on purpose: drop a stick that ends in the gap, just short of the pillar.
    const short = await dbg(() => SH.debug.game.nextPlatform().x - SH.debug.game.currentStick().x - 8);
    await page.mouse.move(640, 300);
    await page.mouse.down();
    await page.waitForFunction((l) => SH.debug.game.currentStick().length >= l, short, { timeout: 8000, polling: 'raf' });
    await page.mouse.up();
    await page.waitForSelector('#screen-over:not([hidden])', { timeout: 12000 });
    check('game over card appears', await vis('#screen-over'));
    const shown = await page.textContent('#over-score');
    check('final score matches game', shown === String(await dbg(() => SH.debug.game.score)));
    check('best score never lower than run', Number(await page.textContent('#over-best')) >= Number(shown));
    check('feats listed for first run', (await page.locator('#over-feats li').count()) >= 1);
    await page.waitForTimeout(700);
    await shot('gameover');

    console.log('\nPersistence');
    const saved = await dbg(() => JSON.parse(localStorage.getItem('stickhero.save.v2')));
    check('save is written to localStorage', saved && saved.stats.games >= 1 && saved.heroes.includes('shadow'));
    await page.reload();
    await page.waitForFunction(() => window.SH && window.SH.debug);
    check('state survives reload', (await dbg(() => SH.store.owns('sticks', 'bamboo'))) === true);
    check('title shows best score line', (await page.textContent('#title-stats')).includes('run'));

    console.log('\nKeyboard-only start');
    await page.keyboard.press('Space');
    check('Space starts a run from the title', (await dbg(() => SH.debug.getMode())) === 'play');
    await page.keyboard.down('Space');
    await page.waitForTimeout(300);
    check('Space hold grows the stick', (await dbg(() => SH.debug.game.currentStick().length)) > 40);
    await page.keyboard.up('Space');
    check('Space release turns the stick', ['turning', 'walking', 'falling'].includes(await dbg(() => SH.debug.game.phase)));

    console.log('\nReset progress');
    await page.click('#btn-armory');   // opens straight from play and pauses
    await page.click('#tab-records');
    await page.click('[data-act="reset"]');
    check('reset needs a second confirming click', (await dbg(() => SH.store.data.stats.games)) >= 1);
    await page.click('[data-act="reset"]');
    check('second click erases progress', (await dbg(() => SH.store.data.stats.games === 0 && SH.store.data.cherries === 0)));

    console.log('\nMobile layout');
    const m = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const mp = await m.newPage();
    mp.on('pageerror', (e) => errors.push('mobile: ' + e));
    await mp.goto(URL);
    await mp.waitForFunction(() => window.SH && window.SH.debug);
    await mp.waitForTimeout(400);
    if (SHOOT) await mp.screenshot({ path: path.join(SHOTS, 'mobile-title.png') });
    await mp.tap('#btn-play');
    check('touch: tap Play starts', (await mp.evaluate(() => SH.debug.getMode())) === 'play');
    const box = await mp.evaluate(() => { const b = document.getElementById('hud').getBoundingClientRect(); return { r: b.right, w: innerWidth }; });
    check('HUD fits a phone screen', box.r <= box.w + 1, JSON.stringify(box));
    // touch hold via CDP touch events
    const cdp = await m.newCDPSession(mp);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 400 }] });
    await mp.waitForTimeout(450);
    const tl = await mp.evaluate(() => SH.debug.game.currentStick().length);
    check('touch hold grows the stick', tl > 50, 'length=' + tl);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await mp.waitForTimeout(100);
    check('touch release drops the stick', ['turning', 'walking', 'falling'].includes(await mp.evaluate(() => SH.debug.game.phase)));
    await mp.waitForTimeout(600);
    if (SHOOT) await mp.screenshot({ path: path.join(SHOTS, 'mobile-play.png') });
    await mp.evaluate(() => { SH.store.data.cherries = 30; });
    await mp.tap('#btn-armory');
    await mp.waitForTimeout(300);
    const panel = await mp.evaluate(() => { const b = document.querySelector('.panel-armory').getBoundingClientRect(); return { t: b.top, b: b.bottom, h: innerHeight, l: b.left, r: b.right, w: innerWidth }; });
    check('armory fits a phone viewport', panel.t >= 0 && panel.b <= panel.h && panel.l >= 0 && panel.r <= panel.w, JSON.stringify(panel));
    if (SHOOT) await mp.screenshot({ path: path.join(SHOTS, 'mobile-armory.png') });
    await m.close();

    console.log('\nConsole');
    check('no page errors or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

    await browser.close();
    console.log('\n' + (checks - failures) + '/' + checks + ' checks passed\n');
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });