import { adminGet, draftItem, draftProjects, toRelated } from '$lib/server/preview';
import { projectLog } from '$lib/server/topics';
import type { PreviewInfo } from '$lib/server/preview';
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
  const log = await projectLog(
    { get: adminGet(cookies, fetch), posts: '/articles' },
    { id: project.id ?? '', slug: project.slug }
  );
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
    log,
    preview
  };
}
