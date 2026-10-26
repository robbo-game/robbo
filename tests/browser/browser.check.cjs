const { withSettings } = require('./settings.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve('release/robbo');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const resource = fileURLToPath(new URL(reference, pathToFileURL(path.join(root, 'index.html'))));
    assert(resource.startsWith(root + path.sep), `Resource escapes release: ${reference}`);
    assert(fs.existsSync(resource), `Missing release resource: ${reference}`);
  }
  for (const file of ['legacy-icons32.png', 'numbers.png', ...['walk_01', 'shoot_default', 'gun_default', 'ammo_02', 'screw2', 'key2', 'door_02', 'box', 'bomb', 'kill', 'teleport', 'end_default', 'capsule', 'magnet'].map(name => `sounds/${name}.ogg`), 'sounds/found/bird_01.ogg', 'sounds/found/ripping_head_of.ogg']) assert(fs.existsSync(path.join(root, file)), `Missing asset: ${file}`);
  const server = spawn(process.execPath, ['scripts/dev/serve.cjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve); server.once('error', reject);
      server.once('exit', () => reject(Error('Server exited before startup')));
    });
    browser = await chromium.launch({ executablePath: process.env.ROBBO_CHROMIUM, args: ['--no-sandbox'] });
    for (const base of [`http://127.0.0.1:${process.env.ROBBO_TEST_PORT || 8080}`, pathToFileURL(path.join(root, 'index.html')).href]) {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      // Observe native playback; do not stub its success or the autoplay policy.
      await page.addInitScript(() => {
        window.audioCalls = [];
        const original = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () { window.audioCalls.push(this.src); return original.call(this); };
      });
      await page.goto(base);
      await page.waitForFunction(() => document.getElementById('board').dataset.tick !== undefined);
      assert.equal(await page.locator('#object-help details').count(), 6);
      await page.locator('[data-page-link="objects"]').first().click();
      const helpSummary = page.locator('#object-help summary').first();
      await helpSummary.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#object-help details').first().getAttribute('open'), '');
      assert.match(await page.locator('#object-help').textContent(), /survive explosions/);
      await page.locator('.subpage[data-page="objects"] [data-page-link="game"]').click();
      assert.match(await page.locator('#board').getAttribute('aria-label'), /arrow keys/);

      await page.locator('#continue').click();
      await page.waitForFunction(() => document.getElementById('board').dataset.effect !== 'arrival');
      assert.equal(await page.evaluate(() => 'robboTest' in window), false, 'Test harness must be absent in normal play');
      assert.equal(await page.locator('#remaining').getAttribute('data-value'), '9');
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => document.getElementById('board').dataset.robot === '1,2');
      await page.locator('#pause').click();
      const tick = await page.locator('#board').getAttribute('data-tick');
      await page.keyboard.press('ArrowDown'); await page.waitForTimeout(200);
      assert.equal(await page.locator('#board').getAttribute('data-tick'), tick);
      await page.locator('#continue').click();
      await page.locator('#restart').click();
      assert.equal(await page.locator('#ammo').getAttribute('data-value'), '0');
      await page.goto('about:blank');
      await page.goto(base + '#test');
      await page.waitForFunction(() => !!window.robboTest);
      await page.locator('#continue').click();
      const load = async (rows, options = {}) => page.evaluate(([r, o]) => window.robboTest.load(r, o), [rows, options]);
      const command = async (d, fire = false, ticks = 1) => page.evaluate(([direction, firing, count]) => { window.robboTest.command(direction, firing); window.robboTest.step(count); window.robboTest.assert(); }, [d, fire, ticks]);
      const state = () => page.evaluate(() => window.robboTest.snapshot());
      const capture = async name => {
        if (!process.env.ROBBO_CAPTURE_DIR || !base.startsWith('http')) return;
        fs.mkdirSync(process.env.ROBBO_CAPTURE_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.ROBBO_CAPTURE_DIR, name + '.png'), fullPage: true });
      };
      // Counter width is a display contract, independent of Java pickup saturation.
      await load(['R' + 'T'.repeat(123)]);
      assert.equal(await page.locator('#remaining').getAttribute('aria-label'), '123');
      assert.equal(await page.locator('#remaining .digit').count(), 3);
      await page.evaluate(() => window.robboTest.inventory(123, 456));
      for (const [id, expected] of [['ammo', '123'], ['keys', '456']]) {
        assert.equal(await page.locator('#' + id).getAttribute('data-value'), expected);
        assert.equal(await page.locator('#' + id).getAttribute('aria-label'), expected);
        assert.deepEqual(await page.locator('#' + id + ' .digit').evaluateAll(nodes => nodes.map(node => node.style.getPropertyValue('--digit'))), [...expected]);
      }
      await load(['ssssssss', "sR'T%D!s", 'ssssssss']);
      await page.keyboard.press('ArrowRight'); await page.evaluate(() => window.robboTest.step());
      assert.equal((await state()).ammo, 9); assert.equal(await page.locator('#ammo').getAttribute('data-value'), '9');
      await page.keyboard.press('Control+ArrowLeft'); await page.evaluate(() => window.robboTest.step());
      assert.equal((await state()).ammo, 8);
      for (let i = 0; i < 5; i++) await command(0);
      assert.equal((await state()).status, 'won');
      await page.evaluate(() => window.robboTest.step(36)); assert.equal((await state()).planet, 2);
      await load(['ssssssss', 's.Rb...s', 's......s', 'ssssssss']);
      await page.evaluate(() => window.robboTest.inventory(2));
      await command(0, true); const firstFrame = await page.locator('#board').screenshot();
      await page.evaluate(() => window.robboTest.step());
      assert((await state()).entities.some(e => e.kind === 'blast'), 'Detonation must create a visible blast entity');
      await capture('explosion');
      await page.evaluate(() => window.robboTest.step()); const secondFrame = await page.locator('#board').screenshot();
      assert.notDeepEqual(firstFrame, secondFrame, 'Canvas must show different explosion phases');
      await page.evaluate(() => window.robboTest.step(10));
      assert.equal((await state()).status, 'dead'); assert.equal(await page.locator('#state-title').textContent(), 'Robbo lost');
      await capture('death');
      await page.evaluate(() => window.robboTest.step(12)); assert.equal((await state()).status, 'playing');
      await load(['ssssssssss', 'sR&...&..s', 's........s', 'ssssssssss'], { '2,1': [1, 0], '6,1': [1, 1] });
      await command(0); assert.deepEqual((await state()).robot, [7, 1]);
      await page.evaluate(() => window.robboTest.step(4)); await command(2);
      assert.deepEqual((await state()).robot, [1, 1]);
      const tall = Array.from({ length: 31 }, () => 's..............s');
      tall[0] = tall[30] = 'ssssssssssssssss'; tall[2] = 'sR&............s'; tall[29] = 's.&............s';
      await load(tall, { '2,2': [1, 0], '2,29': [1, 1] }); await command(0);
      assert.deepEqual((await state()).robot, [3, 29]);
      const arrival = await page.locator('#board').evaluate(board => ({ camera: board.dataset.camera.split(',').map(Number), viewport: board.dataset.viewport.split(',').map(Number) }));
      assert(29 >= arrival.camera[1] && 30 <= arrival.camera[1] + arrival.viewport[1], 'Far teleport arrival must be fully visible immediately');
      await capture('teleport');
      await load(['ssssssss', 'sRTT!..s', 'ssssssss']); await command(0); await command(0);
      await load(['ssssssss', 'sR#....s', 's......s', 'ssssssss']); await command(0);
      await load(['ssssssss', 'sR.....s', 's.}....s', 'ssssssss'], { '2,2': [0, 0, 0, 0, 0, 0] }); await page.evaluate(() => window.robboTest.step(6));
      await load(['ssssssss', 'sM...R.s', 'ssssssss'], { '1,1': [0] }); await page.evaluate(() => window.robboTest.step());
      const beforeMute = await page.evaluate(() => window.audioCalls.length);
      await withSettings(page, async () => { await page.locator('#mute').check(); await page.locator('#enable-sound').click(); });
      assert.equal(await page.evaluate(() => window.audioCalls.length), beforeMute, 'Mute must prevent new playback');
      await withSettings(page, async () => { await page.locator('#mute').uncheck(); await page.locator('#enable-sound').click(); });
      await page.waitForTimeout(200);
      const calls = await page.evaluate(() => window.audioCalls);
      for (const fragment of ['ammo_02', 'shoot_default', 'screw2', 'key2', 'door_02', 'ship-departure', 'bomb', 'kill', 'teleport', 'planet-arrival', 'box', 'gun_default', 'magnet', 'walk_01']) assert(calls.some(url => url.includes(fragment)), `Missing native audio playback: ${fragment}`);
      assert(calls.some(url => url.endsWith('/ship-ready.wav')), 'Missing distinct exit-open playback');
      assert.deepEqual((await state()).failures, [], 'Native audio playback must succeed after activation');
      assert.deepEqual(errors, [], 'Browser errors during gameplay');
      if (process.env.ROBBO_CAPTURE_DIR) {
        fs.mkdirSync(process.env.ROBBO_CAPTURE_DIR, { recursive: true });
        await page.evaluate(() => window.robboTest.planet(6));
        await page.screenshot({ path: path.join(process.env.ROBBO_CAPTURE_DIR, base.startsWith('http') ? 'campaign-http.png' : 'campaign-file.png'), fullPage: true });
      }
      console.log(`Browser smoke passed: native input/audio, inventory, pause/retry, explosion/death, teleport and planet advancement at ${base}`);
      await page.close();
    }
  } finally { if (browser) await browser.close(); server.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
