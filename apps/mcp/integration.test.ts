import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from './http';
import { filingMeta } from './tools';
import { defaultData } from '@publisle/playground';
import { extensions } from '@voidreg/authoring/blocks';
import {
  compileDocument,
  safeMarkdown,
  archivalMarkdown,
  importMarkdown
} from '@voidreg/authoring';

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
}

for (const mode of ['legacy', 'auto'] as const) {
  test(`HTTP MCP client round trip (${mode}) and safe draft authoring`, async () => {
    const token = 'vr_mcp_' + 'a'.repeat(64);
    let live = true;
    const articles = new Map<string, Record<string, unknown>>();
    const backend = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (!live || req.headers.authorization !== 'Bearer ' + token) {
        res.writeHead(401).end('{}');
        return;
      }
      const url = new URL(req.url!, 'http://api');
      if (url.pathname.endsWith('/session')) {
        res.end('{"authenticated":true}');
        return;
      }
      const slug = url.pathname.split('/')[5];
      if (req.method === 'GET') {
        if (!slug)
          res.end(
            JSON.stringify({
              items: [...articles.values()],
              page: 1,
              per_page: 20,
              total: articles.size
            })
          );
        else {
          const article = articles.get(slug);
          res.writeHead(article ? 200 : 404).end(JSON.stringify(article ?? {}));
        }
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const current = slug ? articles.get(slug) : undefined;
      if (current && (current.status !== 'draft' || input.expected_revision !== current.revision)) {
        res.writeHead(409).end('{}');
        return;
      }
      const article = {
        ...current,
        ...input,
        slug: slug ?? input.slug ?? 'new-draft',
        status: 'draft',
        revision: Number(current?.revision ?? 0) + 1
      };
      articles.set(article.slug, article);
      res.end(JSON.stringify(article));
    });
    const api = await listen(backend);
    const http = createHttpServer(api, 'http://127.0.0.1');
    const origin = await listen(http);
    const client = new Client(
      { name: 'test-client', version: '1' },
      { versionNegotiation: { mode } }
    );
    try {
      const missing = await fetch(origin + '/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer not-a-token' },
        body: '{}'
      });
      assert.equal(missing.status, 401);
      assert.equal(missing.headers.get('cache-control'), 'no-store');
      assert.equal(
        (
          await fetch(origin + '/mcp', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + token,
              Origin: 'https://untrusted.example'
            },
            body: '{}'
          })
        ).status,
        403
      );
      await client.connect(
        new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
          requestInit: { headers: { Authorization: 'Bearer ' + token } }
        })
      );
      const listed = await client.listTools();
      assert.deepEqual(listed.tools.map((t) => t.name).sort(), [
        'create_draft',
        'create_topic',
        'get_article',
        'get_block_catalog',
        'get_compilation',
        'list_articles',
        'list_topics',
        'update_draft',
        'update_topic',
        'validate_document'
      ]);
      const call = (name: string, args: Record<string, unknown>) =>
        client.callTool({ name, arguments: args });
      const validation = await call('validate_document', {
        title: 'Title',
        markdown: '# Heading\n\nText with **emphasis**.'
      });
      assert(!validation.isError, JSON.stringify(validation));
      const invalid = await call('validate_document', {
        title: 'Title',
        document: {
          schemaVersion: 1,
          blocks: [
            {
              id: 'invalid',
              type: 'unknown:unknown',
              schemaVersion: 1,
              data: {}
            }
          ]
        }
      });
      assert(invalid.isError);
      const ambiguous = await call('validate_document', {
        title: 'Title',
        markdown: 'Text',
        document: { schemaVersion: 1, blocks: [] }
      });
      assert(ambiguous.isError);
      const invalidMath = await call('create_draft', {
        title: 'Incomplete math',
        category: 'Math',
        summary: 'Saved for editing',
        slug: 'incomplete-math',
        document: {
          schemaVersion: 1,
          blocks: [
            {
              id: '018fabc0-0000-4000-8000-000000000009',
              type: 'publisle:math',
              schemaVersion: 1,
              data: { value: '\\frac{1}{', display: true }
            }
          ]
        }
      });
      assert(!invalidMath.isError, JSON.stringify(invalidMath));
      assert(JSON.stringify(invalidMath).includes('invalid-math'));
      const catalog = await call('get_block_catalog', {});
      assert(JSON.stringify(catalog).includes('voidreg:counter'));
      const created = await call('create_draft', {
        title: 'Title',
        category: 'Systems',
        summary: 'Summary',
        slug: 'client-draft',
        markdown: 'First draft.'
      });
      assert(!created.isError, JSON.stringify(created));
      const body = created.structuredContent as {
        article: { revision: number; compiled: { format: string } };
        admin_url: string;
      };
      assert.equal(body.article.revision, 1);
      assert.equal(body.article.compiled.format, 'publisle:publication');
      assert(body.admin_url.endsWith('/admin/?article=client-draft'));
      assert(
        !(
          await call('update_draft', {
            slug: 'client-draft',
            expected_revision: 1,
            markdown: 'Updated prose.'
          })
        ).isError
      );
      const stale = await call('update_draft', {
        slug: 'client-draft',
        expected_revision: 1,
        markdown: 'Stale prose.'
      });
      assert(stale.isError);
      const read = await call('get_article', { slug: 'client-draft' });
      assert(JSON.stringify(read).includes('Updated prose.'));
      assert(!(await call('list_articles', { status: 'draft', page: 1 })).isError);
      const counter = {
        id: '018fabc0-0000-4000-8000-000000000001',
        type: 'voidreg:counter',
        schemaVersion: 1,
        data: defaultData('voidreg:counter', extensions)
      };
      const rich = await call('create_draft', {
        title: 'Counter',
        category: 'Systems',
        summary: 'Interactive example',
        slug: 'rich-draft',
        document: { schemaVersion: 1, blocks: [counter] }
      });
      assert(!rich.isError, JSON.stringify(rich));
      assert(
        (
          await call('update_draft', {
            slug: 'rich-draft',
            expected_revision: 1,
            markdown: 'Would discard counter.'
          })
        ).isError
      );
      assert(
        !(
          await call('update_draft', {
            slug: 'rich-draft',
            expected_revision: 1,
            title: 'Renamed counter'
          })
        ).isError
      );
      assert.deepEqual((articles.get('rich-draft')!.document as { blocks: unknown[] }).blocks, [
        counter
      ]);
      articles.get('client-draft')!.status = 'published';
      assert(
        (
          await call('update_draft', {
            slug: 'client-draft',
            expected_revision: 2,
            markdown: 'Live edit.'
          })
        ).isError
      );
      live = false;
      await assert.rejects(() => client.listTools());
    } finally {
      await client.close();
      await close(http);
      await close(backend);
    }
  });
}

test('filing a post resolves project and topic and keeps its other meta', async () => {
  const calls: string[] = [];
  const bridge = async (path: string) => {
    calls.push(path);
    if (path === '/projects/alpha') return { id: 'p1' };
    if (path === '/topics/p1/firmware') return { id: 't1' };
    throw new Error('unexpected ' + path);
  };
  const current = {
    project_ids: ['p0'],
    hero_image: '/media/a.png',
    title: 'ignored'
  };
  assert.equal(await filingMeta(bridge, current, {}), undefined, 'nothing requested');
  assert.deepEqual(await filingMeta(bridge, current, { project: 'alpha', topic: 'firmware' }), {
    project_ids: ['p0', 'p1'],
    hero_image: '/media/a.png',
    topic_id: 't1'
  });
  assert.deepEqual(await filingMeta(bridge, current, { topic: null }), {
    project_ids: ['p0'],
    hero_image: '/media/a.png',
    topic_id: null
  });
  await assert.rejects(() => filingMeta(bridge, current, { topic: 'firmware' }), /project slug/);
});

test('shared authoring escapes raw HTML and refuses lossy custom Markdown export', () => {
  const compiled = compileDocument(
    {
      schemaVersion: 1,
      blocks: [
        {
          id: '018fabc0-0000-4000-8000-000000000001',
          type: 'publisle:raw-html',
          schemaVersion: 1,
          data: { value: '<script>alert(1)</script>' }
        }
      ]
    },
    'HTML'
  );
  assert(compiled.artifact, JSON.stringify(compiled.diagnostics));
  assert(!compiled.artifact.html.includes('<script>'));
  assert(compiled.artifact.html.includes('&lt;script&gt;'));
  const counter = {
    schemaVersion: 1 as const,
    blocks: [
      {
        id: '018fabc0-0000-4000-8000-000000000001',
        type: 'voidreg:counter',
        schemaVersion: 1,
        data: defaultData('voidreg:counter', extensions)
      }
    ]
  };
  const document = compileDocument(counter, 'Counter').document!;
  const exported = safeMarkdown(document);
  assert(!exported.markdown || exported.diagnostics.some((d) => d.level === 'error'));
});

test('archival Markdown preserves custom payloads, IDs, and document metadata', () => {
  const prepared = compileDocument(
    {
      schemaVersion: 1,
      metadata: { language: 'en' },
      extensions: { review: { version: 1 } },
      blocks: [
        {
          id: '018fabc0-0000-4000-8000-000000000001',
          type: 'voidreg:counter',
          schemaVersion: 1,
          data: defaultData('voidreg:counter', extensions)
        }
      ]
    },
    'Complete archival source'
  );
  assert(prepared.document, JSON.stringify(prepared.diagnostics));
  const exported = archivalMarkdown(prepared.document);
  assert(exported.markdown, JSON.stringify(exported.diagnostics));
  const imported = importMarkdown(exported.markdown);
  assert.deepEqual(imported.document, prepared.document);
});

for (const mode of ['legacy', 'auto'] as const) {
  test(`anonymous clients browse published content read only (${mode})`, async () => {
    const seen: string[] = [];
    const backend = createServer((req, res) => {
      seen.push(String(req.headers.authorization ?? '') + ' ' + req.url);
      const url = new URL(req.url!, 'http://api');
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/api/v1/blogs')
        return void res.end(
          JSON.stringify({
            items: [
              {
                slug: 'first-post',
                title: 'First post',
                summary: 'About rendering',
                tags: ['graphics'],
                published_at: '2026-01-01T00:00:00Z'
              }
            ],
            page: 1,
            per_page: 20,
            total: 1
          })
        );
      if (url.pathname === '/api/v1/blogs/first-post')
        return void res.end(
          JSON.stringify({ slug: 'first-post', title: 'First post', summary: 's' })
        );
      if (url.pathname === '/api/v1/projects')
        return void res.end(JSON.stringify({ items: [], page: 1, per_page: 20, total: 0 }));
      res.writeHead(404).end('{}');
    });
    const web = createServer((req, res) => {
      if (req.url === '/blog/first-post.md') {
        res.setHeader('Content-Type', 'text/markdown');
        return void res.end('---\ntitle: "First post"\n---\n\n# First post\n\nBody text.');
      }
      res.writeHead(404).end('missing');
    });
    const api = await listen(backend);
    const webUrl = await listen(web);
    const http = createHttpServer(api, 'http://127.0.0.1', webUrl);
    const origin = await listen(http);
    const client = new Client(
      { name: 'anonymous-client', version: '1' },
      { versionNegotiation: { mode } }
    );
    try {
      assert.equal((await fetch(origin + '/mcp')).status, 405);
      assert.equal(
        (
          await fetch(origin + '/mcp', {
            method: 'POST',
            headers: { Origin: 'https://untrusted.example' },
            body: '{}'
          })
        ).status,
        403
      );
      await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp')));
      const tools = (await client.listTools()).tools.map((t) => t.name).sort();
      assert.deepEqual(tools, [
        'get_article',
        'get_project',
        'list_articles',
        'list_projects',
        'list_topics',
        'search_content'
      ]);
      for (const t of (await client.listTools()).tools)
        assert.equal(t.annotations?.readOnlyHint, true, t.name);
      const found = await client.callTool({
        name: 'search_content',
        arguments: { query: 'render' }
      });
      assert(!found.isError, JSON.stringify(found));
      const hits = found.structuredContent as {
        articles: { slug: string; markdown_url: string }[];
      };
      assert.equal(hits.articles[0].slug, 'first-post');
      assert.equal(hits.articles[0].markdown_url, 'http://127.0.0.1/blog/first-post.md');
      const read = await client.callTool({
        name: 'get_article',
        arguments: { slug: 'first-post' }
      });
      assert.match(String((read.structuredContent as { markdown: string }).markdown), /Body text/);
      const missing = await client.callTool({ name: 'get_article', arguments: { slug: 'nope' } });
      assert.equal(missing.isError, true);
      const resources = await client.listResources();
      assert(resources.resources.some((r) => r.uri === 'voidreg://blog/first-post'));
      const body = await client.readResource({ uri: 'voidreg://blog/first-post' });
      assert.match(String((body.contents[0] as { text: string }).text), /Body text/);
      // Authoring needs a token, and nothing anonymous ever reaches the private bridge.
      await assert.rejects(
        client.callTool({
          name: 'create_draft',
          arguments: { title: 'x', category: 'x', summary: 'x', markdown: 'x' }
        }),
        /not found/
      );
      assert(
        seen.every((entry) => entry.startsWith(' ') && !entry.includes('/api/v1/mcp')),
        seen.join('\n')
      );
    } finally {
      await client.close().catch(() => undefined);
      await close(http);
      await close(web);
      await close(backend);
    }
  });
}

test('the projects permission adds project draft tools and nothing more', async () => {
  const token = 'vr_mcp_' + 'b'.repeat(64);
  let scopes: string[] = [];
  const projects = new Map<string, Record<string, unknown>>([
    ['alpha', { id: 'id-alpha', slug: 'alpha', status: 'draft', revision: 1, title: 'Alpha' }]
  ]);
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const backend = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer ' + token) {
      res.writeHead(401).end('{}');
      return;
    }
    const url = new URL(req.url!, 'http://api');
    if (url.pathname.endsWith('/session')) {
      res.end(JSON.stringify({ authenticated: true, scopes }));
      return;
    }
    const slug = url.pathname.split('/')[5];
    if (req.method === 'GET') {
      const project = slug ? projects.get(slug) : undefined;
      if (!slug) res.end(JSON.stringify({ items: [...projects.values()], total: projects.size }));
      else res.writeHead(project ? 200 : 404).end(JSON.stringify(project ?? {}));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    writes.push({ method: req.method!, path: url.pathname, body });
    const project = {
      ...projects.get(slug ?? ''),
      ...body,
      id: 'id-' + (slug ?? body.slug),
      slug: slug ?? body.slug,
      status: 'draft',
      revision: 2
    };
    projects.set(project.slug, project);
    res.writeHead(slug ? 200 : 201).end(JSON.stringify(project));
  });
  const api = await listen(backend);
  const http = createHttpServer(api, 'http://127.0.0.1');
  const origin = await listen(http);
  const connect = async () => {
    const client = new Client({ name: 'test-client', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
        requestInit: { headers: { Authorization: 'Bearer ' + token } }
      })
    );
    return client;
  };
  const projectTools = ['create_project', 'get_project', 'list_projects', 'update_project'];
  try {
    const plain = await connect();
    const names = (await plain.listTools()).tools.map((t) => t.name);
    for (const name of projectTools) assert(!names.includes(name), name);
    await plain.close();

    scopes = ['projects'];
    const client = await connect();
    const listed = (await client.listTools()).tools.map((t) => t.name);
    for (const name of projectTools) assert(listed.includes(name), name);
    assert(!listed.some((name) => /publish|delete/.test(name)));

    const created = await client.callTool({
      name: 'create_project',
      arguments: {
        title: 'Beta',
        category: 'Systems',
        summary: 'A project',
        slug: 'beta',
        tags: ['rust'],
        related: ['alpha'],
        repo_url: 'https://github.com/example/beta',
        markdown: '## What it is\n\nA draft.\n'
      }
    });
    assert(!created.isError, JSON.stringify(created));
    const post = writes.at(-1)!;
    assert.equal(post.path, '/api/v1/mcp/projects');
    assert.deepEqual(post.body.related_project_ids, ['id-alpha']);
    assert.equal(post.body.slug, 'beta');
    assert.equal('compiled' in post.body, false);
    assert.equal(
      (created.structuredContent as { admin_url: string }).admin_url,
      'http://127.0.0.1/admin/?project=beta'
    );

    const updated = await client.callTool({
      name: 'update_project',
      arguments: { slug: 'beta', expected_revision: 2, summary: 'Better summary', featured: true }
    });
    assert(!updated.isError, JSON.stringify(updated));
    const put = writes.at(-1)!;
    assert.equal(put.path, '/api/v1/mcp/projects/beta');
    assert.equal('slug' in put.body, false);
    assert.equal(put.body.featured, true);

    const stale = await client.callTool({
      name: 'update_project',
      arguments: { slug: 'beta', expected_revision: 1, title: 'Stale' }
    });
    assert.equal(stale.isError, true);
    const extra = await client.callTool({
      name: 'create_project',
      arguments: { title: 'X', category: 'Y', summary: 'Z', markdown: 'Hi', compiled: {} }
    });
    assert.equal(extra.isError, true);
    await client.close();
  } finally {
    await close(http);
    await close(backend);
  }
});
