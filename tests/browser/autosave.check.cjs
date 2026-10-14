const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium, firefox } = require('playwright');

async function ready(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await new Promise(resolve => http.get(url, r => { r.resume(); resolve(r.statusCode === 200); }).on('error', () => resolve(false)))) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Save test server did not start');
}
async function readSave(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('robbo-saves', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('attempts'), get = tx.objectStore('attempts').get('current');
      let value; get.onsuccess = () => { value = get.result; };
      tx.oncomplete = () => { db.close(); resolve(value); }; tx.onabort = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  }));
}
async function move(page, key) {
  const before = await page.locator('#board').getAttribute('data-tick');
  await page.keyboard.press(key);
  await page.waitForFunction(tick => Number(document.getElementById('board').dataset.tick) > Number(tick), before);
}
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'robbo-saves-'));
  const server = spawn(process.execPath, ['scripts/dev/serve.cjs'], { env: { ...process.env, ROBBO_TEST_PORT: '8083' }, stdio: ['ignore', 'ignore', 'inherit'] });
  let context;
  const engine = process.env.ROBBO_BROWSER === 'firefox' ? firefox : chromium;
  const options = { viewport: { width: 390, height: 760 }, hasTouch: true,
    ...(engine === chromium ? { executablePath: process.env.ROBBO_CHROMIUM, args: ['--no-sandbox'] } : {}) };
  const url = 'http://127.0.0.1:8083/';
  try {
    await ready(url);
    context = await engine.launchPersistentContext(directory, options);
    let page = context.pages()[0]; const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'java-atlas-v1');
    assert.equal(await page.locator('#pack').inputValue(), '01', 'Fresh profiles default to Original Legacy');
    assert.equal(await page.locator('#theme').inputValue(), 'java-atlas-v1', 'Classic artwork is the default');
    await page.selectOption('#pack', '02'); await page.selectOption('#planet', '20');
    await page.locator('#back-to-game').click();
    await page.waitForFunction(() => document.getElementById('board').dataset.effect !== 'arrival');
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp']) await move(page, key);
    await page.locator('#pause').click();
    assert.equal(await page.locator('#state-title').textContent(), 'Paused');
    const before = await readSave(page);
    assert.equal(before.pack, '02'); assert.equal(before.planet, 20);
    assert.equal(before.world.status, 'playing');
    assert(before.world.ammo > 0, 'The persisted attempt includes a collected ammo pickup');
    await context.close(); context = undefined;

    // A completely new browser process with the same disk profile must load IndexedDB.
    context = await engine.launchPersistentContext(directory, options);
    await context.addInitScript(() => localStorage.removeItem('robbo.attempt.backup.v1'));
    page = context.pages()[0]; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('state-title').textContent === 'Paused');
    const after = await readSave(page);
    assert.deepEqual(after.world, before.world, 'Reopening the browser restores every entity and simulation timer');
    assert.equal(after.randomState, before.randomState, 'Enemy RNG continues from its saved state');
    assert.equal(await page.locator('#planet').inputValue(), '20'); assert.equal(await page.locator('#pack').inputValue(), '02');
    const tick = await page.locator('#board').getAttribute('data-tick');
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#board').getAttribute('data-tick'), tick, 'Restored enemies stay paused until Resume');
    await page.locator('#continue').click();
    await page.waitForFunction(tick => Number(document.getElementById('board').dataset.tick) > Number(tick), tick);
    await page.locator('#pause').click();
    await page.locator('#restart').click();
    await page.locator('#pause').click();
    await page.reload();
    await page.waitForFunction(() => document.getElementById('state-title').textContent === 'Paused');
    assert.equal((await readSave(page)).world.ammo, 0, 'Planet reset replaces the saved inventory');
    assert.equal(await page.locator('#planet').inputValue(), '20');
    await page.getByRole('button', { name: 'Reset saved progress' }).click();
    await page.locator('#pause').click();
    await page.reload();
    await page.waitForFunction(() => document.getElementById('state-title').textContent === 'Paused');
    assert.equal(await page.locator('#planet').inputValue(), '1'); assert.equal(await page.locator('#pack').inputValue(), '01');
    assert.deepEqual(errors, []);
    await context.close(); context = undefined;

    // Prefer a newer lifecycle journal, but reject corrupt records and retain the valid DB save.
    context = await engine.launchPersistentContext(directory, options);
    page = context.pages()[0]; await page.goto(url);
    await page.waitForFunction(() => document.getElementById('state-title').textContent === 'Paused');
    await page.addInitScript(() => {
      const next = sessionStorage.getItem('save-test-next-journal');
      if (next) { localStorage.setItem('robbo.attempt.backup.v1', next); sessionStorage.removeItem('save-test-next-journal'); }
    });
    const journal = await readSave(page); journal.savedAt += 10000; journal.world.ammo = 5;
    await page.evaluate(record => sessionStorage.setItem('save-test-next-journal', JSON.stringify(record)), journal);
    await page.reload(); await page.waitForFunction(() => document.getElementById('state-title').textContent === 'Paused');
    assert.equal((await readSave(page)).world.ammo, 5, 'A newer synchronous checkpoint wins over an older DB record');
    const corrupt = await readSave(page); corrupt.savedAt += 10000; corrupt.world.robot.x = 999;
    await page.evaluate(record => sessionStorage.setItem('save-test-next-journal', JSON.stringify(record)), corrupt);
    await page.reload(); await page.waitForFunction(() => document.getElementById('state-title').textContent === 'Paused');
    assert.notEqual((await readSave(page)).world.robot.x, 999, 'A damaged journal cannot replace a valid attempt');
    await context.close(); context = undefined;

    // If IndexedDB is blocked, the synchronous journal still supports a reload.
    context = await engine.launchPersistentContext(path.join(directory, 'fallback'), options);
    await context.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get() { throw Error('Blocked storage'); } }));
    page = context.pages()[0]; await page.goto(url);
    await page.selectOption('#planet', '20'); await page.locator('#pause').click();
    const fallback = await page.evaluate(() => JSON.parse(localStorage.getItem('robbo.attempt.backup.v1')));
    await page.reload(); await page.waitForFunction(() => document.getElementById('state-title').textContent === 'Paused');
    const recovered = await page.evaluate(() => JSON.parse(localStorage.getItem('robbo.attempt.backup.v1')));
    assert.deepEqual(recovered.world, fallback.world);
    console.log('Autosave passed: Original Legacy defaults, persistent browser restart, full IndexedDB checkpoint, paused restore, Resume, reset and blocked-IDB fallback.');
  } finally {
    if (context) await context.close(); server.kill(); await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
