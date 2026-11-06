import { publicContent } from '$lib/server/content';
import type { Graph } from '$lib/map/layout';
export async function load({ fetch, url }) {
  const graph = await publicContent<Graph>('/graph', fetch);
  return { graph, focus: url.searchParams.get('focus') ?? '' };
}
