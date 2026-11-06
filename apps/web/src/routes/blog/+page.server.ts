import { publicContent, pageNumber, normalizePagination } from '$lib/server/content';
import type { Article, Page } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';
type Vocabulary = { items: { name: string; count_projects: number; count_posts: number }[] };
export async function load({ fetch, url }) {
  const project = url.searchParams.get('project') ?? '';
  const tag = url.searchParams.get('tag') ?? '';
  const query =
    '/blogs?page=' +
    pageNumber(url) +
    (project ? '&project=' + encodeURIComponent(project) : '') +
    (tag ? '&tag=' + encodeURIComponent(tag) : '');
  const [result, projects, vocabulary] = await Promise.all([
    publicContent<Page<Article>>(query, fetch),
    publicContent<Page<Project>>('/projects?per_page=100', fetch),
    publicContent<Vocabulary>('/tags?limit=100', fetch)
  ]);
  normalizePagination(url, result);
  // Only projects that have published posts are offered as filters.
  const filters = projects.items.filter((p) => (p.post_count ?? 0) > 0);
  // Most used tags that have posts; the list stays short however large the vocabulary grows.
  const tags = vocabulary.items
    .filter((t) => t.count_posts > 0)
    .slice(0, 24)
    .map((t) => ({ name: t.name, count: t.count_posts }));
  return { result, project, tag, filters, tags };
}
