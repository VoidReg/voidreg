import { cachedText, newest } from '$lib/server/catalog';
import { FEED_ITEMS, rssFeed } from '$lib/server/feeds';
import { textResponse } from '$lib/server/http';
import type { Article } from '@voidreg/publishing-ui/api';

// Only the newest posts go in a feed, so one page of the API is enough, however many posts exist.
export async function GET({ fetch, request }) {
  const xml = await cachedText('rss', async () =>
    rssFeed((await newest<Article>('blogs', FEED_ITEMS, fetch)).items)
  );
  return textResponse(request, xml, 'application/rss+xml; charset=utf-8');
}
