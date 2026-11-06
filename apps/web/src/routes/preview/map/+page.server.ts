import { adminJson } from '$lib/server/preview';
import type { PreviewInfo } from '$lib/server/preview';
import { loadMap } from '$lib/server/map';
import type { Graph } from '$lib/map/layout';

export async function load({ cookies, fetch, url }) {
  const map = await loadMap(
    url,
    async (query) => (await adminJson<Graph>(cookies, fetch, '/graph' + query)).body
  );
  const preview: PreviewInfo = { kind: 'map', title: 'Knowledge map' };
  return { ...map, preview };
}
