const { selectSetting } = require('./settings.cjs');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
  const server = spawn(process.execPath, ['scripts/dev/serve.cjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); });
    browser = await chromium.launch({ executablePath: process.env.ROBBO_CHROMIUM, args: ['--no-sandbox'] });
    for (const url of ['http://127.0.0.1:8080/', pathToFileURL(path.resolve('release/robbo/index.html')).href]) {
      const page = await browser.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(url + '#test');
      await page.waitForFunction(() => window.robboTest && document.documentElement.dataset.theme);
      await page.evaluate(() => {
        window.robboTest.load(['ssssssssssssssss', 'sR.TMV!........s', "s%'D#~b?&......s", 's=@*^}HX.......s', 'ssssssssssssssss']);
        window.robboTest.inventory(7, 3);
      });
      const before = await page.evaluate(() => window.robboTest.snapshot());
      const images = new Set();
      for (let index = 1; index <= 10; index++) {
        const id = `planet-journey-${index}`;
        await selectSetting(page, '#theme', id);
        await page.waitForFunction(id => document.documentElement.dataset.theme === id, id);
        const rendering = await page.evaluate(() => {
          const board = document.getElementById('board');
          const bounds = board.getBoundingClientRect();
          return { width: board.width, cssWidth: bounds.width, smoothing: board.getContext('2d').imageSmoothingEnabled, css: getComputedStyle(board).imageRendering };
        });
        assert(rendering.width >= Math.round(rendering.cssWidth * 2) - 1, 'Modern artwork must retain a supersampled backing canvas');
        assert.equal(rendering.smoothing, true);
        assert.equal(rendering.css, 'auto');
        assert.equal(await page.locator('.hud .icon canvas').count(), 3, 'Inventory must use the selected artwork');
        // Inspect the compositor's screenshot before any Canvas pixel readback.
        // Readback itself can flush drawing and hide a dropped-layer regression.
        const sample = await page.evaluate(() => {
          const board = document.getElementById('board'), bounds = board.getBoundingClientRect();
          const [columns, rows] = board.dataset.viewport.split(',').map(Number);
          const [cameraX, cameraY] = board.dataset.camera.split(',').map(Number);
          const tile = bounds.width / columns;
          return { x: Math.max(0, (bounds.width - 16 * tile) / 2) + (1.5 - cameraX) * tile,
            y: Math.max(0, (bounds.height - 5 * tile) / 2) + (3.5 - cameraY) * tile, width: bounds.width };
        });
        const screenshot = await page.locator('#board').screenshot();
        const visibleRiver = await page.evaluate(async ({ encoded, sample }) => {
          const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
          const copy = document.createElement('canvas'); copy.width = image.width; copy.height = image.height;
          const painter = copy.getContext('2d'); painter.drawImage(image, 0, 0);
          const scale = image.width / sample.width;
          return [...painter.getImageData(sample.x * scale, sample.y * scale, 1, 1).data];
        }, { encoded: screenshot.toString('base64'), sample });
        assert(visibleRiver[2] > visibleRiver[0] + 20 && visibleRiver[1] > visibleRiver[0] + 20, `${id}: river must be visible in a browser screenshot`);
        const frames = await page.evaluate(() => window.robboTest.artworkFrames());
        const required = [
          [4, 0], [7, 0], [5, 0], [9, 0], [6, 0], [8, 1], [8, 0], [0, 1], [0, 4], [1, 4],
          [0, 0], [1, 0], [0, 6], [1, 6], [9, 3], [9, 4], [8, 2], [9, 2], [6, 2], [7, 2],
          [3, 1], [4, 1], [1, 1], [2, 1], [5, 1], [6, 1], [5, 6], [4, 6],
          [5, 4], [6, 4], [7, 4], [8, 4], [8, 7], [9, 6], [9, 7], [8, 6],
          ...Array.from({ length: 8 }, (_, x) => [x, 5]),
          ...Array.from({ length: 4 }, (_, x) => [x, 3]),
          ...Array.from({ length: 4 }, (_, x) => [x + 1, 2]),
          ...Array.from({ length: 3 }, (_, x) => [x + 2, 4]),
          [10, 3], [10, 4], [10, 5]
        ];
        for (const [x, y] of required) assert(frames.find(frame => frame.x === x && frame.y === y)?.visible > 200, `${id}: missing visible frame ${x},${y}`);
        // Sample the rendered river, not just atlas metadata, to catch missing uploads.
        const river = await page.evaluate(sample => {
          const board = document.getElementById('board'), scale = board.width / sample.width;
          const pixel = board.getContext('2d').getImageData(sample.x * scale, sample.y * scale, 1, 1).data;
          return [...pixel];
        }, sample);
        assert(river[2] > river[0] + 20 && river[1] > river[0] + 20, `${id}: river must remain visibly blue-green`);
        assert.deepEqual(await page.evaluate(() => window.robboTest.snapshot()), before, 'Artwork must preserve game state');
        images.add(await page.evaluate(() => document.getElementById('board').toDataURL()));
      }
      assert.equal(images.size, 10, 'Every planet layout must have distinct artwork');
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'planet-journey-10');
      await selectSetting(page, '#theme', 'java-atlas-v1');
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'java-atlas-v1');
      assert.equal(await page.locator('.hud .icon canvas').count(), 0);
      assert.equal(await page.evaluate(() => document.getElementById('board').getContext('2d').imageSmoothingEnabled), false);
      await selectSetting(page, '#theme', 'planet-journey-3');
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'planet-journey-3');
      await page.waitForTimeout(150);
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'planet-journey-3');
      const beforeFailure = await page.evaluate(() => ({ artwork: window.robboTest.artwork.state(), snapshot: window.robboTest.snapshot() }));
      await page.evaluate(() => {
        window.robboTest.artwork.useControlledLoader();
        window.robboTest.artwork.activate('neon-forge-v1');
      });
      await page.waitForFunction(() => window.robboTest.artwork.pending().includes('neon-forge-v1'));
      await page.evaluate(() => window.robboTest.artwork.reject('neon-forge-v1'));
      await page.waitForFunction(() => !window.robboTest.artwork.pending().length);
      const failed = await page.evaluate(() => ({ artwork: window.robboTest.artwork.state(), snapshot: window.robboTest.snapshot() }));
      const { canvasLabel: failureLabel, ...failedArtwork } = failed.artwork;
      const { canvasLabel: _beforeLabel, ...beforeArtwork } = beforeFailure.artwork;
      assert.deepEqual({ artwork: failedArtwork, snapshot: failed.snapshot }, { artwork: beforeArtwork, snapshot: beforeFailure.snapshot }, 'A failed activation must preserve the atlas, HUD, DOM markers, selector and preference');
      assert.equal(failureLabel, 'Game artwork unavailable', 'A failed activation must announce the unavailable artwork');
      await page.evaluate(() => window.robboTest.artwork.activate('neon-forge-v1'));
      await page.waitForFunction(() => window.robboTest.artwork.pending().includes('neon-forge-v1'));
      await page.evaluate(() => window.robboTest.artwork.resolve('neon-forge-v1'));
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'neon-forge-v1');
      assert.deepEqual(await page.evaluate(() => window.robboTest.snapshot()), beforeFailure.snapshot, 'A successful retry must preserve gameplay');
      const retry = await page.evaluate(() => window.robboTest.artwork.state());
      assert.deepEqual({ active: retry.active, theme: retry.theme, artwork: retry.artwork, selected: retry.selected, stored: retry.stored, hudCanvases: retry.hudCanvases }, {
        active: 'neon-forge-v1', theme: 'neon-forge-v1', artwork: 'modern', selected: 'neon-forge-v1', stored: 'neon-forge-v1', hudCanvases: 3
      }, 'A later retry must commit every theme marker');
      assert.equal(retry.canvasLabel, beforeFailure.artwork.canvasLabel, 'A successful retry must restore the board accessibility label');
      await page.evaluate(() => {
        window.robboTest.artwork.activate('java-atlas-v1');
        window.robboTest.artwork.activate('planet-journey-4');
      });
      await page.waitForFunction(() => window.robboTest.artwork.pending().length === 2);
      await page.evaluate(() => window.robboTest.artwork.resolve('planet-journey-4'));
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'planet-journey-4');
      const newest = await page.evaluate(() => ({ artwork: window.robboTest.artwork.state(), snapshot: window.robboTest.snapshot() }));
      await page.evaluate(() => window.robboTest.artwork.resolve('java-atlas-v1'));
      await page.waitForFunction(() => !window.robboTest.artwork.pending().length);
      await page.waitForTimeout(50);
      assert.deepEqual(await page.evaluate(() => ({ artwork: window.robboTest.artwork.state(), snapshot: window.robboTest.snapshot() })), newest, 'A stale activation must not overwrite the newer atlas, HUD, DOM markers or preference');
      assert.deepEqual(errors, []);
      console.log(`Artwork browser check passed: layouts, failure recovery, stale requests and unchanged game state at ${url}`);
      await page.close();
    }
  } finally { await browser?.close(); server.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
