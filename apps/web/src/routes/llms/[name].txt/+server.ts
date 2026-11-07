import { error } from '@sveltejs/kit';
import { StaleCache } from '$lib/ttl-cache';
import { newest } from '$lib/server/catalog';
import { publicContent } from '$lib/server/content';
import { textResponse } from '$lib/server/http';
import { fullText } from '$lib/server/llm-docs';
import { projectIndex, type MapPost, type MapProject } from '$lib/server/llm-map';

// /llms/<project>.txt lists every post of one project, grouped by topic. /llms/<project>-full.txt
// holds their text. Both let a reader take one area of the site without the rest.
const LISTED = 1000;
const documents = new StaleCache<string>(300_000, 86_400_000, 128);
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

async function project(slug: string, fetch: typeof globalThis.fetch) {
  try {
    return await publicContent<MapProject>('/projects/' + encodeURIComponent(slug), fetch);
  } catch {
    return null;
  }
}

export async function GET({ params, fetch, request }) {
  const name = params.name;
  if (!SLUG.test(name)) error(404, 'This page is unavailable.');
  // A project could in theory be called "x-full", so the exact name wins.
  let slug = name;
  let full = false;
  let found = await project(slug, fetch);
  if (!found && name.endsWith('-full')) {
    slug = name.slice(0, -'-full'.length);
    full = true;
    found = await project(slug, fetch);
  }
  if (!found) error(404, 'This page is unavailable.');
  const text = await documents.get(name, async () => {
    const posts = await newest<MapPost>(
      'blogs',
      LISTED,
      fetch,
      'project=' + encodeURIComponent(slug)
    );
    if (!full) return projectIndex(found, posts.items, posts.total);
    const ordered = [...posts.items].sort(
      (a, b) =>
        Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
        (b.published_at ?? '').localeCompare(a.published_at ?? '')
    );
    const { text: body } = await fullText(ordered, fetch);
    return body ? body + '\n' : 'No posts are published in this project yet.\n';
  });
  return textResponse(request, text, 'text/plain; charset=utf-8');
}
