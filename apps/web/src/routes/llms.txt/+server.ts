import copy from '$lib/content/portfolio-copy.json';
import { cachedText, newest } from '$lib/server/catalog';
import { textResponse } from '$lib/server/http';
import { indexDocument, type MapPost, type MapProject } from '$lib/server/llm-map';

// The index is a map: every project, then posts shared out between projects by a fair-share
// rule. It reads the newest posts and the first projects only, whatever the size of the site.
export async function GET({ fetch, request }) {
  const text = await cachedText('llms', async () => {
    const [projects, posts] = await Promise.all([
      newest<MapProject>('projects', 100, fetch),
      newest<MapPost>('blogs', 500, fetch)
    ]);
    return indexDocument({
      description: copy.homeDescription,
      projects: projects.items,
      posts: posts.items,
      totals: { projects: projects.total, posts: posts.total }
    });
  });
  return textResponse(request, text, 'text/plain; charset=utf-8');
}
