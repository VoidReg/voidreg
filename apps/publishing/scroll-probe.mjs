// Editor scroll probe: scroll deep into a long post, then select blocks, type, wait for autosave and
// toggle preview. The scroll position must not jump and the workspace must not remount.
//
//   SEED_ORIGIN=http://127.0.0.1:5174 ADMIN_PASSWORD=... node apps/publishing/scroll-probe.mjs [slug]
import { chromium } from 'playwright-core';

const origin = (process.env.SEED_ORIGIN ?? 'http://127.0.0.1:5174').replace(/\/$/, '');
const password = process.env.ADMIN_PASSWORD;
const slug = process.argv[2] ?? 'revision-history-in-practice';
if (!password) throw new Error('Set ADMIN_PASSWORD');

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox']
});
const failures = [];
// Sign in once: the login endpoint allows only a few attempts per quarter hour.
const loginContext = await browser.newContext();
const login = await loginContext.newPage();
await login.goto(origin + '/admin/');
await login.getByLabel('Admin password').fill(password);
await login.getByRole('button', { name: /sign in with password/i }).click();
await login.waitForSelector('nav[aria-label="Admin sections"]');
const session = await loginContext.storageState();
await loginContext.close();
for (const width of [1440, 1024, 390]) {
  const context = await browser.newContext({
    viewport: { width, height: 800 },
    storageState: session
  });
  const page = await context.newPage();
  await page.goto(`${origin}/admin/?article=${encodeURIComponent(slug)}`);
  await page.waitForSelector('.publishing-workspace .document-block');
  await page.evaluate(() => {
    window.__workspace = document.querySelector('.publishing-workspace');
  });
  const state = () =>
    page.evaluate(() => ({
      y: Math.round(window.scrollY),
      max: Math.round(document.documentElement.scrollHeight - innerHeight),
      same: window.__workspace === document.querySelector('.publishing-workspace')
    }));
  const check = async (step, expectedMin = 200) => {
    const s = await state();
    const ok = s.same && s.y >= expectedMin;
    console.log(width, step, JSON.stringify(s), ok ? 'ok' : 'FAIL');
    if (!ok) failures.push(`${width} ${step} ${JSON.stringify(s)}`);
  };
  const blocks = await page.locator('.document-block').count();
  const target = page.locator('.document-block').nth(Math.min(blocks - 1, 6));
  await target.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(500);
  await check('scrolled');
  const before = (await state()).y;
  // Select a block: the page must stay near where it was.
  await page.locator('.document-block .block-read-view').nth(Math.min(blocks - 1, 8)).click();
  await page.waitForTimeout(600);
  await check('selected');
  // Type, then wait for the autosave cycle.
  const field = page.locator('.document-block textarea').first();
  if (await field.count()) {
    await field.press('End');
    await field.pressSequentially(' x', { delay: 40 });
    await field.press('Backspace');
    await field.press('Backspace');
  }
  await page.waitForTimeout(4500);
  await check('autosaved');
  const after = (await state()).y;
  if (Math.abs(after - before) > 700) failures.push(`${width} drift ${before} -> ${after}`);
  // Leaving the document for another panel or mode and coming back must restore the position.
  const roundTrip = async (step, open, close) => {
    const start = (await state()).y;
    await open();
    await page.waitForTimeout(500);
    await close();
    await page.waitForTimeout(700);
    const s = await state();
    const ok = s.same && Math.abs(s.y - start) < 160;
    console.log(width, step, JSON.stringify({ start, ...s }), ok ? 'ok' : 'FAIL');
    if (!ok) failures.push(`${width} ${step} ${start} -> ${s.y}`);
  };
  const tools = page.getByRole('group', { name: 'Side panels' });
  await roundTrip(
    'settings',
    () => tools.getByRole('button', { name: 'Settings' }).click(),
    () => tools.getByRole('button', { name: 'Settings' }).click()
  );
  await roundTrip(
    'history',
    () => tools.getByRole('button', { name: 'History' }).click(),
    () => tools.getByRole('button', { name: 'History' }).click()
  );
  const outline = tools.getByRole('button', { name: 'Outline' });
  if (await outline.isVisible()) {
    await roundTrip('outline', () => outline.click(), () => outline.click());
  }
  const modes = page.getByRole('tablist', { name: 'Editor mode' });
  await roundTrip(
    'preview-mode',
    () => modes.getByRole('tab', { name: 'Preview' }).click(),
    () => modes.getByRole('tab', { name: 'Write' }).click()
  );
  const live = tools.getByRole('button', { name: 'Live preview' });
  if (await live.isEnabled()) {
    await roundTrip('live-preview', () => live.click(), () => live.click());
  }
  await context.close();
}
await browser.close();
if (failures.length) {
  console.error('Scroll probe failed:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('Scroll probe passed');
