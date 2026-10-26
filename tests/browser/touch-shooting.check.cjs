const { selectSetting } = require('./settings.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.ROBBO_CHROMIUM, args: ['--no-sandbox'] });
  try {
    for (const side of ['right', 'left']) for (const viewport of [{ width: 390, height: 760 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ viewport, hasTouch: true });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve('release/robbo/index.html')).href + '#test');
      await selectSetting(page, '#touch-fire-side', side); await page.reload();
      assert.equal(await page.locator('#touch-fire-side').inputValue(), side, 'Layout survives reload');
      await selectSetting(page, '#touch-movement', 'dpad');
      const cdp = await context.newCDPSession(page);
      const point = async (action, id) => {
        const box = await page.locator(`[data-action="${action}"]`).boundingBox();
        assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, `${action} fits viewport`);
        return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
      };
      const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
      const step = (count = 1) => page.evaluate(n => window.robboTest.step(n), count);
      const snapshot = () => page.evaluate(() => window.robboTest.snapshot());
      const load = (ammo = 9) => page.evaluate(rounds => {
        window.robboTest.load(['sssssssss', 's.......s', 's.......s', 's.......s', 's...R...s', 's.......s', 's.......s', 's.......s', 'sssssssss']);
        window.robboTest.inventory(rounds);
      }, ammo);
      const fire = await point('fire', 1), aim = await point('aim', 1), up = await point('up', 2);
      assert.equal(fire.x < up.x, side === 'left', 'Fire and movement swap sides');
      for (const [action, direction] of [['right', 0], ['down', 1], ['left', 2], ['up', 3]]) {
        await load(); const target = await point(action, 2);
        await touch('touchStart', [aim]); await touch('touchStart', [aim, target]); await step(5);
        let state = await snapshot();
        assert.equal(state.ammo, 9, `${action}: AIM never consumes ammunition`);
        assert.deepEqual(state.robot, [4, 4], `${action}: AIM never moves`);
        assert.equal(state.entities.find(e => e.kind === 'robot').direction, direction);
        await touch('touchEnd', [aim]); await touch('touchEnd', []);
        await touch('touchStart', [fire]); await step();
        assert((await snapshot()).entities.some(e => e.kind === 'shot' && e.direction === direction), 'Projectile follows the selected aim');
        await step(19);
        state = await snapshot(); assert.equal(state.ammo, 8, 'Long Fire hold uses exactly one round');
        assert.deepEqual(state.robot, [4, 4]);
        await touch('touchEnd', []);
        // A short tap must survive key/pointer release before the simulation tick.
        await touch('touchStart', [fire]); await touch('touchEnd', []); await step();
        assert.equal((await snapshot()).ammo, 7, 'A new quick tap fires exactly once');
      }
      await load(); const right = await point('right', 2);
      await touch('touchStart', [fire]); await step();
      await touch('touchStart', [fire, right]); await step();
      await touch('touchMove', [fire, up]);
      await page.waitForFunction(() => document.querySelector('[data-action="up"]').getAttribute('aria-pressed') === 'true');
      await step(3); let state = await snapshot();
      assert.equal(state.ammo, 8, 'Retargeting held Fire does not spend more rounds');
      assert.equal(state.entities.find(e => e.kind === 'robot').direction, 3);
      assert.deepEqual(state.robot, [4, 4]);
      await touch('touchEnd', [fire]); await page.waitForTimeout(300); await step();
      assert.deepEqual((await snapshot()).robot, [4, 3], 'Releasing Fire resumes held direction movement');
      await touch('touchCancel', []); await step(2);
      assert.deepEqual((await snapshot()).robot, [4, 3]);
      // Rotate with zero ammunition, then cancel both fingers without residual movement.
      await load(0); await touch('touchStart', [aim]); await touch('touchStart', [aim, right]); await step();
      assert.equal((await snapshot()).entities.find(e => e.kind === 'robot').direction, 0);
      await touch('touchCancel', []); await step(3);
      assert.deepEqual((await snapshot()).robot, [4, 4]);
      assert.deepEqual(errors, []); await context.close();
    }
    const context = await browser.newContext(); const page = await context.newPage();
    await page.goto(pathToFileURL(path.resolve('release/robbo/index.html')).href + '#test');
    await page.evaluate(() => {
      window.robboTest.load(['sssssss', 's.....s', 's..R..s', 's.....s', 'sssssss']); window.robboTest.inventory(9);
    });
    await page.locator('#board').focus();
    await page.keyboard.down('Shift'); await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.robboTest.step(3));
    let state = await page.evaluate(() => window.robboTest.snapshot());
    assert.deepEqual(state.robot, [3, 2]); assert.equal(state.ammo, 9);
    assert.equal(state.entities.find(e => e.kind === 'robot').direction, 3);
    await page.keyboard.up('ArrowUp'); await page.keyboard.up('Shift');
    await page.keyboard.down('Control'); await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowUp'); // OS key repeat must not fire again.
    await page.evaluate(() => window.robboTest.step(20));
    state = await page.evaluate(() => window.robboTest.snapshot());
    assert.equal(state.ammo, 8); assert.deepEqual(state.robot, [3, 2]);
    await page.keyboard.up('Control');
    await page.keyboard.down('Control'); await page.keyboard.up('Control');
    await page.evaluate(() => window.robboTest.step());
    state = await page.evaluate(() => window.robboTest.snapshot());
    assert.equal(state.ammo, 7, 'Quick keyboard fire survives movement polling after release');
    assert.deepEqual(state.robot, [3, 2]);
    await page.keyboard.up('ArrowUp'); await context.close();
    console.log('Touch single shots and stationary AIM passed: both layouts/orientations, four directions, long holds, short taps, retargeting, zero ammo and cancellation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
