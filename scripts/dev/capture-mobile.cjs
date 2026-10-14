const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  fs.mkdirSync('artifacts', { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 760 }, hasTouch: true, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(path.resolve('release/robbo/index.html')).href + '#test');
    await page.waitForFunction(() => window.robboTest);
    await page.locator('#continue').click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: 'artifacts/mobile-portrait.png' });
    await page.locator('.touch-controls').screenshot({ path: 'artifacts/mobile-controls-detail.png' });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'artifacts/mobile-landscape.png' });
    await page.selectOption('#touch-fire-side', 'left');
    await page.locator('#back-to-game').click();
    await page.screenshot({ path: 'artifacts/mobile-landscape-left-fire.png' });
    await page.setViewportSize({ width: 390, height: 760 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'artifacts/mobile-portrait-left-fire.png' });
    await page.selectOption('#touch-fire-side', 'right');
    await page.locator('#back-to-game').click();
    await page.setViewportSize({ width: 390, height: 760 });
    await page.evaluate(() => { window.robboTest.planet(1); window.robboTest.inventory(9); });
    await page.waitForTimeout(200);
    const cdp = await page.context().newCDPSession(page);
    const point = async (action, id) => {
      const b = await page.locator(`[data-action="${action}"]`).boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, id };
    };
    const fire = await point('fire', 1), right = await point('right', 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [fire] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [fire, right] });
    await page.evaluate(() => {
      window.robboTest.step();
      // Explanatory overlays belong only to this review screenshot.
      const note = document.createElement('div');
      note.textContent = 'STRZAŁ W PRAWO\n1  Prawy kciuk: trzymaj FIRE\n2  Lewy kciuk: dotknij →\nRobbo strzela, stojąc w miejscu.\nAby stanąć: najpierw puść kierunek.';
      note.style.cssText = 'position:absolute;bottom:16px;left:12px;right:12px;padding:16px;background:#101a12f5;border:1px solid #caff45;border-radius:12px;white-space:pre-line;font:14px/1.8 system-ui;color:#f4ffdf;z-index:3;pointer-events:none';
      document.querySelector('.viewport').append(note);
      for (const [action, number] of [['fire', '1'], ['right', '2']]) {
        const b = document.querySelector(`[data-action="${action}"]`).getBoundingClientRect();
        const mark = document.createElement('div'); mark.textContent = number;
        mark.style.cssText = `position:fixed;left:${b.right - 20}px;top:${b.top - 8}px;width:28px;height:28px;border-radius:50%;background:#ffcf70;color:#17200d;border:2px solid #17200d;text-align:center;font:bold 16px/24px system-ui;z-index:5;pointer-events:none`;
        document.body.append(mark);
      }
    });
    await page.screenshot({ path: 'artifacts/mobile-shooting.png' });
  } finally { await browser.close(); }
})();
