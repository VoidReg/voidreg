import { draftItem, draftPosts, draftProjects, toRelated } from '$lib/server/preview';
import type { PreviewInfo } from '$lib/server/preview';
import type { Article, Page } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';

type Draft = Project & { revision?: number; has_unpublished_changes?: boolean; status?: string };

export async function load({ params, cookies, fetch }) {
  const result = await draftItem<Draft>(cookies, fetch, 'projects', params.slug);
  if (result.state !== 'ready') {
    return {
      result,
      preview: { kind: 'project', title: params.slug, slug: params.slug } as PreviewInfo
    };
  }
  const project = result.item;
  const related = await draftProjects(cookies, fetch, project.related_project_ids ?? []);
  const posts: Page<Article> = project.id
    ? await draftPosts(cookies, fetch, project.id)
    : { items: [], page: 1, per_page: 100, total: 0 };
  const preview: PreviewInfo = {
    kind: 'project',
    title: project.title,
    slug: project.slug,
    revision: project.revision,
    draft: project.status === 'draft',
    changed: project.has_unpublished_changes
  };
  return {
    result: { state: 'ready' as const },
    project: { ...project, related: related.map(toRelated) },
    posts,
    preview
  };
}
