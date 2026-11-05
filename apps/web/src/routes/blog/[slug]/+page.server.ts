import { redirect } from '@sveltejs/kit';
import { publicContent } from '$lib/server/content';
import type { Article, Page } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';
export async function load({ params, fetch }) {
  const article = await publicContent<Article>('/blogs/' + encodeURIComponent(params.slug), fetch);
  if (article.slug !== params.slug) redirect(308, '/blog/' + article.slug);
  const projects = article.project_ids?.length
    ? (await publicContent<Page<Project>>('/projects?ids=' + article.project_ids.join(','), fetch))
        .items
    : [];
  return { article, projects };
}
