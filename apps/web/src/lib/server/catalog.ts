import type { Article, Page } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';
import { TtlCache } from '../ttl-cache';
import { publicContent } from './content';

// Feeds and indexes walk the whole catalogue. Crawlers fetch them often, so build each once
// every five minutes and share the result.
const built = new TtlCache<string>(300_000, 8);
export const cachedText = (key: string, build: () => Promise<string>) => built.get(key, build);

/** Every published item of an endpoint, read a hundred at a time. */
export async function everything<T>(endpoint: string, fetcher: typeof fetch) {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const result = await publicContent<Page<T>>(
      '/' + endpoint + '?per_page=100&page=' + page,
      fetcher
    );
    items.push(...result.items);
    if (page * result.per_page >= result.total) return items;
  }
}

export async function catalog(fetcher: typeof fetch) {
  const [projects, articles] = await Promise.all([
    everything<Project>('projects', fetcher),
    everything<Article>('blogs', fetcher)
  ]);
  return { projects, articles };
}
