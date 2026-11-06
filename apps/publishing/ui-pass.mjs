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
  ['map', '/map']
];
const admin = [
  ['admin-articles', '/admin/'],
  ['admin-editor', '/admin/?article=publisle-feature-test'],
  [
    'admin-history',
    '/admin/?article=revision-history-in-practice&panel=settings&inspector=history'
  ],
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
    return { r: parts[0] * scale, g: parts[1] * scale, b: parts[2] * scale, a: parts[3] ?? 1 };
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
      const banner = page.getByRole('button', { name: /reject non-essential/i });
      if (await banner.count())
        await banner
          .first()
          .click()
          .catch(() => undefined);
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
        fullPage: !name.startsWith('admin')
      });
      pages++;
    };

    for (const [name, path] of reader) await visit(name, path);
    if (password) for (const [name, path] of admin) await visit(name, path);
    await context.close();
  }
}
await browser.close();
console.log(`\n${pages} pages checked, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
