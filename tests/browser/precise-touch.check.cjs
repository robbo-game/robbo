const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.resolve('release/robbo/index.html')).href + '#test');
    await page.selectOption('#touch-movement', 'dpad');
    await page.locator('#back-to-game').click();
    const cdp = await context.newCDPSession(page);
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const point = async action => { const b = await page.locator(`[data-action="${action}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }; };
    const load = () => page.evaluate(() => { window.robboTest.load(['sssssssss', 's.......s', 's.......s', 's.......s', 's...R...s', 's.......s', 's.......s', 's.......s', 'sssssssss']); window.robboTest.inventory(9); });
    await load(); const right = await point('right');
    await touch('touchStart', [right]); await page.evaluate(() => window.robboTest.step());
    await page.waitForTimeout(120); await page.evaluate(() => window.robboTest.step());
    assert.deepEqual((await page.evaluate(() => window.robboTest.snapshot())).robot, [5, 4], 'A short press is exactly one step');
    await touch('touchEnd', []); await page.evaluate(() => window.robboTest.step(3));
    assert.deepEqual((await page.evaluate(() => window.robboTest.snapshot())).robot, [5, 4], 'No queued extra steps after release');
    await load(); await touch('touchStart', [right]); await page.evaluate(() => window.robboTest.step());
    await page.waitForTimeout(300); await page.evaluate(() => window.robboTest.step(2));
    assert.deepEqual((await page.evaluate(() => window.robboTest.snapshot())).robot, [7, 4], 'A deliberate hold repeats after the delay');
    await touch('touchCancel', []); await page.evaluate(() => window.robboTest.step(2));
    assert.deepEqual((await page.evaluate(() => window.robboTest.snapshot())).robot, [7, 4]);
    await load(); const fire = await point('fire');
    await touch('touchStart', [fire]); await touch('touchEnd', []); await page.evaluate(() => window.robboTest.step());
    let state = await page.evaluate(() => window.robboTest.snapshot());
    assert.equal(state.ammo, 8); assert.deepEqual(state.robot, [4, 4]);
    assert(state.entities.some(e => e.kind === 'shot' && e.direction === 1), 'One-thumb Fire uses the last facing direction');
    await page.evaluate(() => window.robboTest.step(2)); assert.equal((await page.evaluate(() => window.robboTest.snapshot())).ammo, 8);
    console.log('Precise touch passed: one step per short press, delayed repeat, release/cancel and one-thumb Fire.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
