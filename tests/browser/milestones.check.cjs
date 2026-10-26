const { selectSetting, withSettings } = require('./settings.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.ROBBO_CHROMIUM, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.mediaResults = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        const result = { src: this.src, volume: this.volume, ok: false };
        window.mediaResults.push(result);
        const promise = play.call(this);
        promise.then(() => { result.ok = true; }, error => { result.error = error.name; });
        return promise;
      };
    });
    await page.goto(pathToFileURL(path.resolve('release/robbo/index.html')).href + '?feedback-preview=1#test');
    await page.waitForFunction(() => !!window.robboTest);
    const click = name => page.getByRole('button', { name, exact: true }).click();
    const step = count => page.evaluate(count => window.robboTest.step(count), count);
    const state = () => page.evaluate(() => window.robboTest.snapshot());
    const capture = async name => {
      if (!process.env.ROBBO_CAPTURE_DIR) return;
      fs.mkdirSync(process.env.ROBBO_CAPTURE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.ROBBO_CAPTURE_DIR, name + '.png') });
    };
    await page.locator('#continue').click();
    assert.equal(await page.locator('#board').getAttribute('data-effect'), 'arrival');
    assert.equal(await page.locator('#board').getAttribute('data-tick'), '0');
    await page.waitForFunction(() => document.querySelector('#board').dataset.effect === '');
    for (const theme of ['java-atlas-v1', 'neon-forge-v1', 'planet-journey-6']) {
      await selectSetting(page, '#theme', theme);
      await page.waitForFunction(id => document.documentElement.dataset.theme === id, theme);
      await click('Preview final screw');
      assert.equal((await state()).remaining, 0);
      assert.equal(await page.locator('#board').getAttribute('data-effect'), 'unlock');
      assert.equal(await page.locator('#overlay').isVisible(), false);
      await capture(theme + '-flash');
      await step(3); await capture(theme + '-ready');
      await step(11); assert.equal(await page.locator('#milestone-notice').isVisible(), false);
      await click('Preview take-off');
      assert.equal((await state()).status, 'won');
      const planet = (await state()).planet;
      await step(10); assert.equal((await state()).planet, planet);
      await capture(theme + '-departure');
      await click('Pause');
      const frozen = await page.locator('#board').getAttribute('data-effectTime');
      await step(25); assert.equal((await state()).planet, planet);
      assert.equal(await page.locator('#board').getAttribute('data-effectTime'), frozen);
      await page.locator('#pause').click();
      await step(14); assert.equal((await state()).planet, planet);
      await capture(theme + '-flight-complete');
      await step(6); await capture(theme + '-curtain-closing');
      await step(5); assert.equal((await state()).planet, planet);
      await step(1); assert.equal((await state()).planet, planet + 1);
      assert.equal(await page.locator('#board').getAttribute('data-effect'), 'arrival');
      const initialTick = await page.locator('#board').getAttribute('data-tick');
      const initialRobot = (await state()).robot;
      await page.locator('#board').press('ArrowRight');
      await step(7); await capture(theme + '-curtain-opening');
      assert.equal(await page.locator('#board').getAttribute('data-tick'), initialTick);
      assert.deepEqual((await state()).robot, initialRobot);
      await step(9); assert.equal(await page.locator('#board').getAttribute('data-effect'), '');
      assert.equal(await page.locator('#board').getAttribute('data-tick'), initialTick);
      console.log(`${theme}: unlock, flight, paused clock, one advance and arrival passed`);
    }
    // Reported planet-2 regression: retain its real wall layout and exit position,
    // place Robbo next to the powered exit to inspect the flight without solving the puzzle.
    await page.evaluate(() => {
      window.robboTest.planet(2);
      const { entities } = window.robboTest.snapshot();
      const width = Math.max(...entities.map(e => e.x)) + 1, height = Math.max(...entities.map(e => e.y)) + 1;
      const rows = Array.from({ length: height }, () => Array(width).fill('.'));
      for (const e of entities) if (e.kind === 'wall' || e.kind === 'ship') rows[e.y][e.x] = e.symbol;
      const ship = entities.find(e => e.kind === 'ship');
      const entry = [[ship.x - 1, ship.y, 0], [ship.x, ship.y - 1, 1], [ship.x + 1, ship.y, 2], [ship.x, ship.y + 1, 3]]
        .find(([x, y]) => rows[y]?.[x] === '.');
      if (!entry) throw Error('No accessible exit on planet 2');
      rows[entry[1]][entry[0]] = 'R';
      window.robboTest.load(rows.map(row => row.join('')));
      window.robboTest.command(entry[2]); window.robboTest.step();
    });
    assert.equal((await state()).status, 'won');
    await step(24); await capture('planet-2-flight-clear');
    assert.equal((await state()).planet, 2);
    await step(6); await capture('planet-2-curtain-closing');
    await step(6); assert.equal((await state()).planet, 3);
    await step(7); await capture('planet-3-curtain-opening');
    assert.equal(await page.locator('#board').getAttribute('data-tick'), '0');
    await step(9);
    // Respect reduced motion, mute and volume; retry must cancel all pending flight effects.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await withSettings(page, () => page.locator('#mute').check());
    const mutedBefore = await page.evaluate(() => window.mediaResults.length);
    await click('Preview final screw');
    assert.equal(await page.locator('#milestone-notice').getAttribute('data-reduced'), 'true');
    assert.equal(await page.evaluate(() => window.mediaResults.length), mutedBefore);
    await capture('reduced-motion');
    await click('Preview take-off'); await click('Reset planet'); await step(1);
    assert.equal(await page.locator('#board').getAttribute('data-effect'), 'arrival');
    await withSettings(page, async () => { await page.locator('#mute').uncheck(); await page.locator('#volume').fill('20'); });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await click('Preview final screw');
    await page.waitForFunction(() => window.mediaResults.some(item => item.src.endsWith('/ship-ready.wav') && item.ok && Math.abs(item.volume - 0.2) < 0.001));
    await click('Play animation');
    await page.waitForFunction(() => document.querySelector('#board').dataset.effect === '');
    await click('Preview take-off'); await click('Play animation');
    await page.waitForFunction(() => document.querySelector('#board').dataset.effect === 'arrival', { timeout: 5000 });
    for (const file of ['ship-ready.wav', 'ship-departure.wav', 'planet-arrival.wav']) {
      await page.waitForFunction(file => window.mediaResults.some(item => item.src.endsWith('/' + file) && item.ok), file);
    }
    // Final planet completes once, without inventing planet 57.
    await page.evaluate(() => window.robboTest.planet(56));
    await click('Preview take-off'); await step(36);
    assert.equal((await state()).completed, true); assert.equal((await state()).planet, 56);
    assert.equal(await page.locator('#state-title').textContent(), 'Journey complete!');
    await step(30); assert.equal((await state()).planet, 56);
    assert.deepEqual((await state()).failures, []); assert.deepEqual(errors, []);
    console.log('Native WAV playback, volume, mute, reduced motion, retry cancellation, real-time sequence and final planet passed.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
