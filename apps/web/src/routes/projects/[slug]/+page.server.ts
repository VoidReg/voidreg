import { redirect } from '@sveltejs/kit';
import { publicContent } from '$lib/server/content';
import { projectLog } from '$lib/server/topics';
import type { Project } from '$lib/data/projects';
export async function load({ params, fetch, url }) {
  const project = await publicContent<Project>(
    '/projects/' + encodeURIComponent(params.slug),
    fetch
  );
  if (project.slug !== params.slug) redirect(308, '/projects/' + project.slug);
  // The log used to be paged here. Long histories now live on /blog?project= and topic pages.
  if (url.searchParams.has('page')) redirect(308, '/projects/' + project.slug);
  const log = await projectLog(
    { get: (path) => publicContent(path, fetch), posts: '/blogs' },
    { id: project.id ?? '', slug: project.slug }
  );
  return { project, log };
}
