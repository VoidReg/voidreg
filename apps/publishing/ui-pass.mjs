// Browser pass over the reader and admin at three widths and two themes.
// Checks horizontal overflow, console errors, text contrast and tap target size,
// and writes a screenshot of every page so a person can review them.
//
//   SEED_ORIGIN=http://127.0.0.1:5174 ADMIN_PASSWORD=... CHROME_PATH=/usr/bin/google-chrome \
//     node apps/publishing/ui-pass.mjs [outDir]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const origin = (process.env.SEED_ORIGIN ?? 'http://127.0.0.1:5174').replace(/\/$/, '');
const password = process.env.ADMIN_PASSWORD;
const outDir = process.argv[2] ?? '/tmp/voidreg-ui-pass';
const widths = [375, 768, 1440];
const themes = ['light', 'dark'];
const reader = [
  ['home', '/'],
  ['blog', '/blog'],
  ['post-kitchen-sink', '/blog/publisle-feature-test'],
  ['post-long', '/blog/revision-history-in-practice'],
  ['project', '/projects/test-signal-lab'],
  ['blog-tag', '/blog?tag=test'],
  ['map', '/map'],
  ['map-focus', '/map?focus=test-signal-lab']
];
// With a large catalogue seeded (seed:scale), also check the board and filters at scale.
// Long pages are captured at viewport height so the board's drawing is what is judged.
const scale = process.env.SCALE === '1';
const viewportOnly = new Set(['map-scale', 'map-scale-focus', 'map-scale-filter']);
if (scale)
  reader.push(
    ['map-scale', '/map'],
    ['map-scale-focus', '/map?focus=scale-project-0012'],
    ['map-scale-filter', '/map?category=Category%2003&tag=rust']
  );
const admin = [
  ['preview-map', '/preview/map'],
  ['admin-articles', '/admin/'],
  ['admin-editor', '/admin/?article=publisle-feature-test'],
  [
    'admin-history',
    '/admin/?article=revision-history-in-practice&panel=settings&inspector=history'
  ],
  ['admin-editor-settings', '/admin/?article=publisle-feature-test&panel=settings'],
  ['admin-editor-live', '/admin/?article=publisle-feature-test&panel=preview'],
  ['admin-media', '/admin/?tab=media'],
  ['admin-comments', '/admin/?tab=comments'],
  ['admin-mcp', '/admin/?tab=mcp']
];

const problems = [];
const report = (label, message) => {
  problems.push(`${label}: ${message}`);
  console.log(`  FAIL ${label}: ${message}`);
};

/** Runs in the page. Returns overflow, low-contrast text and small controls. */
function audit() {
  const parse = (value) => {
    const m = value.match(/rgba?\(([^)]+)\)/) ?? value.match(/color\(srgb ([^)]+)\)/);
    if (!m) return null;
    const parts = m[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    const scale = value.startsWith('color(') ? 255 : 1;
    return {
      r: parts[0] * scale,
      g: parts[1] * scale,
      b: parts[2] * scale,
      a: parts[3] ?? 1
    };
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1
  });
  const background = (element) => {
    const stack = [];
    for (let node = element; node; node = node.parentElement) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color && color.a > 0) {
        stack.push(color);
        if (color.a === 1) break;
      }
    }
    let result = { r: 255, g: 255, b: 255, a: 1 };
    for (const color of stack.reverse()) result = over(color, result);
    return result;
  };
  const luminance = ({ r, g, b }) => {
    const channel = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      Number(style.opacity) > 0.01
    );
  };
  const describe = (element) =>
    element.tagName.toLowerCase() +
    (element.id ? '#' + element.id : '') +
    (typeof element.className === 'string' && element.className
      ? '.' + element.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '');
  const scrolls = (element) => {
    for (let node = element.parentElement; node; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') return true;
    }
    return false;
  };

  const out = { overflow: [], contrast: [], small: [] };
  const viewport = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > viewport + 1)
    out.overflow.push(
      `page scrolls horizontally by ${document.documentElement.scrollWidth - viewport}px`
    );
  for (const element of document.body.querySelectorAll('*')) {
    if (!visible(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.right > viewport + 1 && !scrolls(element) && element.closest('svg') === null)
      out.overflow.push(`${describe(element)} ends at ${Math.round(rect.right)} of ${viewport}`);
    // Direct text only.
    const hasText = [...element.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0
    );
    if (hasText && !element.closest('svg, script, style, [aria-hidden="true"], .katex-html')) {
      const style = getComputedStyle(element);
      const color = parse(style.color);
      if (color) {
        const bg = background(element);
        const fg = over(color, bg);
        const size = parseFloat(style.fontSize);
        const bold = Number(style.fontWeight) >= 700;
        const needed = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
        const value = ratio(fg, bg);
        if (value < needed && !element.disabled)
          out.contrast.push(
            `${describe(element)} ${value.toFixed(2)}:1 < ${needed} ("${element.textContent.trim().slice(0, 24)}")`
          );
      }
    }
    if (element.matches('.sr-only')) continue;
    if (
      element.matches(
        'button, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, [role=button]'
      )
    ) {
      if ((rect.width < 24 || rect.height < 24) && !element.closest('svg'))
        out.small.push(
          `${describe(element)} is ${Math.round(rect.width)}x${Math.round(rect.height)}`
        );
    }
  }
  for (const key of Object.keys(out)) out[key] = [...new Set(out[key])].slice(0, 6);
  return out;
}

/**
 * Drives the PCB board like a person: zoom with the wheel, drag, focus a project by keyboard,
 * read its panel and clear it again. Also checks that drawing stays bounded and quick.
 */
async function boardPass(page, name, width, theme, shot) {
  const label = `${name} ${width} ${theme}`;
  const board = page.locator('.board');
  if (!(await board.count())) return report(label, 'board is missing');
  await board.scrollIntoViewIfNeeded();
  await page.waitForSelector('.board[data-ready="true"]');
  const box = await page.locator('.board .stage').boundingBox();
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const transform = () => page.locator('.board .world').evaluate((el) => el.style.transform);
  const chips = () => page.locator('.board .chip').count();
  const lod = () => board.getAttribute('data-lod');

  // Scripted wheel: zooming in must change the level of detail and keep the DOM bounded.
  const before = await transform();
  await page.mouse.move(centre.x, centre.y);
  const started = Date.now();
  await page.keyboard.down('Control');
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -30);
    await page.waitForTimeout(30);
  }
  await page.keyboard.up('Control');
  await page.waitForTimeout(700);
  const elapsed = Date.now() - started;
  if ((await transform()) === before) report(label, 'wheel did not zoom the board');
  const drawn = await chips();
  if (drawn > 450) report(label, `${drawn} chips drawn at once, culling is not bounded`);
  if (elapsed > 6000) report(label, `wheel zoom took ${elapsed}ms`);
  await shot(`${name}-zoom`);

  // Scripted drag pans the board.
  const zoomed = await transform();
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(centre.x - i * 25, centre.y - i * 12);
  await page.mouse.up();
  await page.waitForTimeout(200);
  if ((await transform()) === zoomed) report(label, 'drag did not pan the board');

  // Keyboard focus: arrows pick a project, Enter lights its circuit and opens the panel.
  await page.locator('.board .stage').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.press('Enter');
  const panel = page.locator('aside[aria-label="Selected project"]');
  try {
    await panel.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    return report(label, 'focusing a project did not open the panel');
  }
  await page.waitForSelector('.board .circuit', { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  if (!/[?&]focus=/.test(page.url())) report(label, 'focus is not in the URL');
  if (!(await page.locator('.board .circuit .trace').count()))
    report(label, 'focused project drew no traces');
  if (!(await panel.getByRole('link', { name: 'Open project' }).count()))
    report(label, 'panel has no Open project link');
  const dimmed = await page.locator('.board .chip.dim').count();
  const lit = await page.locator('.board .chip:not(.dim)').count();
  if (!dimmed && (await lod()) !== 'far') report(label, 'nothing is dimmed around the circuit');
  if (!lit && (await lod()) !== 'far') report(label, 'no lit chips around the circuit');
  await page.mouse.move(1, 1);
  await shot(`${name}-circuit`);

  await page.locator('.board .stage').focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (await panel.count()) report(label, 'Escape did not clear the focused project');
  if (/[?&]focus=/.test(page.url())) report(label, 'focus is still in the URL after Escape');
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox']
});
await mkdir(outDir, { recursive: true });
let pages = 0;
// Sign in once; the login endpoint is rate limited, so every context reuses this session.
let session;
if (password) {
  const loginContext = await browser.newContext();
  const login = await loginContext.newPage();
  await login.goto(origin + '/admin/');
  await login.getByLabel('Admin password').fill(password);
  await login.getByRole('button', { name: /sign in with password/i }).click();
  await login.waitForSelector('nav[aria-label="Admin sections"]');
  session = await loginContext.storageState();
  await loginContext.close();
}
for (const theme of themes) {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: theme,
      storageState: session
    });
    const page = await context.newPage();
    let label = '';
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      // The MCP screen deliberately shows an error for password-only sessions (403).
      if (/status of 403/.test(m.text()) && label.startsWith('admin-mcp')) return;
      // The reader probes for a commenter session; an anonymous 401 is expected.
      if (/status of 401/.test(m.text()) && !label.startsWith('admin')) return;
      report(label, `console error: ${m.text().slice(0, 160)}`);
    });
    page.on('pageerror', (e) => report(label, `page error: ${e.message.slice(0, 160)}`));

    const visit = async (name, path) => {
      label = `${name} ${width} ${theme}`;
      await page.goto(origin + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      // Dismiss the consent banner so it does not hide content in screenshots.
      const banner = page.getByRole('button', {
        name: /reject non-essential/i
      });
      if (await banner.count())
        await banner
          .first()
          .click()
          .catch(() => undefined);
      // Park the pointer so a card under the banner is not captured mid hover transition.
      await page.mouse.move(1, 1);
      // Visible schematics hydrate on scroll, so scroll through the page once.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 700) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(400);
      const result = await page.evaluate(audit);
      for (const [kind, items] of Object.entries(result))
        for (const item of items) report(label, `${kind}: ${item}`);
      await page.screenshot({
        path: `${outDir}/${name}-${width}-${theme}.png`,
        fullPage: !name.startsWith('admin') && !viewportOnly.has(name)
      });
      pages++;
    };
    const shot = async (tag) => {
      await page.mouse.move(1, 1);
      await page.screenshot({ path: `${outDir}/${tag}-${width}-${theme}.png` });
    };

    for (const [name, path] of reader) {
      await visit(name, path);
      if (name === 'map' || name === 'map-scale') await boardPass(page, name, width, theme, shot);
    }
    if (password)
      for (const [name, path] of admin) {
        await visit(name, path);
        if (name === 'preview-map') await boardPass(page, name, width, theme, shot);
      }
    await context.close();
  }
}
await browser.close();
console.log(`\n${pages} pages checked, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
