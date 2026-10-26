const { selectSetting } = require('./settings.cjs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const side of ['left', 'right']) for (const viewport of [{ width: 390, height: 760 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ viewport, hasTouch: true });
      const page = await context.newPage();
      await page.goto(pathToFileURL(path.resolve('release/robbo/index.html')).href + '#test');
      assert.equal(await page.locator('#touch-movement').inputValue(), 'dpad');
      await selectSetting(page, '#touch-movement', 'gestures');
      await selectSetting(page, '#touch-fire-side', side);
      const cdp = await context.newCDPSession(page);
      const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
      const b = await page.locator('.touch-gesture').boundingBox(); const anchor = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 };
      const f = await page.locator('[data-action="fire"]').boundingBox(); const fire = { x: f.x + f.width / 2, y: f.y + f.height / 2, id: 1 };
      assert.equal(fire.x < anchor.x, side === 'left');
      const load = () => page.evaluate(() => { window.robboTest.load(['sssssssss', 's.......s', 's.......s', 's.......s', 's...R...s', 's.......s', 's.......s', 's.......s', 'sssssssss']); window.robboTest.inventory(9); });
      for (const [name, dx, dy] of [['right', 1, 0], ['down', 0, 1], ['left', -1, 0], ['up', 0, -1]]) {
        await load(); await touch('touchStart', [anchor]);
        await touch('touchMove', [{ ...anchor, x: anchor.x + dx * 20, y: anchor.y + dy * 20 }]);
        await page.waitForFunction(name => document.querySelector('.touch-gesture').dataset.direction === name, name);
        await page.evaluate(() => window.robboTest.step());
        await page.waitForTimeout(300); await page.evaluate(() => window.robboTest.step(2));
        assert.deepEqual((await page.evaluate(() => window.robboTest.snapshot())).robot, [4 + dx, 4 + dy], 'A short swipe remains one step even if held');
        await touch('touchMove', [{ ...anchor, x: anchor.x + dx * 60, y: anchor.y + dy * 60 }]);
        await page.waitForFunction(() => document.querySelector('.touch-gesture').dataset.continuous === 'true');
        await page.evaluate(() => window.robboTest.step(2));
        assert.deepEqual((await page.evaluate(() => window.robboTest.snapshot())).robot, [4 + dx * 3, 4 + dy * 3], 'A long held swipe repeats cardinal movement');
        await touch('touchEnd', []); await page.evaluate(() => window.robboTest.step(2));
        assert.deepEqual((await page.evaluate(() => window.robboTest.snapshot())).robot, [4 + dx * 3, 4 + dy * 3], 'Lifting stops without queued movement');
      }
      await load(); await touch('touchStart', [fire]); await page.evaluate(() => window.robboTest.step());
      assert.equal((await page.evaluate(() => window.robboTest.snapshot())).ammo, 8);
      await touch('touchStart', [fire, anchor]);
      const left = { ...anchor, x: anchor.x - 20 };
      await touch('touchMove', [fire, left]);
      await page.waitForFunction(() => document.querySelector('.touch-gesture').dataset.direction === 'left');
      await page.evaluate(() => window.robboTest.step());
      let state = await page.evaluate(() => window.robboTest.snapshot());
      assert.equal(state.ammo, 8); assert.deepEqual(state.robot, [4, 4]);
      assert.equal(state.entities.find(e => e.kind === 'robot').direction, 2, 'A held Fire retargets without another shot');
      const up = { ...anchor, y: anchor.y - 60 };
      await touch('touchMove', [fire, up]);
      await page.waitForFunction(() => document.querySelector('.touch-gesture').dataset.direction === 'up');
      await page.evaluate(() => window.robboTest.step());
      state = await page.evaluate(() => window.robboTest.snapshot()); assert.equal(state.ammo, 8); assert.deepEqual(state.robot, [4, 4]);
      assert.equal(state.entities.find(e => e.kind === 'robot').direction, 3);
      await touch('touchEnd', [fire]); await page.evaluate(() => window.robboTest.step());
      state = await page.evaluate(() => window.robboTest.snapshot()); assert.deepEqual(state.robot, [4, 3]); assert.equal(state.ammo, 8);
      await touch('touchCancel', []); await page.evaluate(() => window.robboTest.step(2));
      assert.deepEqual((await page.evaluate(() => window.robboTest.snapshot())).robot, [4, 3]);
      const beforeSwitch = await page.evaluate(() => window.robboTest.snapshot());
      await selectSetting(page, '#touch-movement', 'dpad');
      assert.deepEqual(await page.evaluate(() => window.robboTest.snapshot()), beforeSwitch, 'Switching controls preserves the current attempt');
      await selectSetting(page, '#touch-movement', 'gestures'); await page.reload();
      assert.equal(await page.locator('#touch-movement').inputValue(), 'gestures', 'Gesture choice survives reload');
      await selectSetting(page, '#touch-movement', 'dpad'); await page.reload();
      assert.equal(await page.locator('#touch-movement').inputValue(), 'dpad', 'Fallback choice survives reload');
      await context.close();
    }
    console.log('Gesture touch passed: short/held swipes in four directions, no queued steps, one-thumb Fire, two-thumb aim, cancellation, both sides/orientations and saved fallback.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
