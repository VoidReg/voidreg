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
@font-face{font-family:Sans;font-weight:700;src:url(${sans(700)})}
@font-face{font-family:Mono;font-weight:400;src:url(${mono})}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#0b0f14;color:#f5f5f5}
.frame{position:relative;width:1200px;height:630px;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between}
.grid{position:absolute;inset:0;background:
 linear-gradient(#ffffff0d 1px,transparent 1px) 0 0/60px 60px,
 linear-gradient(90deg,#ffffff0d 1px,transparent 1px) 0 0/60px 60px;
 mask-image:radial-gradient(circle at 82% 50%,#000 0,transparent 62%)}
.brand{position:relative;display:flex;align-items:center;gap:20px;font:700 40px/1 Sans}
.brand img{width:56px;height:56px}
.copy{position:relative;max-width:700px}
h1{font:700 88px/1.02 Sans;letter-spacing:-0.02em}
h1 span{color:#c2410c}
p{margin-top:28px;font:400 26px/1.4 Mono;color:#a3a3a3}
.url{position:relative;font:400 24px/1 Mono;color:#737373}
.mark{position:absolute;right:40px;top:85px;width:460px;height:460px}
</style><div class="frame"><div class="grid"></div>
<div class="brand"><img src="${url('src/lib/assets/brand-mark-dark.svg')}" alt="">Voidreg</div>
<div class="copy"><h1>Deep dive into the <span>Void</span></h1><p>Projects, notes and a knowledge map</p></div>
<div class="url">www.voidreg.xyz</div>
<img class="mark" src="${url('src/lib/assets/hero-mark-dark.svg')}" alt=""></div>`;

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
