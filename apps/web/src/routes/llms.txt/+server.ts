import { cachedText, newest } from '$lib/server/catalog';
import { INDEX_LIMIT, llmsIndex } from '$lib/server/feeds';
import { textResponse } from '$lib/server/http';
import type { Article } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';

// The index lists the newest entries only, so it reads only those pages of the API.
export async function GET({ fetch, request }) {
  const text = await cachedText('llms', async () => {
    const [projects, articles] = await Promise.all([
      newest<Project>('projects', INDEX_LIMIT, fetch),
      newest<Article>('blogs', INDEX_LIMIT, fetch)
    ]);
    return llmsIndex(projects.items, articles.items, {
      projects: projects.total,
      articles: articles.total
    });
  });
  return textResponse(request, text, 'text/plain; charset=utf-8');
}
