import { cachedText, newest } from '$lib/server/catalog';
import { textResponse } from '$lib/server/http';
import { fullText, leftover } from '$lib/server/llm-docs';
import { interleave, regions, type MapPost, type MapProject } from '$lib/server/llm-map';

// The text of the site in one document. Posts come in map order, the newest of every project
// before the second newest of any, so the size limit never cuts one project out. What does not
// fit is listed by project, each with a document of its own.
const CANDIDATES = 600;

export async function GET({ fetch, request }) {
  const text = await cachedText('llms-full', async () => {
    const [projects, posts] = await Promise.all([
      newest<MapProject>('projects', 100, fetch),
      newest<MapPost>('blogs', CANDIDATES, fetch)
    ]);
    const groups = regions(posts.items, projects.items);
    const order = interleave(groups);
    const { text: body, used } = await fullText(order, fetch);
    const covered =
      posts.total > posts.items.length
        ? 'This document covers the newest ' +
          posts.items.length +
          ' of ' +
          posts.total +
          ' posts. Each project has its own full-text document, and the sitemap lists every post.'
        : '';
    const rest = [leftover(groups, order, used), covered].filter(Boolean).join('\n\n');
    return (
      [body, rest].filter(Boolean).join('\n\n---\n\n') || 'No posts are published yet.'
    ).concat('\n');
  });
  return textResponse(request, text, 'text/plain; charset=utf-8', { maxAge: 3600 });
}
