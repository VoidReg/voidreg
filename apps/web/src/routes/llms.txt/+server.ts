import { cachedText, catalog } from '$lib/server/catalog';
import { llmsIndex } from '$lib/server/feeds';

export async function GET({ fetch }) {
  const text = await cachedText('llms', async () => {
    const { projects, articles } = await catalog(fetch);
    return llmsIndex(projects, articles);
  });
  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
