// Seeds a large catalogue through the real admin API so the map, lists and tag pickers can be
// checked at scale. Slugs are stable (`scale-project-0001`, `scale-post-00001`), existing entries
// are skipped, so reruns resume where a previous run stopped.
//
//   SEED_ORIGIN=http://127.0.0.1:5174 ADMIN_PASSWORD=... pnpm --filter @voidreg/authoring seed:scale
//   SEED_PROJECTS=1000 SEED_POSTS=5000 SEED_CATEGORIES=12 SEED_CONCURRENCY=8 (defaults shown)
//   SEED_BIG_PROJECTS=10 SEED_TOPICS=8: the first projects are "big" and get topics, and about a
//   quarter of all posts are filed under them, so topic sections and filters can be checked.
//   SEED_CLEAN=1 removes everything this script created (posts, topics, then projects)
import { ApiFailure, call, signIn, PASSWORD, type Json } from './admin-client';

const PROJECTS = Number(process.env.SEED_PROJECTS ?? 1000);
const POSTS = Number(process.env.SEED_POSTS ?? 5000);
const CATEGORIES = Number(process.env.SEED_CATEGORIES ?? 12);
const CONCURRENCY = Number(process.env.SEED_CONCURRENCY ?? 8);
const BIG = Math.min(Number(process.env.SEED_BIG_PROJECTS ?? 10), PROJECTS);
const TOPICS = Number(process.env.SEED_TOPICS ?? 8);
const CLEAN = process.env.SEED_CLEAN === '1';
const pad = (n: number, width: number) => String(n).padStart(width, '0');
const projectSlug = (i: number) => `scale-project-${pad(i, 4)}`;
const postSlug = (i: number) => `scale-post-${pad(i, 5)}`;
const topicSlug = (t: number) => `scale-topic-${pad(t, 2)}`;
const TAGS = ['scale', 'rust', 'svelte', 'dsp', 'graphics', 'embedded', 'web', 'tooling'];

const documentOf = (title: string, seed: number) => ({
  schemaVersion: 1,
  metadata: { title, language: 'en' },
  blocks: [
    {
      id: `018f5e01-0000-4000-8000-${seed.toString(16).padStart(12, '0')}`,
      type: 'publisle:paragraph',
      schemaVersion: 1,
      data: {
        content: [{ type: 'text', value: `${title} is generated test content.` }]
      }
    }
  ]
});

type Stored = { id?: string; revision?: number; status?: string };

async function pool<T>(items: T[], work: (item: T, index: number) => Promise<void>) {
  let next = 0;
  let done = 0;
  const started = Date.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const index = next++;
        await work(items[index], index);
        if (++done % 100 === 0)
          console.log(`  ${done}/${items.length} (${Math.round((Date.now() - started) / 1000)}s)`);
      }
    })
  );
}

async function publish(kind: 'projects' | 'articles', slug: string, stored: Stored) {
  const started = await call<{ id: string }>('POST', `/${kind}/${slug}/compile`, {
    expected_revision: stored.revision
  });
  for (let i = 0; i < 240; i++) {
    const job = await call<{ state: string }>('GET', `/compilations/${started.id}`);
    if (job.state === 'ready') break;
    if (job.state === 'failed') throw new Error(`compile ${slug} failed`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await call('POST', `/${kind}/${slug}/publish`, {
    expected_revision: stored.revision,
    compilation_id: started.id
  });
}

async function find(kind: 'projects' | 'articles', slug: string): Promise<Stored | undefined> {
  try {
    return await call<Stored>('GET', `/${kind}/${slug}`);
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 404) return undefined;
    throw error;
  }
}

async function ensure(kind: 'projects' | 'articles', slug: string, fields: Json) {
  let stored = await find(kind, slug);
  if (!stored) stored = await call<Stored>('POST', `/${kind}`, { ...fields, slug });
  if (stored.status !== 'published') await publish(kind, slug, stored);
  return stored;
}

async function ensureTopic(projectId: string, t: number): Promise<string> {
  const slug = topicSlug(t);
  try {
    return (await call<Stored>('GET', `/topics/${projectId}/${slug}`)).id ?? '';
  } catch (error) {
    if (!(error instanceof ApiFailure && error.status === 404)) throw error;
  }
  const created = await call<Stored>('POST', '/topics', {
    project_id: projectId,
    slug,
    title: `Scale topic ${pad(t, 2)}`,
    summary: `Generated topic ${t} for scale testing.`,
    sort_order: (t + 1) * 10
  });
  return created.id ?? '';
}

async function clean() {
  for (const [kind, count, slugOf] of [
    ['articles', POSTS, postSlug],
    ['topics', 0, topicSlug],
    ['projects', PROJECTS, projectSlug]
  ] as const) {
    if (kind === 'topics') {
      console.log('removing topics');
      for (let i = 0; i < BIG; i++) {
        const project = await find('projects', projectSlug(i));
        if (!project?.id) continue;
        for (let t = 0; t < TOPICS; t++) {
          try {
            const topic = await call<Stored>('GET', `/topics/${project.id}/${topicSlug(t)}`);
            await call('DELETE', `/topics/${project.id}/${topicSlug(t)}`, {
              expected_revision: topic.revision
            });
          } catch (error) {
            if (!(error instanceof ApiFailure && error.status === 404)) throw error;
          }
        }
      }
      continue;
    }
    console.log(`removing ${kind}`);
    await pool(
      Array.from({ length: count }, (_, i) => i),
      async (i) => {
        const stored = await find(kind, slugOf(i));
        if (stored)
          await call('DELETE', `/${kind}/${slugOf(i)}`, {
            expected_revision: stored.revision
          });
      }
    );
  }
}

async function main() {
  if (!PASSWORD) throw new Error('Set ADMIN_PASSWORD');
  await signIn();
  if (CLEAN) return clean();
  console.log(`seeding ${PROJECTS} projects and ${POSTS} posts in ${CATEGORIES} categories`);
  const ids: string[] = [];
  await pool(
    Array.from({ length: PROJECTS }, (_, i) => i),
    async (i) => {
      const title = `Scale project ${pad(i, 4)}`;
      const stored = await ensure('projects', projectSlug(i), {
        title,
        category: `Category ${pad(i % CATEGORIES, 2)}`,
        summary: `Generated project ${i} for scale testing.`,
        tags: [TAGS[0], TAGS[1 + (i % (TAGS.length - 1))], `scale-tag-${i % 60}`],
        featured: false,
        sort_order: i,
        related_project_ids: [],
        document: documentOf(title, i + 1)
      });
      ids[i] = stored.id ?? '';
    }
  );
  console.log('projects ready; linking related projects');
  // A ring of related projects, set after creation because relations need existing ids.
  await pool(
    Array.from({ length: PROJECTS }, (_, i) => i),
    async (i) => {
      const slug = projectSlug(i);
      const stored = await find('projects', slug);
      const related = [ids[(i + 1) % PROJECTS]].filter((id) => id && id !== ids[i]);
      if (!stored || !related.length) return;
      const current = (await call<Json>('GET', `/projects/${slug}`)).related_project_ids;
      if (Array.isArray(current) && current.length) return;
      await call('PUT', `/projects/${slug}`, {
        related_project_ids: related,
        expected_revision: stored.revision
      });
      const updated = await find('projects', slug);
      if (updated) await publish('projects', slug, updated);
    }
  );
  // Topics for the big projects, so a few projects behave like large multi-part efforts.
  const topicIds: string[][] = [];
  await pool(
    Array.from({ length: BIG }, (_, i) => i),
    async (i) => {
      topicIds[i] = [];
      for (let t = 0; t < TOPICS; t++) topicIds[i][t] = await ensureTopic(ids[i], t);
    }
  );
  console.log('seeding posts');
  await pool(
    Array.from({ length: POSTS }, (_, i) => i),
    async (i) => {
      const title = `Scale post ${pad(i, 5)}`;
      // About one post in twenty follows no project, the rest spread evenly.
      let linked = i % 20 !== 0 && ids.length ? [ids[i % PROJECTS]] : [];
      // A quarter of the posts go to the big projects; one in ten of those has no topic.
      let topic: string | null = null;
      if (BIG && TOPICS && i % 4 === 1) {
        const big = i % BIG;
        linked = [ids[big]];
        const slot = Math.floor(i / BIG) % (TOPICS + Math.ceil(TOPICS / 9));
        topic = topicIds[big]?.[slot] ?? null;
      }
      await ensure('articles', postSlug(i), {
        title,
        category: `Category ${pad(i % CATEGORIES, 2)}`,
        summary: `Generated post ${i} for scale testing.`,
        tags: [TAGS[0], TAGS[1 + (i % (TAGS.length - 1))]],
        meta: { project_ids: linked, topic_id: topic },
        document: documentOf(title, 100000 + i)
      });
    }
  );
  console.log('done');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
