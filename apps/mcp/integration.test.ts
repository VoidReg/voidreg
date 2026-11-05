import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from './http';
import { defaultData } from '@publisle/playground';
import { extensions } from '../src/lib/blocks';
import { compileDocument, safeMarkdown } from '../src/lib/authoring';

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
      const missing = await fetch(origin + '/mcp', { method: 'POST', body: '{}' });
      assert.equal(missing.status, 401);
      assert.equal(missing.headers.get('cache-control'), 'no-store');
      assert.equal(
        (
          await fetch(origin + '/mcp', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, Origin: 'https://untrusted.example' },
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
        'get_article',
        'get_block_catalog',
        'list_articles',
        'update_draft',
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
          blocks: [{ id: 'invalid', type: 'unknown:unknown', schemaVersion: 1, data: {} }]
        }
      });
      assert(invalid.isError);
      const ambiguous = await call('validate_document', {
        title: 'Title',
        markdown: 'Text',
        document: { schemaVersion: 1, blocks: [] }
      });
      assert(ambiguous.isError);
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
