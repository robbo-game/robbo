const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const side of ['right', 'left']) for (const viewport of [{ width: 390, height: 760 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ viewport, hasTouch: true });
      const page = await context.newPage();
      await page.goto(pathToFileURL(path.resolve('release/robbo/index.html')).href + '#test');
      await page.selectOption('#touch-fire-side', side);
      await page.reload();
      assert.equal(await page.locator('#touch-fire-side').inputValue(), side, 'Layout survives reload');
      await page.locator('#back-to-game').click();
      const cdp = await context.newCDPSession(page);
      const point = async (action, id) => {
        const box = await page.locator(`[data-action="${action}"]`).boundingBox();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
      };
      const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
      const load = () => page.evaluate(() => {
        window.robboTest.load(['sssssssss', 's.......s', 's.......s', 's.......s', 's...R...s', 's.......s', 's.......s', 's.......s', 'sssssssss']);
        window.robboTest.inventory(9);
      });
      const fire = await point('fire', 1);
      const padCentre = await point('up', 2);
      assert.equal(fire.x < padCentre.x, side === 'left', 'Fire and movement swap sides');
      for (const [action, direction] of [['right', 0], ['down', 1], ['left', 2], ['up', 3]]) {
        await load();
        const aim = await point(action, 2);
        await touch('touchStart', [fire]);
        await page.evaluate(() => window.robboTest.step());
        assert.equal((await page.evaluate(() => window.robboTest.snapshot())).ammo, 9, 'Fire alone does not choose a direction');
        await touch('touchStart', [fire, aim]);
        await page.evaluate(() => window.robboTest.step());
        let snapshot = await page.evaluate(() => window.robboTest.snapshot());
        assert.equal(snapshot.ammo, 8, `${action}: one shot`);
        assert.deepEqual(snapshot.robot, [4, 4], `${action}: aiming never moves Robbo`);
        assert(snapshot.entities.some(e => e.kind === 'shot' && e.direction === direction), `${action}: projectile goes in selected direction`);
        await touch('touchEnd', [aim]);
        await page.evaluate(() => window.robboTest.step(2));
        snapshot = await page.evaluate(() => window.robboTest.snapshot());
        assert.equal(snapshot.ammo, 8, 'Lifting the aiming thumb stops shooting');
        assert.deepEqual(snapshot.robot, [4, 4], 'Lifting aim first safely stays in place');
        await touch('touchEnd', []);
      }
      await load();
      const right = await point('right', 2), up = await point('up', 2);
      await touch('touchStart', [fire]); await touch('touchStart', [fire, right]);
      await page.evaluate(() => window.robboTest.step());
      await touch('touchMove', [fire, up]);
      await page.waitForFunction(() => document.querySelector('[data-action="up"]').getAttribute('aria-pressed') === 'true');
      await page.evaluate(() => window.robboTest.step());
      let snapshot = await page.evaluate(() => window.robboTest.snapshot());
      assert.equal(snapshot.ammo, 7, 'Sliding aim fires in the new direction');
      assert(snapshot.entities.some(e => e.kind === 'shot' && e.direction === 3));
      assert.deepEqual(snapshot.robot, [4, 4]);
      await touch('touchEnd', [fire]);
      await page.evaluate(() => window.robboTest.step());
      snapshot = await page.evaluate(() => window.robboTest.snapshot());
      assert.equal(snapshot.ammo, 7, 'Releasing Fire stops ammunition use');
      assert.deepEqual(snapshot.robot, [4, 3], 'Holding aim after releasing Fire resumes movement');
      await touch('touchCancel', []);
      await page.evaluate(() => window.robboTest.step(2));
      assert.deepEqual((await page.evaluate(() => window.robboTest.snapshot())).robot, [4, 3]);
      await context.close();
    }
    console.log('Touch shooting passed in both saved thumb layouts, portrait and landscape: all four projectile directions, stationary aim, slide to retarget, both release orders and cancellation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
