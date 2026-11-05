import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, readdir, rename, unlink } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium, type Browser, type Page } from 'playwright-core';
import { compileDocument } from '@voidreg/authoring';
import type {
  DiagramRenderer,
  PublicationArtifact,
  RenderNode,
  RenderAttribute
} from '@publisle/adapter-core';
import type { Diagnostic } from '@publisle/schema';
const require = createRequire(import.meta.url);
const wave = require('wavedrom');
const directory = resolve(process.env.COMPILER_DATA_PATH ?? 'data/publishing');
const sourceRoot = resolve(process.env.COMPILER_SOURCE_ROOT ?? '.');
const cssPath = resolve(process.env.COMPILER_CSS_PATH ?? resolve(sourceRoot, '../admin/src/app.css'));
const token = process.env.COMPILER_TOKEN;
if (!token) throw Error('COMPILER_TOKEN is required.');
const build = 'png-v1-2026-10-20';
const assetPattern = /^[a-f0-9]{64}-(light|dark)\.png$/;
type Job = {
  id: string;
  state: 'queued' | 'running' | 'ready' | 'failed';
  kind: string;
  slug: string;
  revision: number;
  title: string;
  document: any;
  diagnostics: readonly Diagnostic[];
  artifact?: PublicationArtifact;
  created: number;
  progress: number;
  total: number;
};
type Variant = { src: string; width: number; height: number };
type Pair = { light: Variant; dark: Variant };
const jobs = new Map<string, Job>();
const pending: Job[] = [];
let running = false;
let browser: Browser | undefined;
let page: Page | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
const mermaidRoot = dirname(require.resolve('mermaid/package.json'));
const purifyRoot = dirname(dirname(require.resolve('dompurify')));
const fontRoot = dirname(require.resolve('@fontsource/ibm-plex-sans/package.json'));
function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
async function save(job: Job) {
  const temp = resolve(directory, 'jobs', job.id + '.tmp');
  await writeFile(temp, JSON.stringify(job));
  await rename(temp, resolve(directory, 'jobs', job.id + '.json'));
}
async function find(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return;
  let job = jobs.get(id);
  if (!job) {
    try {
      job = JSON.parse(await readFile(resolve(directory, 'jobs', id + '.json'), 'utf8'));
      if (job!.state === 'running' || job!.state === 'queued') {
        job!.state = 'failed';
        job!.diagnostics = [
          {
            level: 'error',
            code: 'compiler-restarted',
            message: 'Compilation was interrupted. Retry compilation.'
          }
        ];
      }
      jobs.set(id, job!);
      if (jobs.size > 16) {
        for (const [key, old] of jobs) {
          if (key !== id && (old.state === 'ready' || old.state === 'failed')) {
            jobs.delete(key);
            break;
          }
        }
      }
    } catch {
      return;
    }
  }
  return job;
}
async function palette(dark: boolean) {
  const css = await readFile(cssPath, 'utf8');
  const selector = dark ? '\n.dark {' : '\n.light {';
  const body = css.slice(css.indexOf(selector) + selector.length).split('}')[0];
  const values = Object.fromEntries(
    [...body.matchAll(/--([a-z-]+):\s*(#[a-fA-F0-9]{3,8});/g)].map((m) => [m[1], m[2]])
  );
  for (const key of [
    'background',
    'foreground',
    'card',
    'input',
    'primary',
    'secondary',
    'muted',
    'border'
  ])
    if (!values[key]) throw Error('Missing theme token ' + key);
  return {
    background: values.background,
    foreground: values.foreground,
    card: values.card,
    secondary: values.secondary,
    muted: values.muted,
    border: values.border,
    input: values.input,
    primary: values.primary,
    dark
  };
}
async function execute(command: string, args: string[], input: string) {
  return new Promise<string>((ok, fail) => {
    const child = spawn(command, args, {
      cwd: directory,
      env: { ...process.env, PLANTUML_SECURITY_PROFILE: 'SANDBOX' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const chunks: Buffer[] = [];
    let error = '',
      bytes = 0;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fail(Error('Diagram rendering timed out.'));
    }, 25000);
    child.stdout.on('data', (data) => {
      bytes += data.length;
      if (bytes > 4 * 1024 * 1024) {
        child.kill('SIGKILL');
        return;
      }
      chunks.push(Buffer.from(data));
    });
    child.stderr.on('data', (data) => {
      if (error.length < 4096) error += data;
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      fail(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || bytes > 4 * 1024 * 1024)
        fail(Error(error.trim() || 'Diagram renderer failed.'));
      else ok(Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
async function renderer() {
  if (browser && !browser.isConnected()) {
    browser = undefined;
    page = undefined;
  }
  if (idle) clearTimeout(idle);
  if (!browser) {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--renderer-process-limit=1',
        '--disable-dev-shm-usage'
      ]
    });
    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 2,
      extraHTTPHeaders: { 'X-Compiler-Key': token! }
    });
    const origin = 'http://127.0.0.1:' + port;
    await context.route('**/*', (route) =>
      route
        .request()
        .url()
        .startsWith(origin + '/')
        ? route.continue()
        : route.abort()
    );
    page = await context.newPage();
    page.setDefaultTimeout(25000);
    await page.goto(origin + '/render.html');
    await page.waitForFunction(() => !!(window as any).compiler);
    await page.evaluate(() => document.fonts.load('16px "IBM Plex Sans"'));
  }
  return page!;
}
async function closeIdle() {
  const old = browser;
  browser = undefined;
  page = undefined;
  await old?.close();
}
async function render(engine: string, source: string): Promise<Pair> {
  if (source.length > 50000) throw Error('Diagram source exceeds 50,000 characters.');
  if (!['mermaid', 'graphviz', 'plantuml', 'wavedrom'].includes(engine))
    throw Error('Unsupported diagram engine: ' + engine);
  if (engine === 'graphviz' && /\b(?:image|shapefile|imagepath|href|URL)\s*=/i.test(source))
    throw Error('External diagram resources are not supported.');
  if (engine === 'plantuml' && /!\s*(?:include|import)|%getenv|%load_json|%load_yaml/i.test(source))
    throw Error('PlantUML must be self-contained; external resources are not supported.');
  const pairs = {} as Pair;
  for (const mode of ['light', 'dark'] as const) {
    const colors = await palette(mode === 'dark');
    const key = hash({ build, engine, source, colors });
    const name = key + '-' + mode + '.png';
    const destination = resolve(directory, 'assets', name);
    const metadataPath = destination + '.json';
    let size: { width: number; height: number };
    try {
      size = JSON.parse(await readFile(metadataPath, 'utf8'));
      await stat(destination);
    } catch {
      let svg = '';
      if (engine === 'graphviz')
        svg = await execute(
          process.env.GRAPHVIZ_PATH ?? 'dot',
          [
            '-Tsvg',
            '-Gbgcolor=' + colors.background,
            '-Gfontname=IBM Plex Sans',
            '-Nfontname=IBM Plex Sans',
            '-Efontname=IBM Plex Sans',
            '-Nstyle=filled',
            '-Nfillcolor=' + colors.card,
            '-Nfontcolor=' + colors.foreground,
            '-Ncolor=' + colors.input,
            '-Ecolor=' + colors.input,
            '-Efontcolor=' + colors.foreground
          ],
          source
        );
      if (engine === 'plantuml') {
        const jar = process.env.PLANTUML_JAR ?? '/opt/plantuml/plantuml.jar';
        const skin = `\nskinparam backgroundColor ${colors.background}\nskinparam defaultFontName IBM Plex Sans\nskinparam defaultFontColor ${colors.foreground}\nskinparam ArrowColor ${colors.input}\nskinparam sequenceParticipantBackgroundColor ${colors.card}\nskinparam sequenceParticipantBorderColor ${colors.input}\nskinparam sequenceLifeLineBorderColor ${colors.input}\nskinparam classBackgroundColor ${colors.card}\nskinparam classBorderColor ${colors.input}\nskinparam shadowing false\n`;
        const input = source.replace(/(@start\w+[^\n]*)(\n|$)/, `$1\n${skin}\n`);
        svg = await execute(
          process.env.JAVA_PATH ?? 'java',
          [
            '-Xmx192m',
            '-XX:ActiveProcessorCount=1',
            '-Djava.awt.headless=true',
            '-Dplantuml.security.profile=SANDBOX',
            '-jar',
            jar,
            '-pipe',
            '-tsvg',
            '-failfast2',
            '-charset',
            'UTF-8'
          ],
          input
        );
      }
      if (engine === 'wavedrom') {
        const input = JSON.parse(source);
        if (!input || typeof input !== 'object' || (!input.signal && !input.reg && !input.assign))
          throw Error('WaveDrom requires a signal, register, or assignment definition.');
        const skin = JSON.parse(
          JSON.stringify(wave.waveSkin)
            .replace(/#000(?![0-9a-f])/gi, colors.foreground)
            .replace(/#fff(?![0-9a-f])/gi, colors.background)
            .replace(/#0041c4/gi, colors.primary)
        );
        svg = wave.onml.stringify(wave.renderAny(0, input, skin));
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const rendering = async () => {
        const tab = await renderer();
        if (engine === 'mermaid')
          svg = await tab.evaluate(
            async ({ source, colors }) => (window as any).compiler.mermaidSvg(source, colors),
            { source, colors }
          );
        size = await tab.evaluate(
          async ({ svg, colors }) => (window as any).compiler.displaySvg(svg, colors),
          { svg, colors }
        );
        const image = await tab.locator('#canvas').screenshot({ timeout: 25000 });
        if (image.length > 4 * 1024 * 1024)
          throw Error('Diagram image exceeds the supported 4 MiB size.');
        await writeFile(destination, image);
        await writeFile(metadataPath, JSON.stringify(size));
      };
      try {
        await Promise.race([
          rendering(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              void closeIdle().catch(() => {});
              reject(Error('Diagram rendering timed out.'));
            }, 35000);
          })
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      size = JSON.parse(await readFile(metadataPath, 'utf8'));
    }
    pairs[mode] = { src: '/media/diagrams/' + name, ...size };
  }
  return pairs;
}
const text = (value: string): RenderNode => ({ kind: 'text', value });
const element = (
  tag: string,
  attributes: Record<string, RenderAttribute>,
  children: readonly RenderNode[]
): RenderNode => ({ kind: 'element', tag, attributes, children });
function imageRenderer(pairs: Map<string, Pair>): DiagramRenderer {
  return ({ engine, source, alt }) => {
    const pair = pairs.get(hash({ engine, source }));
    if (!pair) throw Error('Diagram image is not ready.');
    const modes = ['light', 'dark'] as const;
    return {
      static: [
        element('div', { class: 'diagram-static' }, [
          element(
            'div',
            { class: 'diagram-viewport', role: 'region', tabindex: 0, 'aria-label': alt },
            modes.map((mode) =>
              element(
                'img',
                {
                  class: 'diagram-' + mode,
                  src: pair[mode].src,
                  alt,
                  width: pair[mode].width,
                  height: pair[mode].height,
                  loading: 'lazy',
                  decoding: 'async'
                },
                []
              )
            )
          ),
          ...modes.map((mode) =>
            element(
              'a',
              { class: 'diagram-' + mode, href: pair[mode].src, target: '_blank', rel: 'noopener' },
              [text('Open full-size diagram')]
            )
          ),
          element('details', { class: 'diagram-source' }, [
            element('summary', {}, [text('Diagram source (' + engine + ')')]),
            element('pre', {}, [element('code', {}, [text(source)])])
          ])
        ])
      ]
    };
  };
}

async function compile(job: Job) {
  job.state = 'running';
  await save(job);
  const initial = compileDocument(job.document, job.title);
  job.diagnostics = initial.diagnostics;
  if (!initial.document || job.diagnostics.some((d) => d.level === 'error')) {
    job.state = 'failed';
    await save(job);
    return;
  }
  const blocks = initial.document.blocks.filter((b) => b.type === 'publisle:diagram');
  job.total = blocks.length;
  const pairs = new Map<string, Pair>();
  const errors: Diagnostic[] = [];
  const deadline = Date.now() + 120000;
  for (const block of blocks) {
    if (Date.now() > deadline) {
      errors.push({
        level: 'error',
        code: 'compilation-timeout',
        message: 'Compilation exceeded its time budget. Retry to reuse completed images.'
      });
      break;
    }
    const data = block.data as Record<string, unknown>;
    try {
      const key = hash({ engine: data.engine, source: data.source });
      if (!pairs.has(key)) pairs.set(key, await render(String(data.engine), String(data.source)));
      job.progress++;
      await save(job);
    } catch (error) {
      errors.push({
        level: 'error',
        code: 'invalid-diagram',
        blockId: block.id,
        message: (error as Error).message
      });
    }
  }
  if (errors.length) {
    job.state = 'failed';
    job.diagnostics = [...job.diagnostics, ...errors];
    await save(job);
    return;
  }
  const rendered = imageRenderer(pairs);
  const result = compileDocument(
    initial.document,
    job.title,
    Object.fromEntries(
      ['mermaid', 'graphviz', 'plantuml', 'wavedrom'].map((engine) => [engine, rendered])
    )
  );
  job.artifact = result.artifact;
  job.diagnostics = result.diagnostics;
  if (job.artifact && Buffer.byteLength(JSON.stringify(job.artifact)) > 4 * 1024 * 1024) {
    job.artifact = undefined;
    job.diagnostics = [
      ...job.diagnostics,
      {
        level: 'error',
        code: 'artifact-too-large',
        message:
          'Compiled publication exceeds the 4 MiB limit. Split this content into smaller documents.'
      }
    ];
  }
  job.state = job.artifact ? 'ready' : 'failed';
  await save(job);
}
async function drain() {
  if (running) return;
  running = true;
  try {
    for (let job = pending.shift(); job; job = pending.shift()) {
      try {
        await compile(job);
      } catch (error) {
        job.state = 'failed';
        job.diagnostics = [
          { level: 'error', code: 'compilation-failed', message: (error as Error).message }
        ];
        await save(job);
      }
    }
  } finally {
    running = false;
    idle = setTimeout(() => void closeIdle(), 10000);
  }
}
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function input(req: IncomingMessage) {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 3 * 1024 * 1024) throw Error('Document exceeds compilation request limit.');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
const port = Number(process.env.PORT ?? 18084);
await mkdir(resolve(directory, 'assets'), { recursive: true });
await mkdir(resolve(directory, 'jobs'), { recursive: true });
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/healthz') {
      res.end('ok');
      return;
    }
    const supplied = Buffer.from(String(req.headers['x-compiler-key'] ?? ''));
    const expected = Buffer.from(token!);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      json(res, 401, { error: 'Internal compiler credentials required.' });
      return;
    }
    const url = new URL(req.url!, 'http://localhost');
    if (url.pathname === '/render.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        `<!doctype html><html><head><style>@font-face{font-family:'IBM Plex Sans';src:url('/fonts/ibm-plex-sans-latin-400-normal.woff2')}body{margin:0;width:max-content}#canvas{display:inline-block;padding:16px;font-family:'IBM Plex Sans',sans-serif}</style></head><body><div id="canvas"></div><script type="module" src="/browser.mjs"></script></body></html>`
      );
      return;
    }
    if (url.pathname === '/browser.mjs') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(await readFile(resolve(sourceRoot, 'browser.mjs')));
      return;
    }
    for (const [prefix, root] of [
      ['/deps/mermaid', mermaidRoot],
      ['/deps/dompurify', purifyRoot],
      ['/fonts', resolve(fontRoot, 'files')]
    ]) {
      if (url.pathname.startsWith(prefix + '/')) {
        const filename = resolve(root, '.' + decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!filename.startsWith(root + '/')) throw Error('Invalid asset path.');
        res.setHeader(
          'Content-Type',
          /\.m?js$/.test(filename)
            ? 'text/javascript'
            : extname(filename) === '.woff2'
              ? 'font/woff2'
              : 'application/octet-stream'
        );
        res.end(await readFile(filename));
        return;
      }
    }
    if (url.pathname === '/jobs' && req.method === 'POST') {
      let cleaned = 0;
      for (const name of await readdir(resolve(directory, 'jobs'))) {
        if (cleaned >= 50) break;
        if (/^[a-f0-9-]{36}\.json$/.test(name)) {
          const path = resolve(directory, 'jobs', name);
          if ((await stat(path)).mtimeMs < Date.now() - 86400000) {
            await unlink(path);
            cleaned++;
          }
        }
      }
      if (pending.length >= 8) {
        json(res, 429, { error: 'Compilation queue is full. Retry shortly.' });
        return;
      }
      const data = await input(req);
      if (
        !['article', 'project'].includes(data.kind) ||
        typeof data.slug !== 'string' ||
        !Number.isInteger(data.revision) ||
        typeof data.title !== 'string' ||
        !data.document
      )
        throw Error('Invalid compilation request.');
      const job: Job = {
        ...data,
        id: randomUUID(),
        state: 'queued',
        diagnostics: [],
        created: Date.now(),
        progress: 0,
        total: 0
      };
      jobs.set(job.id, job);
      if (jobs.size > 16) {
        for (const [id, old] of jobs) {
          if (old.state === 'ready' || old.state === 'failed') {
            jobs.delete(id);
            break;
          }
        }
      }
      await save(job);
      pending.push(job);
      json(res, 202, { id: job.id, state: job.state });
      void drain();
      return;
    }
    if (url.pathname.startsWith('/jobs/')) {
      const job = await find(url.pathname.slice(6));
      if (!job) {
        json(res, 404, { error: 'Compilation not found. Start compilation again.' });
        return;
      }
      json(res, 200, job);
      return;
    }
    if (url.pathname.startsWith('/assets/')) {
      const filename = url.pathname.slice(8);
      if (!assetPattern.test(filename)) {
        json(res, 404, { error: 'Image not found.' });
        return;
      }
      res.setHeader('Content-Type', 'image/png');
      res.end(await readFile(resolve(directory, 'assets', filename)));
      return;
    }
    json(res, 404, { error: 'Not found.' });
  } catch (error) {
    json(res, 400, { error: (error as Error).message });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, process.env.HOST ?? '127.0.0.1', () =>
  console.log('Publishing worker listening on ' + port)
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    server.close();
    void closeIdle().finally(() => process.exit(0));
  });
