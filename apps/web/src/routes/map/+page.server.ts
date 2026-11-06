import { publicContent } from '$lib/server/content';
import { loadMap } from '$lib/server/map';
import type { Graph } from '$lib/map/layout';
export async function load({ fetch, url }) {
  return loadMap(url, (query) => publicContent<Graph>('/graph' + query, fetch));
}
