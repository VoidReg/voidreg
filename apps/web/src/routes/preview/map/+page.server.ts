import { adminJson } from '$lib/server/preview';
import type { PreviewInfo } from '$lib/server/preview';
import type { Graph } from '$lib/map/layout';

export async function load({ cookies, fetch, url }) {
  const { body } = await adminJson<Graph>(cookies, fetch, '/graph');
  const preview: PreviewInfo = { kind: 'map', title: 'Knowledge map' };
  return { graph: body, focus: url.searchParams.get('focus') ?? '', preview };
}
