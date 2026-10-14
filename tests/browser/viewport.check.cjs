const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, firefox } = require('playwright');

async function main() {
  const engine = process.env.ROBBO_BROWSER === 'firefox' ? firefox : chromium;
  const browser = await engine.launch({ executablePath: engine === chromium ? process.env.ROBBO_CHROMIUM : undefined, args: engine === chromium ? ['--no-sandbox'] : [] });
  try {
    for (const touch of [false, true]) for (const theme of ['java-atlas-v1', 'planet-journey-4']) {
      const context = await browser.newContext({ viewport: { width: 800, height: 600 }, hasTouch: touch, deviceScaleFactor: 3 });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve('release/robbo/index.html')).href + '#test');
      await page.waitForFunction(() => !!window.robboTest);
      await page.evaluate(() => window.robboTest.load(Array.from({ length: 80 }, (_, y) => '.'.repeat(79) + (y === 79 ? 'R' : '.'))));
      await page.selectOption('#theme', theme);
      await page.waitForFunction(id => document.documentElement.dataset.theme === id, theme);
      await page.evaluate(() => {
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        window.drawnBoardSprites = [];
        CanvasRenderingContext2D.prototype.drawImage = function (...args) {
          if (this.canvas.id === 'board' && args.length === 9) {
            window.drawnBoardSprites.push([args[7], args[8]]);
          }
          return draw.apply(this, args);
        };
      });
      async function assertObjectSize() {
        const sizes = await page.evaluate(() => {
          window.drawnBoardSprites = [];
          window.robboTest.inventory(0);
          const board = document.getElementById('board'), bounds = board.getBoundingClientRect();
          const [columns, rows] = board.dataset.viewport.split(',').map(Number);
          return { tiles: [bounds.width / columns, bounds.height / rows], sprites: window.drawnBoardSprites };
        });
        assert.deepEqual(sizes.tiles, [32, 32], 'Window size and fullscreen must not scale tiles');
        assert(sizes.sprites.length > 0, 'Measure actual board sprite draw calls');
        for (const size of sizes.sprites) assert.deepEqual(size, [32, 32], 'Rendered objects stay at 32 CSS pixels');
      }
      const snapshot = await page.evaluate(() => window.robboTest.snapshot());
      for (const [width, height] of [[320, 640], [412, 915], [915, 412], [1440, 900], [1920, 1080], [800, 600]]) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(expected => Math.abs(document.getElementById('play-area').getBoundingClientRect().height - expected) < 1, height);
        await page.waitForFunction(() => {
          const board = document.getElementById('board'), bounds = board.getBoundingClientRect();
          return Math.abs(board.width - Math.round(bounds.width * 2)) <= 1 && Math.abs(board.height - Math.round(bounds.height * 2)) <= 1;
        });
        const view = await page.evaluate(() => {
          const board = document.getElementById('board'), bounds = board.getBoundingClientRect();
          const play = document.getElementById('play-area').getBoundingClientRect();
          return { width: bounds.width, height: bounds.height, bottom: bounds.bottom, playBottom: play.bottom, overflow: document.documentElement.scrollWidth > innerWidth, camera: board.dataset.camera.split(',').map(Number), tiles: board.dataset.viewport.split(',').map(Number) };
        });
        await assertObjectSize();
        for (const icon of await page.locator('.hud .icon').all()) assert(await icon.isVisible(), 'Inventory pictograms stay visible on every screen size');
        assert.equal(view.overflow, false, `${width}x${height}: no horizontal page overflow`);
        assert.equal(view.width, touch && width > height && height <= 600 ? width - 292 : width, 'Board uses available space between thumb controls');
        assert(view.height > height / 2, 'Most of the screen must be available for the board');
        assert(view.bottom <= view.playBottom, 'HUD and controls fit in the first screen');
        assert(Math.abs(view.width / view.tiles[0] - view.height / view.tiles[1]) < 0.01, 'Tiles must remain square');
        for (const axis of [0, 1]) assert(79 >= view.camera[axis] && 80 <= view.camera[axis] + view.tiles[axis], 'Robot remains fully visible after resize');
        assert.deepEqual(await page.evaluate(() => window.robboTest.snapshot()), snapshot, 'Resizing must not alter the game or advance its clock');
        if (touch) {
          const reset = await page.locator('#restart').boundingBox();
          assert(reset && reset.width >= 48 && reset.height >= 48 && reset.y >= 0 && reset.y + reset.height <= height, 'Planet reset stays reachable in the top toolbar');
          for (const box of await page.locator('.touch-controls button').evaluateAll(buttons => buttons.map(button => { const b = button.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, bottom: b.bottom }; }))) {
            assert(box.width >= 48 && box.height >= 48, 'Touch targets must be at least 48 CSS pixels');
            assert(box.x >= 0 && box.y >= 0 && box.bottom <= height, 'Touch controls must remain on screen');
          }
        }
      }
      // ResizeObserver must respond to container changes even without a window resize.
      await page.locator('.viewport').evaluate(node => { node.style.flex = 'none'; node.style.height = '240px'; });
      await page.waitForFunction(() => document.getElementById('board').height === 480);
      await page.locator('.viewport').evaluate(node => { node.style.flex = ''; node.style.height = ''; });
      await page.setViewportSize({ width: 915, height: 412 });
      await page.evaluate(() => window.robboTest.load(Array.from({ length: 31 }, (_, y) => (y === 1 ? '.R' : '..') + '.'.repeat(14))));
      await page.waitForFunction(expected => Number(document.getElementById('board').dataset.viewport.split(',')[0]) === expected / 32, touch ? 623 : 915);
      for (const [width, height] of [[320, 640], [915, 412], [1920, 1080]]) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(width => document.getElementById('board').width === width * 2, touch && width > height && height <= 600 ? width - 292 : width);
        await assertObjectSize();
        assert.deepEqual(await page.evaluate(() => window.robboTest.snapshot().robot), [1, 1], 'A narrow planet keeps its world coordinates');
      }
      await page.setViewportSize({ width: 915, height: 412 });
      // Headless fullscreen retains the OS display size; test container expansion as well.
      if (engine === chromium) {
        await page.addStyleTag({ content: 'html:not(:fullscreen) #play-area { width: 600px; }' });
        await page.waitForFunction(expected => document.getElementById('board').width === expected, touch ? 616 : 1200);
        await page.locator('#fullscreen').click();
        await page.waitForFunction(() => !!document.fullscreenElement);
        await page.waitForFunction(expected => document.getElementById('board').width > expected, touch ? 616 : 1200);
        await assertObjectSize();
        await page.locator('#fullscreen').click();
        await page.waitForFunction(() => !document.fullscreenElement);
        await page.waitForFunction(expected => document.getElementById('board').width === expected, touch ? 616 : 1200);
        await assertObjectSize();
      }
      await page.locator('#settings').click();
      await page.locator('#back-to-game').click();
      assert.equal(await page.evaluate(() => scrollY), 0);
      // Feature detection must leave normal play available when fullscreen is absent.
      await page.evaluate(() => { document.documentElement.requestFullscreen = undefined; });
      await page.locator('#fullscreen').click();
      assert.match(await page.locator('#display-status').textContent(), /unavailable/);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('Responsive viewport passed: portrait, landscape, desktop, DPR, container resize, fullscreen, touch targets and unchanged simulation.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
