const { openSettings, returnToGame, selectSetting } = require('./settings.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.ROBBO_CHROMIUM, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve('release/robbo/index.html')).href);
    await selectSetting(page, '#planet', '6');
    await openSettings(page);
    await page.locator('#mute').check(); await page.locator('#volume').fill('20'); await page.locator('#volume').dispatchEvent('input');
    await page.reload();
    assert.equal(await page.locator('#planet').inputValue(), '6');
    assert.equal(await page.locator('#mute').isChecked(), true); assert.equal(await page.locator('#volume').inputValue(), '20');
    await openSettings(page);
    await page.getByRole('button', { name: 'Reset saved progress' }).click();
    await page.getByText('Replay / bug report', { exact: true }).click();
    await page.getByRole('button', { name: 'Record fresh attempt' }).click();
    await returnToGame(page);
    await page.waitForFunction(() => document.getElementById('board').dataset.effect !== 'arrival');
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(150);
    await page.locator('#pause').click(); await page.waitForTimeout(250);
    const snapshot = await page.locator('#board').getAttribute('data-robot');
    await openSettings(page);
    const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download replay' }).click();
    const download = await downloadEvent, stream = await download.createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks), data = JSON.parse(buffer.toString());
    assert(data.frames.length > 0); assert(data.frames.some(f => f.actions.some(a => a.type === 'pause')));
    await page.getByLabel('Import replay').setInputFiles({ name: 'replay.json', mimeType: 'application/json', buffer });
    await page.getByText('Replay verified.', { exact: false }).waitFor();
    assert.equal(await page.locator('#board').getAttribute('data-robot'), snapshot);
    assert.deepEqual(errors, []); console.log('Session persistence and native replay download/import passed on file://.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
