import { error, json } from '@sveltejs/kit';
import { publicContent } from '$lib/server/content';
import { parseOpen, type Graph } from '$lib/map/layout';

/** One project's posts, related projects and shared-technology links, loaded as it is focused. */
export async function GET({ fetch, params }) {
  const [slug] = parseOpen(params.slug);
  if (!slug || slug !== params.slug) error(404, 'Project not found');
  const graph = await publicContent<Graph>(
    `/graph?project=${encodeURIComponent(slug)}&links=shared`,
    fetch
  );
  return json(graph, { headers: { 'cache-control': 'public, max-age=60' } });
}
