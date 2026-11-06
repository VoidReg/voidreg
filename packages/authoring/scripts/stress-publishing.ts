// Stress test for the publishing lifecycle, revision history and document limits.
// Runs against a real API and compiler (not mocks). Every run uses fresh slugs and
// deletes what it created.
//
//   SEED_ORIGIN=http://127.0.0.1:5174 ADMIN_PASSWORD=... pnpm --filter @voidreg/authoring stress:publishing
import { ApiFailure, call, publicGet, signIn, PASSWORD, type Json } from './admin-client';

const run = Date.now().toString(36);
const slug = (name: string) => `stress-${run}-${name}`;
const created: { kind: 'articles' | 'projects'; slug: string }[] = [];

type Row = {
  slug: string;
  title: string;
  revision: number;
  status: string;
  id?: string;
  has_unpublished_changes?: boolean;
  pending_slug?: string | null;
  project_ids?: string[];
  document?: { blocks: unknown[] };
};

let passed = 0;
const failures: string[] = [];
function check(condition: unknown, message: string) {
  if (condition) passed++;
  else {
    failures.push(message);
    console.log(`  FAIL ${message}`);
  }
}
async function expectStatus(promise: Promise<unknown>, status: number | number[], message: string) {
  const wanted = Array.isArray(status) ? status : [status];
  try {
    await promise;
    check(false, `${message} (expected ${wanted.join('/')}, got success)`);
  } catch (error) {
    if (error instanceof ApiFailure)
      check(
        wanted.includes(error.status),
        `${message} (expected ${wanted.join('/')}, got ${error.status}: ${error.detail})`
      );
    else check(false, `${message}: ${String(error)}`);
  }
}

const text = (value: string) => ({ type: 'text', value });
const block = (n: number, value: string, type = 'publisle:paragraph', data?: Json) => ({
  id: `018f5e00-1111-4000-8000-${n.toString(16).padStart(12, '0')}`,
  type,
  schemaVersion: 1,
  data: data ?? { content: [text(value)] }
});
const doc = (title: string, ...paragraphs: string[]) => ({
  schemaVersion: 1,
  metadata: { title, language: 'en' },
  blocks: paragraphs.map((value, index) => block(index + 1, value))
});

async function makeArticle(name: string, title = 'Stress article'): Promise<Row> {
  const row = await call<Row>('POST', '/articles', {
    slug: slug(name),
    title,
    category: 'Stress',
    summary: 'Created by the stress suite.',
    document: doc(title, 'First paragraph.'),
    document_version: 1
  });
  created.push({ kind: 'articles', slug: row.slug });
  return row;
}
const save = (row: Pick<Row, 'slug' | 'revision'>, fields: Json) =>
  call<Row>('PUT', `/articles/${row.slug}`, {
    expected_revision: row.revision,
    ...fields
  });
async function compile(kind: 'articles' | 'projects', name: string, revision: number) {
  const started = await call<{ id: string }>('POST', `/${kind}/${name}/compile`, {
    expected_revision: revision
  });
  for (let i = 0; i < 240; i++) {
    const job = await call<{ state: string; diagnostics: { level: string }[] }>(
      'GET',
      `/compilations/${started.id}`
    );
    if (job.state === 'ready' || job.state === 'failed') return { id: started.id, ...job };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('compile timed out');
}
async function publish(row: Pick<Row, 'slug' | 'revision'>) {
  const job = await compile('articles', row.slug, row.revision);
  if (job.state !== 'ready') throw new Error(`compile failed for ${row.slug}`);
  return call<Row>('POST', `/articles/${row.slug}/publish`, {
    expected_revision: row.revision,
    compilation_id: job.id
  });
}
const events = async (name: string) =>
  (
    await call<{ items: { event: string }[] }>('GET', `/articles/${name}/revisions?limit=100`)
  ).items.map((i) => i.event);

async function scenario(name: string, body: () => Promise<void>) {
  console.log(`- ${name}`);
  try {
    await body();
  } catch (error) {
    check(false, `${name}: unexpected ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  if (!PASSWORD) throw new Error('Set ADMIN_PASSWORD');
  await signIn();

  await scenario('autosave burst coalesces into few history rows', async () => {
    let row = await makeArticle('burst');
    for (let i = 0; i < 25; i++)
      row = await save(row, {
        title: `Burst ${i}`,
        document: doc(`Burst ${i}`, `Edit ${i}`),
        document_version: 1
      });
    const list = await events(row.slug);
    check(list.length <= 3, `25 quick saves left ${list.length} rows (${list.join(',')})`);
    check(row.revision === 26, `revision counter advanced to ${row.revision}`);
  });

  await scenario('stale and concurrent saves are refused', async () => {
    const row = await makeArticle('conflict');
    const first = await save(row, { title: 'Winner' });
    await expectStatus(save(row, { title: 'Stale' }), 409, 'stale save is refused');
    const results = await Promise.allSettled([
      save(first, { title: 'Racer A' }),
      save(first, { title: 'Racer B' }),
      save(first, { title: 'Racer C' })
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    check(ok === 1, `exactly one of three parallel saves wins (got ${ok})`);
    const current = await call<Row>('GET', `/articles/${row.slug}`);
    check(/Racer/.test(current.title), `winner persisted (${current.title})`);
  });

  await scenario('edit after publish keeps the public copy; unpublish and republish', async () => {
    let row = await makeArticle('lifecycle', 'Live title');
    row = await publish(row);
    check(row.status === 'published', 'published');
    let pub = await publicGet(`/blogs/${row.slug}`);
    check(pub.status === 200 && pub.body.title === 'Live title', 'public copy served');
    row = await save(row, {
      title: 'Draft title',
      document: doc('Draft title', 'Changed text.'),
      document_version: 1
    });
    pub = await publicGet(`/blogs/${row.slug}`);
    check(
      pub.body?.title === 'Live title',
      `public copy untouched by a draft edit (${pub.body?.title})`
    );
    const admin = await call<Row>('GET', `/articles/${row.slug}`);
    check(admin.has_unpublished_changes === true, 'admin reports unpublished changes');
    const unpublished = await call<Row>('POST', `/articles/${row.slug}/unpublish`, {
      expected_revision: admin.revision
    });
    pub = await publicGet(`/blogs/${row.slug}`);
    check(pub.status === 404, `unpublished article is not public (${pub.status})`);
    const again = await publish({
      slug: row.slug,
      revision: unpublished.revision
    });
    pub = await publicGet(`/blogs/${row.slug}`);
    check(
      again.status === 'published' && pub.body?.title === 'Draft title',
      'republish serves the new copy'
    );
  });

  await scenario('restore an old revision while published, then publish', async () => {
    let row = await makeArticle('restore', 'Version one');
    row = await publish(row);
    const publishRevision = row.revision;
    row = await save(row, {
      title: 'Version two',
      document: doc('Version two', 'Second.'),
      document_version: 1
    });
    const restored = await call<Row>(
      'POST',
      `/articles/${row.slug}/revisions/${publishRevision}/restore`,
      { expected_revision: row.revision }
    );
    check(restored.title === 'Version one', `working copy restored (${restored.title})`);
    let pub = await publicGet(`/blogs/${row.slug}`);
    check(pub.body?.title === 'Version one', 'public copy unchanged by restore');
    row = await save(restored, {
      title: 'Version three',
      document: doc('Version three', 'Third.'),
      document_version: 1
    });
    row = await publish(row);
    pub = await publicGet(`/blogs/${row.slug}`);
    check(pub.body?.title === 'Version three', 'publish after restore serves the latest');
    const list = await events(row.slug);
    check(
      list.includes('revert') && list.filter((e) => e === 'publish').length === 2,
      `history records revert and two publishes (${list.join(',')})`
    );
    await expectStatus(
      call('POST', `/articles/${row.slug}/revisions/9999/restore`, {
        expected_revision: row.revision
      }),
      404,
      'restoring a missing revision is a 404'
    );
  });

  await scenario('archive hides content and blocks edits until restored', async () => {
    let row = await makeArticle('archive');
    row = await publish(row);
    const archived = await call<Row>('POST', `/articles/${row.slug}/archive`, {
      expected_revision: row.revision
    });
    const pub = await publicGet(`/blogs/${row.slug}`);
    check(pub.status === 404, `archived article is not public (${pub.status})`);
    await expectStatus(
      save(archived, { title: 'Edit while archived' }),
      [409, 422],
      'archived content is read only'
    );
    const back = await call<Row>('POST', `/articles/${row.slug}/restore`, {
      expected_revision: archived.revision
    });
    check(back.revision > archived.revision, 'restore-archive advances the revision');
  });

  await scenario('slug rename keeps the public slug until publish', async () => {
    let row = await makeArticle('rename-old');
    row = await publish(row);
    const next = slug('rename-new');
    created.push({ kind: 'articles', slug: next });
    row = await save(row, { slug: next });
    const admin = await call<Row>('GET', `/articles/${row.slug}`);
    check(admin.pending_slug === next, `rename is pending (${admin.pending_slug})`);
    check(
      (await publicGet(`/blogs/${slug('rename-old')}`)).status === 200,
      'old slug still public before publish'
    );
    const published = await publish({
      slug: admin.slug,
      revision: admin.revision
    });
    check(
      (await publicGet(`/blogs/${next}`)).status === 200,
      `new slug public after publish (${published.slug})`
    );
    const history = await events(published.slug);
    check(
      history.includes('publish') && history.includes('create'),
      'history follows the entry across the rename'
    );
  });

  await scenario('restoring after a linked project was deleted', async () => {
    const project = await call<Row>('POST', '/projects', {
      slug: slug('linked-project'),
      title: 'Linked project',
      category: 'Stress',
      summary: 'x'
    });
    created.push({ kind: 'projects', slug: project.slug });
    const projectId = project.id ?? '';
    let row = await makeArticle('linked');
    row = await save(row, { meta: { project_ids: [projectId] } });
    // Autosaves coalesce, so only a milestone (publish) reliably keeps the linked state.
    row = await publish(row);
    const linkedRevision = row.revision;
    row = await save(row, { title: 'After link' });
    await expectStatus(
      call('DELETE', `/projects/${project.slug}`, {
        expected_revision: project.revision
      }),
      409,
      'a project with linked articles cannot be deleted'
    );
    row = await save(row, { meta: { project_ids: [] } });
    row = await publish(row); // the public copy must stop referencing the project too
    await call('DELETE', `/projects/${project.slug}`, {
      expected_revision: project.revision
    });
    const outcome = await call<Row>(
      'POST',
      `/articles/${row.slug}/revisions/${linkedRevision}/restore`,
      { expected_revision: row.revision }
    ).then(
      (r) => ({ ok: true as const, row: r }),
      (e: unknown) => ({ ok: false as const, error: e })
    );
    if (outcome.ok) {
      const ids = outcome.row.project_ids ?? [];
      check(!ids.includes(projectId), 'restore drops a project that no longer exists');
    } else {
      check(
        outcome.error instanceof ApiFailure && [409, 422].includes(outcome.error.status),
        `restore refuses cleanly (${String(outcome.error)})`
      );
    }
    await call('GET', `/articles/${row.slug}`);
    check(true, 'article still loads through the admin getter');
  });

  await scenario('document limits and schema version are enforced', async () => {
    const row = await makeArticle('limits');
    await expectStatus(
      save(row, {
        document: { ...doc('x', 'y'), schemaVersion: 99 },
        document_version: 99
      }),
      422,
      'unsupported schemaVersion'
    );
    await expectStatus(
      save(row, { document: doc('x', 'y'), document_version: 2 }),
      [409, 422],
      'document_version mismatch'
    );
    const many = {
      ...doc('x', 'y'),
      blocks: Array.from({ length: 10001 }, (_, i) => block(i + 1, 'p'))
    };
    await expectStatus(save(row, { document: many, document_version: 1 }), 422, '10,001 blocks');
    const big = doc('x', 'y'.repeat(2 * 1024 * 1024 + 10));
    await expectStatus(
      save(row, { document: big, document_version: 1 }),
      [413, 422],
      'document over 2 MiB'
    );
    const maxBlocks = {
      ...doc('x', 'y'),
      blocks: Array.from({ length: 10000 }, (_, i) => block(i + 1, 'p'))
    };
    const accepted = await save(row, {
      document: maxBlocks,
      document_version: 1
    }).then(
      () => true,
      () => false
    );
    check(accepted, '10,000 blocks is accepted');
    await expectStatus(
      save(
        {
          slug: row.slug,
          revision: (await call<Row>('GET', `/articles/${row.slug}`)).revision
        },
        { compiled: { format: 'x', html: 'a'.repeat(4 * 1024 * 1024 + 10) } }
      ),
      [413, 422],
      'compiled output over 4 MiB'
    );
  });

  await scenario('compilation is invalidated by an edit made after it started', async () => {
    let row = await makeArticle('midcompile');
    const job = await compile('articles', row.slug, row.revision);
    check(job.state === 'ready', 'baseline compile is ready');
    row = await save(row, {
      title: 'Edited after compile',
      document: doc('Edited after compile', 'New body.'),
      document_version: 1
    });
    await expectStatus(
      call('POST', `/articles/${row.slug}/publish`, {
        expected_revision: row.revision,
        compilation_id: job.id
      }),
      [409, 422],
      'publishing with a compilation of an older revision'
    );
    await expectStatus(
      call('POST', `/articles/${row.slug}/publish`, {
        expected_revision: row.revision,
        compilation_id: '00000000-0000-4000-8000-000000000000'
      }),
      [404, 409, 422],
      'publishing with an unknown compilation id'
    );
    await expectStatus(
      call('POST', `/articles/${row.slug}/publish`, {
        expected_revision: row.revision
      }),
      [409, 422],
      'publishing without a compilation'
    );
  });

  await scenario('invalid math blocks publishing and drafts stay out of public lists', async () => {
    const row = await makeArticle('badmath');
    const bad = await save(row, {
      document: {
        ...doc('x', 'y'),
        blocks: [
          block(1, '', 'publisle:math', {
            display: true,
            value: '\\frac{1}{'
          })
        ]
      },
      document_version: 1
    });
    const job = await compile('articles', bad.slug, bad.revision);
    check(
      job.state === 'failed' && job.diagnostics.some((d) => d.level === 'error'),
      `invalid math fails to compile (${job.state})`
    );
    await expectStatus(
      call('POST', `/articles/${bad.slug}/publish`, {
        expected_revision: bad.revision,
        compilation_id: job.id
      }),
      [409, 422],
      'publish refused for failed compile'
    );
    check((await publicGet(`/blogs/${bad.slug}`)).status === 404, 'draft is not public');
    const list = await publicGet('/blogs?per_page=100');
    const slugs = (list.body?.items ?? list.body ?? []).map((i: { slug: string }) => i.slug);
    check(!slugs.includes(bad.slug), 'draft absent from the public listing');
    const graph = JSON.stringify((await publicGet('/graph')).body);
    check(!graph.includes(bad.slug), 'draft absent from the public graph');
  });

  await scenario('admin list sorts and paginates', async () => {
    const titles = ['Zulu sort', 'Alpha sort', 'Mike sort'];
    for (const [i, title] of titles.entries()) await makeArticle(`sort-${i}`, title);
    const asc = await call<{ items: Row[] }>(
      'GET',
      `/articles?sort=title&dir=asc&per_page=100&q=sort`
    );
    const names = asc.items.map((i) => i.title).filter((t) => titles.includes(t));
    check(
      JSON.stringify(names) === JSON.stringify([...titles].sort()),
      `ascending by title (${names.join(', ')})`
    );
    const desc = await call<{ items: Row[] }>(
      'GET',
      `/articles?sort=title&dir=desc&per_page=100&q=sort`
    );
    const reversed = desc.items.map((i) => i.title).filter((t) => titles.includes(t));
    check(
      JSON.stringify(reversed) === JSON.stringify([...titles].sort().reverse()),
      `descending by title (${reversed.join(', ')})`
    );
    const odd = await call<{ items: Row[] }>('GET', `/articles?sort=drop_table&dir=sideways`).then(
      () => 200,
      (e: unknown) => (e instanceof ApiFailure ? e.status : 500)
    );
    check([200, 400, 422].includes(odd), `unknown sort input is handled (${odd})`);
    const two = await call<{ items: Row[] }>('GET', `/articles?per_page=2`);
    check(two.items.length <= 2, 'per_page is honoured');
  });

  await scenario('tags are normalized, bounded and searchable for posts and projects', async () => {
    const tag = (name: string) => `st-${run}-${name}`;
    const row = await makeArticle('tagged');
    const tagged = await save(row, {
      tags: [`  ${tag('Alpha')}  `, tag('alpha'), tag('beta'), 'x']
    });
    const stored = await call<Row & { tags?: string[] }>('GET', `/articles/${row.slug}`);
    check(
      JSON.stringify(stored.tags) === JSON.stringify([tag('Alpha'), tag('beta'), 'x']),
      `tags trimmed and de-duplicated case-insensitively (${JSON.stringify(stored.tags)})`
    );
    await expectStatus(
      save(tagged, { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }),
      [400, 422],
      'more than 20 tags is refused'
    );
    await expectStatus(save(tagged, { tags: ['x'.repeat(41)] }), [400, 422], 'long tag refused');
    await expectStatus(
      save(tagged, { tags: ['bad\u0001tag'] }),
      [400, 422],
      'control character refused'
    );
    const project = await call<Row>('POST', '/projects', {
      slug: slug('tag-project'),
      title: 'Tagged project',
      category: 'Stress',
      summary: 'Created by the stress suite.',
      tags: [tag('beta'), tag('gamma')],
      document: doc('Tagged project', 'Body.'),
      document_version: 1
    });
    created.push({ kind: 'projects', slug: project.slug });
    await expectStatus(
      call('PUT', `/projects/${project.slug}`, {
        expected_revision: project.revision,
        tags: [{ not: 'text' }]
      }),
      [400, 422],
      'project tags must be text'
    );
    const vocabulary = await call<{
      items: { name: string; count_projects: number; count_posts: number }[];
    }>('GET', `/tags?q=${encodeURIComponent(tag('beta'))}`);
    const beta = vocabulary.items.find((item) => item.name === tag('beta'));
    check(
      beta?.count_posts === 1 && beta?.count_projects === 1,
      `one shared vocabulary counts both kinds (${JSON.stringify(beta)})`
    );
    const published = await publish(tagged);
    check(published.status === 'published', 'tagged article publishes');
    const found = await publicGet(`/blogs?tag=${encodeURIComponent(tag('ALPHA'))}`);
    check(
      found.status === 200 && found.body.items.some((item: Row) => item.slug === row.slug),
      'public list filters by tag, case-insensitively'
    );
    const publicTags = await publicGet(`/tags?q=${encodeURIComponent(tag('alpha'))}`);
    check(
      publicTags.body.items.some((item: { name: string }) => item.name === tag('Alpha')),
      'public vocabulary lists tags of published posts'
    );
  });

  await scenario('graph modes stay bounded and per-project focus works', async () => {
    const row = await makeArticle('graph');
    const project = await call<Row>('POST', '/projects', {
      slug: slug('graph-project'),
      title: 'Graph project',
      category: 'Stress',
      summary: 'Created by the stress suite.',
      tags: ['st-graph'],
      document: doc('Graph project', 'Body.'),
      document_version: 1
    });
    created.push({ kind: 'projects', slug: project.slug });
    await save(row, { meta: { project_ids: [project.id] } });
    const summary = await call<{
      mode: string;
      nodes: { kind: string }[];
      totals: { projects: number };
    }>('GET', '/graph?summary=1');
    check(summary.mode === 'summary', 'summary mode is honoured');
    check(
      summary.nodes.every((n) => n.kind === 'project'),
      'summary carries projects only'
    );
    const one = await call<{
      mode: string;
      nodes: { slug: string; kind: string }[];
      posts_total: number;
    }>('GET', `/graph?project=${project.slug}`);
    check(one.mode === 'project' && one.posts_total === 1, 'project mode counts its posts');
    check(
      one.nodes.some((n) => n.kind === 'post' && n.slug === row.slug),
      'project mode lists the linked draft post'
    );
    await expectStatus(
      call('GET', '/graph?project=no-such-project'),
      404,
      'unknown project is 404'
    );
    const full = await call<{
      mode: string;
      nodes: unknown[];
      totals: { projects: number; posts: number };
    }>('GET', '/graph');
    const total = full.totals.projects + full.totals.posts;
    check(
      total > 300
        ? full.mode === 'summary' && full.nodes.length <= full.totals.projects
        : full.mode === 'full',
      `default graph mode follows the size guard (${total} nodes, mode ${full.mode})`
    );
    const started = Date.now();
    await call('GET', '/graph');
    check(Date.now() - started < 3000, 'graph responds within 3s at the current catalogue size');
  });

  await scenario('revision compare data is complete for large documents', async () => {
    let row = await makeArticle('compare');
    row = await save(row, {
      document: doc(
        'Compare',
        ...Array.from({ length: 400 }, (_, i) => `Paragraph ${i} with some words.`)
      ),
      document_version: 1
    });
    const list = await call<{ items: { revision: number }[] }>(
      'GET',
      `/articles/${row.slug}/revisions?limit=100`
    );
    const snapshot = await call<{
      snapshot: { document: { blocks: unknown[] } };
    }>('GET', `/articles/${row.slug}/revisions/${list.items[0].revision}`);
    check(snapshot.snapshot.document.blocks.length === 400, 'snapshot returns every block');
  });
}

async function cleanup() {
  for (const item of created.reverse()) {
    try {
      const row = await call<Row>('GET', `/${item.kind}/${item.slug}`);
      await call('DELETE', `/${item.kind}/${item.slug}`, {
        expected_revision: row.revision
      });
    } catch {
      /* already gone or renamed */
    }
  }
}

main()
  .catch((error) => {
    failures.push(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  })
  .finally(async () => {
    await cleanup().catch(() => undefined);
    console.log(`\n${passed} checks passed, ${failures.length} failed`);
    for (const failure of failures) console.log(` - ${failure}`);
    process.exit(failures.length ? 1 : 0);
  });
