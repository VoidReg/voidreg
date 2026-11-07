import { cachedText, everything } from '$lib/server/catalog';
import { rssFeed } from '$lib/server/feeds';
import type { Article } from '@voidreg/publishing-ui/api';

export async function GET({ fetch }) {
  const xml = await cachedText('rss', async () =>
    rssFeed(await everything<Article>('blogs', fetch))
  );
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
