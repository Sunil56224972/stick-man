/*
 * Responsive audit: loads every screen at a range of device sizes and checks
 * layout rules that a human would notice (clipping, overlap, tiny tap targets).
 *
 *   node tests/responsive.js            checks only
 *   SHOOT=1 node tests/responsive.js    also writes docs/screenshots/responsive/*.png
 *
 * Needs the server on port 8089 and Playwright (PLAYWRIGHT_PATH if not installed).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const URL = process.env.URL || 'http://localhost:8089/';
const SHOOT = !!process.env.SHOOT;
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'responsive');

const DEVICES = [
    { name: 'iphone-se', w: 320, h: 568, touch: true },
    { name: 'galaxy-s', w: 360, h: 740, touch: true },
    { name: 'iphone-14', w: 390, h: 844, touch: true },
    { name: 'pixel-max', w: 430, h: 932, touch: true },
    { name: 'landscape-se', w: 568, h: 320, touch: true },
    { name: 'landscape-14', w: 844, h: 390, touch: true },
    { name: 'landscape-s', w: 740, h: 360, touch: true },
    { name: 'ipad-portrait', w: 768, h: 1024, touch: true },
    { name: 'ipad-landscape', w: 1024, h: 768, touch: true },
    { name: 'laptop', w: 1366, h: 768, touch: false },
    { name: 'desktop', w: 1920, h: 1080, touch: false },
    { name: 'ultrawide', w: 2560, h: 1080, touch: false }
];

let failed = 0, passed = 0;
function check(name, ok, detail) {
    if (ok) passed++; else { failed++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}

// Every visible element inside root must sit inside the viewport sideways.
function inView(root) {
    const vw = innerWidth, bad = [];
    document.querySelectorAll(root + ' *').forEach((n) => {
        const r = n.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (n.closest('svg') && n.tagName !== 'svg') return;
        if (r.left < -1 || r.right > vw + 1) bad.push((n.id || String(n.className) || n.tagName) + ' x[' + Math.round(r.left) + ',' + Math.round(r.right) + ']');
    });
    return bad;
}
async function run() {
    const browser = await chromium.launch();
    if (SHOOT) fs.mkdirSync(OUT, { recursive: true });

    for (const d of DEVICES) {
        console.log('\n' + d.name + ' ' + d.w + 'x' + d.h);
        const ctx = await browser.newContext({
            viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.touch ? 2 : 1,
            hasTouch: d.touch, isMobile: d.touch
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        const shot = async (n) => { if (SHOOT) await page.screenshot({ path: path.join(OUT, d.name + '-' + n + '.png') }); };

        await page.goto(URL);
        await page.waitForFunction(() => window.SH && window.SH.debug);
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await page.waitForFunction(() => window.SH && window.SH.debug);
        await page.waitForTimeout(400);

        // no page-level scrolling or horizontal overflow, ever
        const noScroll = async (tag) => {
            const o = await page.evaluate(() => ({
                sx: document.documentElement.scrollWidth - innerWidth,
                sy: document.documentElement.scrollHeight - innerHeight
            }));
            check(tag + ': page does not scroll', o.sx <= 1 && o.sy <= 1, JSON.stringify(o));
        };

        // elements of one screen must not spill out of the viewport sideways, and
        // the tappable ones must be big enough for a thumb
        const fits = async (tag, root) => {
            const bad = await page.evaluate(inView, root);
            check(tag + ': nothing clipped sideways', bad.length === 0, bad.slice(0, 4).join('; '));
            const small = await page.evaluate((r) => {
                const out = [];
                document.querySelectorAll(r + ' button').forEach((b) => {
                    const q = b.getBoundingClientRect();
                    if (!q.width || !q.height) return;
                    if (q.height < 34 || q.width < 34) out.push((b.id || b.className) + ' ' + Math.round(q.width) + 'x' + Math.round(q.height));
                });
                return out;
            }, root);
            check(tag + ': tap targets >= 34px', small.length === 0, small.slice(0, 4).join('; '));
        };

        // the card must be fully visible, or scroll inside itself
        const panelFits = async (tag, sel) => {
            const r = await page.evaluate((s) => {
                const p = document.querySelector(s); const q = p.getBoundingClientRect();
                return { t: q.top, b: q.bottom, vh: innerHeight };
            }, sel);
            check(tag + ': panel inside viewport', r.t >= -1 && r.b <= r.vh + 1, JSON.stringify(r));
        };

        // --- title
        await noScroll('title');
        await fits('title', '#screen-title');
        const titleBox = await page.evaluate(() => {
            const kids = [...document.querySelectorAll('#screen-title .title-stack > *')].filter((e) => e.offsetWidth);
            const top = Math.min(...kids.map((k) => k.getBoundingClientRect().top));
            const bot = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
            return { top, bot, vh: innerHeight };
        });
        check('title: stack inside viewport vertically', titleBox.top >= 0 && titleBox.bot <= titleBox.vh, JSON.stringify(titleBox));
        await shot('title');

        // --- play
        await page.click('#btn-play');
        await page.waitForTimeout(250);
        await noScroll('play');
        await fits('play', '#hud');
        const hud = await page.evaluate(() => {
            const ids = ['.hud-group:first-child', '.score-wrap', '.hud-group-right'];
            const rs = ids.map((s) => document.querySelector('#hud ' + s).getBoundingClientRect());
            const over = (a, b) => a.right > b.left + 1 && a.left < b.right - 1 && a.bottom > b.top + 1 && a.top < b.bottom - 1;
            return { l_s: over(rs[0], rs[1]), s_r: over(rs[1], rs[2]), l_r: over(rs[0], rs[2]) };
        });
        check('play: HUD groups do not overlap', !hud.l_s && !hud.s_r && !hud.l_r, JSON.stringify(hud));
        const view = await page.evaluate(() => {
            const g = SH.debug.game, r = SH.debug.renderer.view;
            const first = (g.platforms[1].x - g.offset) * r.s + r.originX;
            const startX = (g.platforms[0].x - g.offset) * r.s + r.originX;
            return { s: r.s, groundY: r.groundY, h: r.h, firstGapStart: first, startX, w: r.w };
        });
        check('play: world scale sane', view.s >= 0.5 && view.s <= 1.6, 'scale ' + view.s.toFixed(2));
        check('play: ground leaves room below and above', view.groundY > view.h * 0.4 && view.groundY < view.h * 0.75, JSON.stringify(view));
        await page.waitForTimeout(150);
        await shot('play');

        // hold with a finger / mouse and release: the stick must grow and drop
        const cx = Math.round(d.w / 2), cy = Math.round(d.h * 0.45);
        if (d.touch) {
            await page.evaluate(() => { window.__t = 1; });
            const cdp = await ctx.newCDPSession(page);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
            await page.waitForTimeout(400);
            const len = await page.evaluate(() => SH.debug.game.currentStick().length);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            check('play: touch grows the stick', len > 40, 'len ' + len);
            await page.waitForFunction(() => SH.debug.game.phase !== 'stretching');
            check('play: touch release drops it', true);
        } else {
            await page.mouse.move(cx, cy); await page.mouse.down(); await page.waitForTimeout(400);
            const len = await page.evaluate(() => SH.debug.game.currentStick().length);
            await page.mouse.up();
            check('play: mouse grows the stick', len > 40, 'len ' + len);
        }
        await page.waitForFunction(() => ['waiting', 'over'].includes(SH.debug.game.phase), null, { timeout: 15000 });

        // --- pause
        if (await page.locator('#screen-over').isVisible()) {
            await page.click('#btn-retry');
        }
        await page.click('#btn-pause');
        await page.waitForTimeout(450);
        await fits('pause', '#screen-pause');
        await panelFits('pause', '#screen-pause .panel');
        await noScroll('pause');
        await shot('pause');
        await page.click('#btn-resume');

        // --- game over
        await page.evaluate(() => {
            const g = SH.debug.game; g.rng = () => 0.5;
            if (g.phase === 'waiting') { g.press(); g.currentStick().length = 20; g.release(); }
        });
        await page.waitForSelector('#screen-over:not([hidden])', { timeout: 15000 });
        await page.waitForTimeout(900);
        await fits('gameover', '#screen-over');
        await panelFits('gameover', '#screen-over .panel');
        await noScroll('gameover');
        await shot('gameover');

        // --- armory, every tab
        await page.click('#btn-over-armory');
        await page.waitForTimeout(450);
        for (const tab of ['heroes', 'sticks', 'maps', 'records']) {
            await page.click('#tab-' + tab);
            await page.waitForTimeout(250);
            await fits('armory/' + tab, '#screen-armory');
            await panelFits('armory/' + tab, '#screen-armory .panel');
            const sc = await page.evaluate(() => {
                const b = document.getElementById('armory-body');
                return { clientH: b.clientHeight, scrollH: b.scrollHeight };
            });
            check('armory/' + tab + ': body has usable height', sc.clientH >= 140, JSON.stringify(sc));
            await shot('armory-' + tab);
        }
        // the body must scroll so the last card is reachable
        const reach = await page.evaluate(() => {
            const b = document.getElementById('armory-body');
            b.scrollTop = b.scrollHeight;
            const last = b.lastElementChild.getBoundingClientRect(), box = b.getBoundingClientRect();
            return { lastBottom: last.bottom, boxBottom: box.bottom };
        });
        check('armory: last row reachable by scrolling', reach.lastBottom <= reach.boxBottom + 2, JSON.stringify(reach));
        await page.click('#btn-armory-close');
        await page.click('#btn-over-home');

        // --- multiplayer: a friend joins from a second context so every screen is the real thing
        await page.waitForTimeout(300);
        await page.click('#btn-title-multi');
        await page.waitForFunction(() => document.getElementById('mp-status').dataset.state === 'online');
        await page.waitForTimeout(400);
        await fits('mp-join', '#screen-mp');
        await panelFits('mp-join', '#screen-mp .panel');
        await noScroll('mp-join');
        await shot('mp-join');
        await page.fill('#mp-name', 'Sunil');
        await page.click('#btn-mp-create');
        await page.waitForFunction(() => !document.getElementById('mp-view-lobby').hidden);
        const code = await page.textContent('#mp-code-show');
        const fctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, hasTouch: d.touch, isMobile: d.touch });
        const friend = await fctx.newPage();
        await friend.goto(URL + '?room=' + code);
        await friend.waitForFunction(() => window.SH && SH.debug);
        await friend.fill('#mp-name', 'Mira');
        await friend.click('#btn-mp-join');
        await page.waitForFunction(() => document.querySelectorAll('.mp-player:not(.is-empty)').length === 2);
        await friend.waitForFunction(() => !document.getElementById('mp-view-lobby').hidden);
        await page.waitForTimeout(400);
        await fits('mp-lobby', '#screen-mp');
        await panelFits('mp-lobby', '#screen-mp .panel');
        await noScroll('mp-lobby');
        await shot('mp-lobby');
        const body = await page.evaluate(() => { const b = document.querySelector('.mp-body'); return { clientH: b.clientHeight }; });
        check('mp-lobby: body has usable height', body.clientH >= 120, JSON.stringify(body));
        const reachMp = await page.evaluate(() => {
            const b = document.querySelector('.mp-body'); b.scrollTop = b.scrollHeight;
            const last = document.getElementById('mp-maps').getBoundingClientRect(), box = b.getBoundingClientRect();
            return { lastBottom: last.bottom, boxBottom: box.bottom };
        });
        check('mp-lobby: map picker reachable by scrolling', reachMp.lastBottom <= reachMp.boxBottom + 2, JSON.stringify(reachMp));
        await friend.click('#btn-mp-ready');
        await page.waitForFunction(() => !document.getElementById('btn-mp-ready').disabled);
        await page.click('#btn-mp-ready');
        await page.waitForSelector('#mp-count:not([hidden])', { timeout: 4000 });
        await page.waitForTimeout(350);
        await fits('mp-countdown', '#mp-count');
        await shot('mp-countdown');
        await page.waitForFunction(() => SH.debug.getMode() === 'play', null, { timeout: 6000 });
        await page.waitForTimeout(300);
        await noScroll('mp-race');
        await fits('mp-race', '#mp-strip');
        const strip = await page.evaluate(() => {
            const s = document.getElementById('mp-strip').getBoundingClientRect();
            const sc = document.querySelector('#hud .score-wrap').getBoundingClientRect();
            const rs = [...document.querySelectorAll('#hud .hud-group')].map((g) => g.getBoundingClientRect());
            const hit = (a, b) => a.right > b.left + 1 && a.left < b.right - 1 && a.bottom > b.top + 1 && a.top < b.bottom - 1;
            return { s: hit(s, sc), g: rs.some((r) => hit(s, r)), vh: innerHeight, bottom: s.bottom };
        });
        check('mp-race: standings clear of score and buttons', !strip.s && !strip.g, JSON.stringify(strip));
        await shot('mp-race');
        const leaveBtn = await page.evaluate(() => { const b = document.getElementById('btn-leave'); const r = b.getBoundingClientRect(); return { vis: !b.hidden, w: r.width, h: r.height, pause: document.getElementById('btn-pause').hidden }; });
        check('mp-race: Leave replaces Pause and Armory', leaveBtn.vis && leaveBtn.pause && leaveBtn.w >= 34 && leaveBtn.h >= 34, JSON.stringify(leaveBtn));
        await page.click('#btn-leave');
        await page.waitForTimeout(400);
        await fits('mp-leave', '#screen-leave');
        await panelFits('mp-leave', '#screen-leave .panel');
        await shot('mp-leave');
        await page.click('#btn-leave-stay');
        await page.evaluate(() => { const g = SH.debug.game; g.press(); setTimeout(() => g.release(), 120); });
        await friend.evaluate(() => { const g = SH.debug.game; g.press(); setTimeout(() => g.release(), 120); });
        await page.waitForSelector('#screen-mpresult:not([hidden])', { timeout: 12000 });
        await page.waitForTimeout(700);
        await fits('mp-results', '#screen-mpresult');
        await panelFits('mp-results', '#screen-mpresult .panel');
        await noScroll('mp-results');
        await shot('mp-results');
        await page.click('#btn-mpr-leave');
        await fctx.close();
        check('mp: back at the title', await page.evaluate(() => SH.debug.getMode()) === 'title');

        check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
        await ctx.close();
    }

    await browser.close();
    console.log('\n' + passed + '/' + (passed + failed) + ' responsive checks passed');
    process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });