import type { Article, Page } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';
import { StaleCache } from '../ttl-cache';
import { publicContent } from './content';

// Feeds and indexes are polled by crawlers and readers, and rebuilding them can be slow on a
// large site. Build each once every five minutes and share the result. After that the old copy
// is still served (for up to a day) while one refresh runs, so a visitor never waits on it.
const built = new StaleCache<string>(300_000, 86_400_000, 16);
export const cachedText = (key: string, build: () => Promise<string>) => built.get(key, build);

const PAGE = 100;
const PARALLEL = 4;

const pageOf = <T>(
  endpoint: string,
  page: number,
  fetcher: typeof fetch,
  perPage = PAGE,
  query = ''
) =>
  publicContent<Page<T>>(
    '/' + endpoint + '?' + (query ? query + '&' : '') + 'per_page=' + perPage + '&page=' + page,
    fetcher
  );

/**
 * The newest published items of an endpoint, at most `limit`, in the order the API lists them
 * (newest first for posts). Only the pages that are needed are read, so the cost follows
 * `limit` and never the size of the catalogue. `total` is the full count.
 */
export async function newest<T>(
  endpoint: string,
  limit: number,
  fetcher: typeof fetch,
  query = ''
) {
  const perPage = Math.min(PAGE, Math.max(1, limit));
  const first = await pageOf<T>(endpoint, 1, fetcher, perPage, query);
  const wanted = Math.min(limit, first.total);
  const pages = Math.ceil(wanted / perPage);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
      pageOf<T>(endpoint, index + 2, fetcher, perPage, query)
    )
  );
  const items = [...first.items, ...rest.flatMap((result) => result.items)];
  return { items: items.slice(0, limit), total: first.total };
}

/** Every published item of an endpoint, a hundred per request, a few requests at a time. */
export async function everything<T>(endpoint: string, fetcher: typeof fetch) {
  const first = await pageOf<T>(endpoint, 1, fetcher);
  const pages = Math.ceil(first.total / first.per_page);
  const rest: Page<T>[] = new Array(Math.max(0, pages - 1));
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, rest.length) }, async () => {
      while (next < rest.length) {
        const index = next++;
        rest[index] = await pageOf<T>(endpoint, index + 2, fetcher);
      }
    })
  );
  return [...first.items, ...rest.flatMap((result) => result.items)];
}

export async function catalog(fetcher: typeof fetch) {
  const [projects, articles] = await Promise.all([
    everything<Project>('projects', fetcher),
    everything<Article>('blogs', fetcher)
  ]);
  return { projects, articles };
}
