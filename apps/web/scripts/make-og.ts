// Renders static/og-default.png: the share image used when a page has none of its own.
// Run `pnpm exec tsx scripts/make-og.ts` after changing the brand or tagline. Needs Google Chrome.
// Chrome rasterises vector text at 2x, so the 2400x1260 result stays sharp when a platform
// scales it down for a card or up for a retina screen.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const url = (path: string) => pathToFileURL(resolve(root, path)).href;
const sans = (weight: number) =>
  url(`node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-${weight}-normal.woff2`);
const mono = url(
  'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'
);

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Sans;font-weight:600;src:url(${sans(600)})}
@font-face{font-family:Mono;font-weight:400;src:url(${mono})}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#0b0f14;color:#f5f5f5}
.frame{position:relative;width:1200px;height:630px;padding:72px 88px;display:flex;flex-direction:column;justify-content:center;gap:44px}
.grid{position:absolute;inset:0;background:
 linear-gradient(#ffffff0d 1px,transparent 1px) 0 0/60px 60px,
 linear-gradient(90deg,#ffffff0d 1px,transparent 1px) 0 0/60px 60px;
 mask-image:radial-gradient(circle at 30% 50%,#000 0,transparent 70%)}
.logo{position:relative;display:flex;align-items:center;gap:36px}
.logo img{width:176px;height:176px}
.logo span{font:600 168px/1 Sans;letter-spacing:-0.02em}
.logo b{font-weight:600;color:#c2410c}
.tag{position:relative;font:600 44px/1.2 Sans;color:#d4d4d4}
.sub{position:relative;margin-top:-20px;font:400 26px/1.4 Mono;color:#8a8a8a}
.url{position:absolute;right:88px;bottom:56px;font:400 24px/1 Mono;color:#737373}
</style><div class="frame"><div class="grid"></div>
<div class="logo"><img src="${url('src/lib/assets/brand-mark-dark.svg')}" alt=""><span>Void<b>reg</b></span></div>
<div class="tag">Deep dive into the Void</div>
<div class="sub">Projects, notes and a knowledge map</div>
<div class="url">www.voidreg.xyz</div></div>`;

const dir = mkdtempSync(join(tmpdir(), 'og-'));
const page = join(dir, 'og.html');
writeFileSync(page, html);
const out = resolve(root, 'static/og-default.png');
try {
  execFileSync(
    process.env.CHROME ?? 'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--force-device-scale-factor=2',
      '--window-size=1200,630',
      '--virtual-time-budget=4000',
      `--screenshot=${out}`,
      pathToFileURL(page).href
    ],
    { stdio: 'ignore' }
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('wrote', out, statSync(out).size, 'bytes');
