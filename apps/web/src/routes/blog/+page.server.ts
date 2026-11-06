import { publicContent, pageNumber, normalizePagination } from '$lib/server/content';
import type { Article, Page } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';
export async function load({ fetch, url }) {
  const project = url.searchParams.get('project') ?? '';
  const query =
    '/blogs?page=' + pageNumber(url) + (project ? '&project=' + encodeURIComponent(project) : '');
  const [result, projects] = await Promise.all([
    publicContent<Page<Article>>(query, fetch),
    publicContent<Page<Project>>('/projects?per_page=100', fetch)
  ]);
  normalizePagination(url, result);
  // Only projects that have published posts are offered as filters.
  const filters = projects.items.filter((p) => (p.post_count ?? 0) > 0);
  return { result, project, filters };
}
