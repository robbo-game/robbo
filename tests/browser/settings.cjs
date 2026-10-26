// Exercise visible settings controls through the same navigation as a player.
async function openSettings(page) {
  if (await page.locator('#play-area').isVisible()) await page.locator('#settings').click();
}

async function returnToGame(page, resume = false) {
  await page.locator('#back-to-game').click();
  if (resume && await page.locator('#pause').textContent() === 'Resume') await page.locator('#pause').click();
}

async function withSettings(page, action) {
  const resume = await page.locator('#pause').isEnabled() && await page.locator('#pause').textContent() === 'Pause';
  await openSettings(page);
  await action();
  await returnToGame(page, resume);
}

async function selectSetting(page, selector, value) {
  await withSettings(page, () => page.selectOption(selector, value));
}

module.exports = { openSettings, returnToGame, selectSetting, withSettings };
