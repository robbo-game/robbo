const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.ROBBO_CHROMIUM, args: ['--no-sandbox'] });
  try {
    for (const viewport of [{width:1280,height:800},{width:390,height:844}]) {
      const page = await browser.newPage({ viewport });
      const errors=[]; page.on('pageerror', e => errors.push(e.message));
      const url=pathToFileURL(path.resolve('release/robbo/index.html')).href;
      await page.goto(url+'#test');
      await page.waitForFunction(() => !!window.robboTest);
      assert(await page.locator('#board').isVisible());
      assert(!await page.locator('#game-settings').isVisible());
      assert(!await page.locator('.input-settings').isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
      const robot=await page.locator('#board').getAttribute('data-robot');
      await page.locator('#settings').click();
      assert.equal(new URL(page.url()).searchParams.get('page'),'settings');
      assert(await page.locator('#theme').isVisible());
      assert(!await page.locator('#board').isVisible());
      await page.locator('.input-settings summary').click();
      assert(await page.getByLabel('Key for up', {exact:true}).isVisible());
      await page.locator('#game-settings [data-page-link="objects"]').click();
      assert(await page.locator('#object-help').isVisible());
      assert(!await page.locator('#game-settings').isVisible());
      assert.equal(await page.locator('#object-help details').count(),6);
      await page.goBack();
      assert(await page.locator('#game-settings').isVisible());
      await page.locator('#back-to-game').click();
      assert(await page.locator('#board').isVisible());
      assert.equal(await page.locator('#board').getAttribute('data-robot'),robot);
      await page.goto(url+'?page=about#test');
      await page.waitForFunction(() => !!window.robboTest);
      assert(await page.locator('.subpage[data-page="about"]').isVisible());
      assert(!await page.locator('#board').isVisible());
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('Page navigation passed on desktop and mobile.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
