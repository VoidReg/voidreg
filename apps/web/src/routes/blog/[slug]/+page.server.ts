import { redirect } from '@sveltejs/kit';
import { publicContent } from '$lib/server/content';
import type { Article, Page } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';
export async function load({ params, fetch }) {
  const article = await publicContent<Article>('/blogs/' + encodeURIComponent(params.slug), fetch);
  if (article.slug !== params.slug) redirect(308, '/blog/' + article.slug);
  const found = article.project_ids?.length
    ? (await publicContent<Page<Project>>('/projects?ids=' + article.project_ids.join(','), fetch))
        .items
    : [];
  // Keep the author's order: the first linked project is the primary one.
  const projects = (article.project_ids ?? [])
    .map((id) => found.find((p) => p.id === id))
    .filter((p): p is Project => Boolean(p));
  // Neighbours in the primary project's timeline (the list is newest first).
  let newer: Article | null = null;
  let older: Article | null = null;
  const primary = projects[0];
  if (primary?.id) {
    const posts = await publicContent<Page<Article>>(
      '/blogs?per_page=100&project_id=' + encodeURIComponent(primary.id),
      fetch
    );
    const index = posts.items.findIndex((p) => p.slug === article.slug);
    if (index >= 0) {
      newer = posts.items[index - 1] ?? null;
      older = posts.items[index + 1] ?? null;
    }
  }
  return { article, projects, newer, older };
}
