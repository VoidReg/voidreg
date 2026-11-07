// How the llms.txt documents choose and order what they list. Nothing here touches the network
// or the framework, so it runs in plain tests.
//
// A flat "newest N" cut lets one busy project fill the whole file and hides everything else.
// Instead the site is treated as a map: every project is a region, posts live in their primary
// region, and the space in each document is shared out between regions by a fair-share rule.
// Whatever does not fit is reachable through a per-project document, so nothing is lost.
import { SITE, SITE_NAME, absolute, describe } from '../seo';

type PostRef = { slug: string; title: string; summary?: string };
export type MapPost = PostRef & {
  featured?: boolean;
  published_at?: string | null;
  updated_at?: string;
  content_hash?: string;
  category?: string;
  tags?: string[];
  projects?: { slug: string; title: string }[];
  topic?: { slug?: string; title?: string } | null;
  reading_time_minutes?: number | null;
};
export type MapProject = PostRef & {
  featured?: boolean;
  post_count?: number;
  category?: string;
};

/** Where posts without a project are filed. */
export const UNFILED = 'other';

const stamp = (post: MapPost) => post.published_at ?? post.updated_at ?? '';
const byPriority = (a: MapPost, b: MapPost) =>
  Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || stamp(b).localeCompare(stamp(a));

/**
 * Shares `budget` slots between groups of the given sizes. Every group gets a floor first so
 * small projects stay visible, then the rest is spread in proportion to the square root of the
 * group size, so a project with 100 times the posts gets about 10 times the room, not 100 times.
 * No group gets more than it has, and unused room moves to the groups that can still use it.
 */
export function allocate(sizes: number[], budget: number, floor = 2): number[] {
  const slots = sizes.map(() => 0);
  let left = Math.max(0, Math.floor(budget));
  // Smaller groups claim their floor first, so a tight budget never starves them for a big one.
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[a] - sizes[b] || a - b);
  for (const i of order) {
    const take = Math.min(sizes[i], floor, left);
    slots[i] = take;
    left -= take;
  }
  while (left > 0) {
    const open = sizes.map((_, i) => i).filter((i) => slots[i] < sizes[i]);
    if (!open.length) break;
    const weights = open.map((i) => Math.sqrt(sizes[i]));
    const total = weights.reduce((sum, w) => sum + w, 0);
    // Largest remainder: hand out whole slots by share, biggest fractional claims first.
    const shares = open.map((i, k) => {
      const exact = (left * weights[k]) / total;
      return { i, whole: Math.min(Math.floor(exact), sizes[i] - slots[i]), rest: exact % 1 };
    });
    let given = 0;
    for (const share of shares) {
      slots[share.i] += share.whole;
      given += share.whole;
    }
    left -= given;
    if (given === 0) {
      const next = shares.sort((a, b) => b.rest - a.rest || a.i - b.i)[0];
      slots[next.i] += 1;
      left -= 1;
    }
  }
  return slots;
}

export type Region = { slug: string; title: string; posts: MapPost[] };

/** Files each post under its first project, so a post is listed once however it is linked. */
export function regions(posts: MapPost[], projects: MapProject[]): Region[] {
  const known = new Map(projects.map((p) => [p.slug, p.title]));
  const found = new Map<string, Region>();
  for (const post of [...posts].sort(byPriority)) {
    const primary = post.projects?.[0];
    const slug = primary?.slug ?? UNFILED;
    let region = found.get(slug);
    if (!region) {
      region = {
        slug,
        title: primary ? (known.get(slug) ?? primary.title) : 'Other posts',
        posts: []
      };
      found.set(slug, region);
    }
    region.posts.push(post);
  }
  // Regions with a recent or featured post lead, so the top of the file is the freshest part.
  return [...found.values()].sort(
    (a, b) => byPriority(a.posts[0], b.posts[0]) || a.title.localeCompare(b.title)
  );
}

/**
 * One reading order for the whole site: featured posts first, then the newest post of every
 * region, then the second newest of every region, and so on. Cutting this list anywhere, for a
 * size budget, still leaves every region represented.
 */
export function interleave(groups: Region[]): MapPost[] {
  const featured = groups.flatMap((g) => g.posts.filter((p) => p.featured)).sort(byPriority);
  const seen = new Set(featured.map((p) => p.slug));
  const queues = groups.map((g) => g.posts.filter((p) => !seen.has(p.slug)));
  const out = [...featured];
  for (let depth = 0; queues.some((q) => depth < q.length); depth++)
    for (const queue of queues) if (depth < queue.length) out.push(queue[depth]);
  return out;
}

const line = (post: PostRef, url: string) =>
  '- [' + post.title + '](' + url + ')' + (post.summary ? ': ' + describe(post.summary) : '');
const postLine = (post: MapPost) => line(post, absolute('/blog/' + post.slug + '.md'));
const projectLine = (project: MapProject) => {
  const count = project.post_count ?? 0;
  const posts = count ? ' (' + count + (count === 1 ? ' post' : ' posts') + ')' : '';
  return line(project, absolute('/projects/' + project.slug + '.md')) + posts;
};

export type IndexInput = {
  description: string;
  projects: MapProject[];
  posts: MapPost[];
  totals: { projects: number; posts: number };
  /** How many posts the index lists in all. */
  budget?: number;
};

/** The llms.txt document: what the site is, a map of its projects, then posts per project. */
export function indexDocument(input: IndexInput) {
  const { projects, posts } = input;
  const budget = input.budget ?? 150;
  const groups = regions(posts, projects);
  const newestFirst = [...posts].sort((a, b) => stamp(b).localeCompare(stamp(a)));
  const recent = newestFirst.slice(0, 10);
  const listed = new Set(recent.map((p) => p.slug));
  const featured = posts.filter((p) => p.featured && !listed.has(p.slug)).slice(0, 10);
  featured.forEach((p) => listed.add(p.slug));

  const remaining = groups.map((g) => g.posts.filter((p) => !listed.has(p.slug)));
  const sizes = remaining.map((r) => r.length);
  const shares = allocate(sizes, Math.max(0, budget - recent.length - featured.length));
  const total = (slug: string) =>
    projects.find((p) => p.slug === slug)?.post_count ??
    groups.find((g) => g.slug === slug)?.posts.length ??
    0;

  const out: string[] = [
    '# ' + SITE_NAME,
    '',
    '> ' + input.description,
    '',
    'Every post and project below has a clean Markdown version. Append `.md` to its URL, or send `Accept: text/markdown` to the normal page URL. Each project also has its own index at `/llms/<project>.txt` and its own full text at `/llms/<project>-full.txt`, so you can read one area without fetching the rest.',
    '',
    '## Projects',
    ''
  ];
  if (projects.length) {
    out.push(
      ...projects.map(
        (p) =>
          projectLine(p) +
          ((p.post_count ?? 0) > 0 ? ' [index](' + absolute('/llms/' + p.slug + '.txt') + ')' : '')
      )
    );
    if (input.totals.projects > projects.length)
      out.push(
        '',
        'Showing ' +
          projects.length +
          ' of ' +
          input.totals.projects +
          ' projects. The sitemap lists them all.'
      );
  } else out.push('No projects are published yet.');

  out.push('', '## Latest posts', '');
  if (!posts.length) out.push('No posts are published yet.');
  else out.push(...recent.map(postLine));
  if (featured.length) out.push('', '## Featured posts', '', ...featured.map(postLine));

  groups.forEach((group, i) => {
    const chosen = remaining[i].slice(0, shares[i]);
    if (!chosen.length) return;
    out.push('', '## ' + group.title, '', ...chosen.map(postLine));
    const more = total(group.slug) - chosen.length;
    if (group.slug !== UNFILED && more > 0)
      out.push(
        '- [' +
          more +
          ' more in ' +
          group.title +
          '](' +
          absolute('/llms/' + group.slug + '.txt') +
          ')'
      );
  });
  if (input.totals.posts > posts.length)
    out.push(
      '',
      'This index covers the newest ' +
        posts.length +
        ' of ' +
        input.totals.posts +
        ' posts. Project indexes and the sitemap list the rest.'
    );
  out.push(
    '',
    '## Machine access',
    '',
    '- [Sitemap](' + SITE + '/sitemap.xml)',
    '- [RSS feed](' + SITE + '/rss.xml)',
    '- [Full text of the site](' + SITE + '/llms-full.txt)',
    '- [How to connect an agent](' + SITE + '/agents)',
    '- [MCP server](' +
      SITE +
      '/mcp): Streamable HTTP. Connect without a token to search and read published posts and projects.',
    ''
  );
  return out.join('\n') + '\n';
}

/** A project's own index: every post, grouped by topic when it has topics, newest first. */
export function projectIndex(
  project: MapProject & { description?: string },
  posts: MapPost[],
  total: number
) {
  const sorted = [...posts].sort(byPriority);
  const topics = new Map<string, { title: string; posts: MapPost[] }>();
  for (const post of sorted) {
    const key = post.topic?.slug ?? '';
    let topic = topics.get(key);
    if (!topic) {
      topic = { title: post.topic?.title ?? 'Posts', posts: [] };
      topics.set(key, topic);
    }
    topic.posts.push(post);
  }
  const out = [
    '# ' + project.title,
    '',
    '> ' + describe(project.summary ?? project.description ?? ''),
    '',
    '- [Project page as Markdown](' + absolute('/projects/' + project.slug + '.md') + ')',
    '- [Full text of every post](' + absolute('/llms/' + project.slug + '-full.txt') + ')',
    '- [Site index](' + SITE + '/llms.txt)'
  ];
  for (const [key, topic] of [...topics].sort(([a], [b]) => Number(a === '') - Number(b === ''))) {
    out.push('', '## ' + (key ? topic.title : topics.size > 1 ? 'Other posts' : 'Posts'), '');
    out.push(...topic.posts.map(postLine));
  }
  if (!posts.length) out.push('', 'No posts are published in this project yet.');
  if (total > posts.length)
    out.push('', 'Showing the newest ' + posts.length + ' of ' + total + ' posts.');
  return out.join('\n') + '\n';
}

/**
 * Rendered Markdown per post, kept while the post is unchanged. The key carries the content
 * hash, so an edited post is re-read and an untouched one never is. The store is bounded by
 * total size, dropping the least recently used first.
 */
export class TextStore {
  #items = new Map<string, string>();
  #size = 0;
  constructor(private readonly maxChars = 8_000_000) {}

  static key(post: { slug: string; content_hash?: string; updated_at?: string }) {
    return post.slug + '@' + (post.content_hash ?? post.updated_at ?? '');
  }

  async get(post: Parameters<typeof TextStore.key>[0], load: () => Promise<string>) {
    const key = TextStore.key(post);
    const hit = this.#items.get(key);
    if (hit !== undefined) {
      this.#items.delete(key);
      this.#items.set(key, hit);
      return hit;
    }
    const text = await load();
    // Older versions of the same post are dead weight.
    for (const old of [...this.#items.keys()]) if (old.startsWith(post.slug + '@')) this.#drop(old);
    this.#items.set(key, text);
    this.#size += text.length;
    while (this.#size > this.maxChars && this.#items.size > 1)
      this.#drop(this.#items.keys().next().value!);
    return text;
  }

  #drop(key: string) {
    this.#size -= this.#items.get(key)?.length ?? 0;
    this.#items.delete(key);
  }

  get size() {
    return this.#items.size;
  }
}
