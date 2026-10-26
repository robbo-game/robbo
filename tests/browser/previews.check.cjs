const { selectSetting, withSettings } = require('./settings.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { installSite } = require('../../scripts/release/pages-preview.cjs');
(async () => {
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'robbo-preview-http-'));
  let browser, server;
  try {
    for (const pr of [undefined, 41, 42]) installSite(tree, path.resolve('release/robbo'), { directory: pr ? `previews/pr-${pr}` : '.', name: pr ? `Variant ${pr}` : 'main', sha: 'a'.repeat(40), ...(pr ? { pr } : {}) });
    server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const file = path.resolve(tree, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(tree + path.sep)) return res.writeHead(403).end();
      fs.readFile(file, (error, data) => { if (error) return res.writeHead(404).end(); res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png' })[path.extname(file)] ?? 'application/octet-stream'); res.end(data); });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    const context = await browser.newContext(); const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url + '/'); await selectSetting(page, '#planet', '20'); await page.locator('#pause').click(); await withSettings(page, () => page.locator('#mute').check());
    await page.goto(url + '/previews/pr-41/');
    await page.waitForFunction(() => document.documentElement.dataset.theme);
    assert.equal(await page.locator('#planet').inputValue(), '1'); assert.equal(await page.locator('#mute').isChecked(), false);
    assert(await page.getByRole('navigation', { name: 'Preview navigation' }).isVisible());
    await selectSetting(page, '#planet', '6'); await page.locator('#pause').click();
    await page.goto(url + '/previews/pr-42/'); await page.waitForFunction(() => document.documentElement.dataset.theme);
    assert.equal(await page.locator('#planet').inputValue(), '1');
    await page.goto(url + '/previews/pr-41/'); await page.waitForFunction(() => document.getElementById('state-title').textContent === 'Paused');
    assert.equal(await page.locator('#planet').inputValue(), '6');
    await page.getByRole('link', { name: 'main', exact: true }).click(); await page.waitForFunction(() => document.getElementById('state-title').textContent === 'Paused');
    assert.equal(await page.locator('#planet').inputValue(), '20'); assert.equal(await page.locator('#mute').isChecked(), true);
    await page.goto(url + '/previews/'); assert.equal(await page.locator('li a').count(), 3);
    assert.deepEqual(errors, []);
    console.log('Pages previews passed: nested assets, navigation, and independent saved attempts/preferences for main and two PR slots.');
  } finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); fs.rmSync(tree, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
