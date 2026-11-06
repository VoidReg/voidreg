import { error, json } from '@sveltejs/kit';
import { adminJson } from '$lib/server/preview';
import { parseOpen, type Graph } from '$lib/map/layout';

/** Draft-aware twin of the public map data route, behind the admin session. */
export async function GET({ cookies, fetch, params }) {
  const [slug] = parseOpen(params.slug);
  if (!slug || slug !== params.slug) error(404, 'Project not found');
  const { body } = await adminJson<Graph>(
    cookies,
    fetch,
    `/graph?project=${encodeURIComponent(slug)}&links=shared`
  );
  return json(body, { headers: { 'cache-control': 'private, no-store' } });
}
