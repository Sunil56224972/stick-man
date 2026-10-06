/*
 * Multiplayer end to end: two real browser pages talk through the real server.
 *   node tests/multi.js        (needs the server on :8089 and Playwright)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = process.env.URL || 'http://localhost:8089/';
const SHOOT = !!process.env.SHOOT;
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { passed++; console.log('  ok   ' + name); } else { failed++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}
const mode = (p) => p.evaluate(() => SH.debug.getMode());
const until = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 8000 }).then(() => true, () => false);

async function newPlayer(browser, vp, name) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.errors = errors;
    return page;
}

(async () => {
    const browser = await chromium.launch();
    const A = await newPlayer(browser, { width: 900, height: 700 });
    const B = await newPlayer(browser, { width: 390, height: 844 });

    // --- unreachable server shows a friendly message, not a crash
    await A.goto(URL + '?server=127.0.0.1:1');
    await A.waitForFunction(() => window.SH && SH.debug);
    await A.click('#btn-title-multi');
    check('unreachable server: lobby opens with an error and retry', await until(A, () => document.getElementById('mp-status').dataset.state === 'offline' && !document.getElementById('btn-mp-retry').hidden));
    await A.click('#btn-mp-close');
    check('closing returns to the title', (await mode(A)) === 'title');

    // --- host creates a room
    await A.goto(URL);
    await A.waitForFunction(() => window.SH && SH.debug);
    await A.evaluate(() => localStorage.clear());
    await A.reload();
    await A.waitForFunction(() => window.SH && SH.debug);
    await A.click('#btn-title-multi');
    check('connects to the server', await until(A, () => document.getElementById('mp-status').dataset.state === 'online'));
    await A.fill('#mp-name', 'Sunil');
    await A.click('#btn-mp-create');
    check('host lands in a lobby with a 4-letter code', await until(A, () => /^[A-Z0-9]{4}$/.test(document.getElementById('mp-code-show').textContent)));
    const code = await A.textContent('#mp-code-show');
    check('start is locked while alone', await A.evaluate(() => document.getElementById('btn-mp-ready').disabled));
    if (SHOOT) { fs.mkdirSync(OUT, { recursive: true }); await A.screenshot({ path: path.join(OUT, 'multi-lobby-solo.png') }); }

    // --- friend joins through the invite link (phone-sized)
    await B.goto(URL + '?room=' + code.toLowerCase());
    await B.waitForFunction(() => window.SH && SH.debug);
    check('invite link opens the join form with the code filled in', await until(B, () => document.getElementById('mp-code').value.length === 4 && !document.getElementById('screen-mp').hidden));
    await B.fill('#mp-name', 'Mira');
    await B.click('#btn-mp-join');
    check('friend joins the same room', await until(B, () => document.getElementById('mp-code-show').textContent !== '----' && document.querySelectorAll('.mp-player:not(.is-empty)').length === 2));
    check('host sees the friend arrive', await until(A, () => document.querySelectorAll('.mp-player:not(.is-empty)').length === 2));
    check('names render as text', (await A.locator('.mp-player .mp-name').allTextContents()).slice(0, 2).join() === 'Sunil,Mira');

    // --- host picks a map, friend sees it
    await A.click('.mp-map[data-map="frost"]');
    check('map choice reaches the friend', await until(B, () => document.querySelector('.mp-map.is-on').dataset.map === 'frost'));
    check('friend cannot change the map', await B.evaluate(() => document.querySelector('.mp-map[data-map="neon"]').disabled));

    // --- ready, start, countdown, race
    check('host cannot start before friend is ready', await A.evaluate(() => document.getElementById('btn-mp-ready').disabled));
    await B.click('#btn-mp-ready');
    check('start unlocks once the friend is ready', await until(A, () => !document.getElementById('btn-mp-ready').disabled));
    if (SHOOT) await B.screenshot({ path: path.join(OUT, 'multi-lobby-phone.png') });
    await A.click('#btn-mp-ready');
    check('countdown shows on both screens', await until(A, () => !document.getElementById('mp-count').hidden) && await until(B, () => !document.getElementById('mp-count').hidden));
    check('both go to the race', await until(A, () => SH.debug.getMode() === 'play', null, 6000) && await until(B, () => SH.debug.getMode() === 'play', null, 6000));
    const seeds = await Promise.all([A, B].map((p) => p.evaluate(() => JSON.stringify(SH.debug.game.platforms.slice(0, 5)))));
    check('both players race the identical course', seeds[0] === seeds[1]);
    check('race uses the host-chosen map', await B.evaluate(() => SH.debug.multi.mapId()) === 'frost');
    check('pause is disabled in a race', await A.evaluate(() => { window.dispatchEvent(new Event('blur')); return SH.debug.getMode(); }) === 'play');
    check('standings strip shows both players', await A.evaluate(() => document.querySelectorAll('#mp-strip .mp-chip').length) === 2);
    if (SHOOT) { await A.waitForTimeout(500); await A.screenshot({ path: path.join(OUT, 'multi-race.png') }); }

    // Esc opens the leave prompt without stopping the race
    await B.keyboard.press('Escape');
    check('leave prompt opens, sim keeps running', await B.evaluate(() => !document.getElementById('screen-leave').hidden && SH.debug.getMode() === 'play'));
    await B.click('#btn-leave-stay');

    // --- A plays a perfect bridge with the bot; score reaches B
    await A.evaluate(() => {
        const g = SH.debug.game;
        window.__bot = setInterval(() => {
            if (g.phase === 'waiting') g.press();
            if (g.phase === 'stretching' && g.currentStick().length >= g.idealLength()) g.release();
        }, 4);
    });
    // the bot drives the sim through the same events as a human, so the scores flow to the server
    check('live score reaches the other player', await until(B, () => /\d/.test(document.querySelector('#mp-strip .mp-chip b').textContent) && [...document.querySelectorAll('#mp-strip .mp-chip b')].some((b) => +b.textContent >= 2), null, 12000));
    await A.evaluate(() => clearInterval(window.__bot));

    // --- B falls on purpose, A falls too: results
    await B.evaluate(() => { const g = SH.debug.game; g.press(); setTimeout(() => g.release(), 130); });
    check('a fallen player is marked out on the other screen', await until(A, () => document.querySelectorAll('#mp-strip .mp-chip.is-out').length === 1, null, 9000));
    await A.evaluate(() => { const g = SH.debug.game; const t = setInterval(() => { if (g.phase === 'waiting') { g.press(); setTimeout(() => g.release(), 130); } if (g.phase === 'over') clearInterval(t); }, 20); });
    check('results appear for both', await until(A, () => !document.getElementById('screen-mpresult').hidden, null, 10000) && await until(B, () => !document.getElementById('screen-mpresult').hidden, null, 10000));
    const rows = await A.locator('.mpr-row').count();
    check('results list every player', rows === 2);
    check('winner is the higher score', await A.evaluate(() => document.querySelector('.mpr-row.is-win .mpr-name').textContent.includes('Sunil')));
    check('only the winner gets the stamp', await A.evaluate(() => !document.getElementById('mpr-stamp').hidden) && await B.evaluate(() => document.getElementById('mpr-stamp').hidden));
    if (SHOOT) await A.screenshot({ path: path.join(OUT, 'multi-results.png') });

    // --- rematch back to the lobby
    await A.click('#btn-mpr-again');
    check('rematch returns both to the lobby', await until(A, () => !document.getElementById('screen-mp').hidden && !document.getElementById('mp-view-lobby').hidden) && await until(B, () => !document.getElementById('screen-mp').hidden && !document.getElementById('mp-view-lobby').hidden));
    check('solo high score was not touched by races', await A.evaluate(() => SH.debug.store.data.best === 0 && SH.debug.store.data.stats.games === 0));

    // --- friend leaves; host stays and the room shrinks
    await B.click('#btn-mp-close');
    check('leaving shrinks the host lobby', await until(A, () => document.querySelectorAll('.mp-player:not(.is-empty)').length === 1));
    check('name was saved for next time', await A.evaluate(() => SH.debug.store.data.name === 'Sunil'));
    await A.click('#btn-mp-close');
    check('host back at the title', (await mode(A)) === 'title');

    // --- bad code
    await A.click('#btn-title-multi');
    await until(A, () => document.getElementById('mp-status').dataset.state === 'online');
    await A.fill('#mp-code', 'ZZZZ');
    await A.click('#btn-mp-join');
    check('unknown room code gives a clear message', await until(A, () => document.getElementById('mp-status-text').textContent.includes('No room')));
    await A.click('#btn-mp-close');

    const errs = A.errors.concat(B.errors).filter((e) => !/ERR_CONNECTION_REFUSED|WebSocket/.test(e));
    check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));

    await browser.close();
    console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });