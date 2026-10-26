const { selectSetting } = require('./settings.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.ROBBO_CHROMIUM, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 920 }, deviceScaleFactor: 1.25 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve('release/robbo/index.html')).href + '#test');
    await page.waitForFunction(() => !!window.robboTest);
    const rows = Array.from({ length: 31 }, (_, y) => y === 1 ? 'sR.............s' : y % 2 ? 's..............s' : 'ssssssssssssssss');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    for (const theme of ['java-atlas-v1', 'neon-forge-v1', 'planet-journey-4']) {
      await page.evaluate(rows => window.robboTest.load(rows), rows);
      await selectSetting(page, '#theme', theme);
      await page.waitForFunction(id => document.documentElement.dataset.theme === id, theme);
      const timings = await page.evaluate(async () => {
        const frames = [];
        for (let i = 0; i < 30; i++) {
          const start = performance.now(); window.robboTest.step(); frames.push(performance.now() - start);
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
        frames.sort((a, b) => a - b);
        return { median: frames[15], p95: frames[28], max: frames[29] };
      });
      assert(timings.p95 < 100, `${theme}: regular renders must fit the 100ms simulation tick: ${JSON.stringify(timings)}`);
      assert(timings.max < 500, `${theme}: rendering must not cause long input stalls: ${JSON.stringify(timings)}`);
      await page.evaluate(rows => {
        window.robboTest.load(rows, {}, 1, true);
        window.inputLatencies = [];
        let pending;
        window.recordMovement = event => {
          if (event.key.startsWith('Arrow')) pending = { start: event.timeStamp, robot: document.getElementById('board').dataset.robot };
        };
        addEventListener('keydown', window.recordMovement);
        window.movementObserver = new MutationObserver(() => {
          if (pending && document.getElementById('board').dataset.robot !== pending.robot) {
            window.inputLatencies.push(performance.now() - pending.start); pending = undefined;
          }
        });
        window.movementObserver.observe(document.getElementById('board'), { attributes: true, attributeFilter: ['data-robot'] });
      }, rows);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'board');
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
        await page.waitForFunction(count => window.inputLatencies.length === count, i + 1, { timeout: 2000 });
      }
      const input = await page.evaluate(() => {
        removeEventListener('keydown', window.recordMovement); window.movementObserver.disconnect();
        return window.inputLatencies;
      });
      assert(Math.max(...input) < 250, `${theme}: native arrow keys must move Robbo within 250ms: ${JSON.stringify(input)}`);
      console.log(`${theme}, 4x CPU slowdown: render ${JSON.stringify(timings)}, worst native input ${Math.max(...input).toFixed(1)}ms`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
