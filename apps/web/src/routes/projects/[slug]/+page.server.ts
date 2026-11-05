import { redirect } from '@sveltejs/kit';
import { publicContent, pageNumber, normalizePagination } from '$lib/server/content';
import type { Project } from '$lib/data/projects';
import type { Article, Page } from '@voidreg/publishing-ui/api';
export async function load({ params, fetch, url }) {
  const project = await publicContent<Project>(
    '/projects/' + encodeURIComponent(params.slug),
    fetch
  );
  if (project.slug !== params.slug) redirect(308, '/projects/' + project.slug);
  const posts = await publicContent<Page<Article>>(
    '/blogs?project_id=' + encodeURIComponent(project.id ?? '') + '&page=' + pageNumber(url),
    fetch
  );
  normalizePagination(url, posts);
  return { project, posts };
}
