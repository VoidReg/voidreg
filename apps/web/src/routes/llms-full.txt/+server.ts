import { newest } from '$lib/server/catalog';
import { textResponse } from '$lib/server/http';
import { publicContent } from '$lib/server/content';
import { articleMarkdown } from '$lib/server/llm';
import { absolute } from '$lib/seo';
import { StaleCache } from '$lib/ttl-cache';
import type { Article } from '@voidreg/publishing-ui/api';

// One document with the text of every post, capped so it stays cheap to build and to fetch.
const LIMIT = 1_000_000;
// Posts are read newest first until the size budget is spent. A post averages a few KB, so this
// many candidates is plenty, and it keeps the cost flat however many posts exist.
const CANDIDATES = 600;
const cache = new StaleCache<string>(600_000, 86_400_000, 1);

export async function GET({ fetch, request }) {
  const text = await cache.get('all', async () => {
    const { items: articles } = await newest<Article>('blogs', CANDIDATES, fetch);
    const parts: string[] = [];
    let size = 0;
    let used = 0;
    // Read details a few at a time, in order, and stop once the size budget is spent.
    for (let start = 0; start < articles.length && size < LIMIT; start += 8) {
      const batch = await Promise.all(
        articles
          .slice(start, start + 8)
          .map((a) => publicContent<Article>('/blogs/' + encodeURIComponent(a.slug), fetch))
      );
      for (const article of batch) {
        const part = articleMarkdown(article);
        if (size + part.length > LIMIT) {
          size = LIMIT;
          break;
        }
        parts.push(part);
        size += part.length;
        used++;
      }
    }
    const rest = articles.slice(used);
    if (rest.length)
      parts.push(
        '## More posts\n\nThe size limit was reached. Read the rest as Markdown:\n\n' +
          rest
            .slice(0, 200)
            .map((a) => '- [' + a.title + '](' + absolute('/blog/' + a.slug + '.md') + ')')
            .join('\n')
      );
    return parts.length ? parts.join('\n\n---\n\n') + '\n' : 'No posts are published yet.\n';
  });
  return textResponse(request, text, 'text/plain; charset=utf-8', { maxAge: 3600 });
}
