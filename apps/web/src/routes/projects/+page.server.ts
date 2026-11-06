import { publicContent, pageNumber, normalizePagination } from '$lib/server/content';
import type { Page } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';
export async function load({ fetch, url }) {
  const tag = url.searchParams.get('tag') ?? '';
  const category = url.searchParams.get('category') ?? '';
  const query =
    '/projects?page=' +
    pageNumber(url) +
    (tag ? '&tag=' + encodeURIComponent(tag) : '') +
    (category ? '&category=' + encodeURIComponent(category) : '');
  const [result, everything, vocabulary] = await Promise.all([
    publicContent<Page<Project>>(query, fetch),
    publicContent<Page<Project>>('/projects?per_page=100', fetch),
    publicContent<{ items: { name: string; count_projects: number }[] }>('/tags?limit=100', fetch)
  ]);
  normalizePagination(url, result);
  // Filter options come from the whole catalogue so they stay stable while filtering.
  const unique = (values: string[]) =>
    [...new Map(values.map((v) => [v.toLowerCase(), v])).values()].sort((a, b) =>
      a.localeCompare(b)
    );
  return {
    result,
    tag,
    category,
    // Most used technologies, from the shared vocabulary so the row stays short at any scale.
    tags: unique(
      vocabulary.items
        .filter((t) => t.count_projects > 0)
        .slice(0, 30)
        .map((t) => t.name)
    ),
    categories: unique(everything.items.map((p) => p.category).filter(Boolean))
  };
}
