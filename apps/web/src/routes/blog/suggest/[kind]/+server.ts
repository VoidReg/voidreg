import { error, json } from '@sveltejs/kit';
import { publicContent } from '$lib/server/content';
import type { Page } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';

type Vocabulary = { items: { name: string; count_posts: number }[] };
export type Suggestion = { value: string; slug?: string; hint: string };

/** Type-ahead for the /blog filter bar. Small, bounded and cacheable, never the whole catalogue. */
export async function GET({ params, url, fetch, setHeaders }) {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
  const text = encodeURIComponent(q);
  let items: Suggestion[];
  if (params.kind === 'projects') {
    const page = await publicContent<Page<Project>>(`/projects?per_page=20&q=${text}`, fetch);
    items = page.items
      .filter((p) => (p.post_count ?? 0) > 0)
      .sort((a, b) => (b.post_count ?? 0) - (a.post_count ?? 0))
      .slice(0, 12)
      .map((p) => ({ value: p.title, slug: p.slug, hint: `${p.post_count} posts` }));
  } else if (params.kind === 'tags') {
    const vocabulary = await publicContent<Vocabulary>(`/tags?limit=12&q=${text}`, fetch);
    items = vocabulary.items
      .filter((t) => t.count_posts > 0)
      .map((t) => ({ value: t.name, hint: `${t.count_posts} posts` }));
  } else error(404, 'Unknown suggestion list.');
  setHeaders({ 'cache-control': 'public, max-age=30' });
  return json(items);
}
