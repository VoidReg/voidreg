import { publicContent } from '$lib/server/content';
import type { Article, Page } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';
export async function load({ fetch }) {
  const [projects, posts] = await Promise.all([
    publicContent<Page<Project>>('/projects?featured=true&per_page=3', fetch),
    publicContent<Page<Article>>('/blogs?per_page=3', fetch)
  ]);
  return { projects: projects.items, posts: posts.items };
}
