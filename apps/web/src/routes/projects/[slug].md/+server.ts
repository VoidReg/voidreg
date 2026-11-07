import { publicContent } from '$lib/server/content';
import { projectMarkdown } from '$lib/server/llm';
import { markdownResponse } from '$lib/server/markdown-response';
import { absolute } from '$lib/seo';
import type { Article, Page } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';
import { redirect } from '@sveltejs/kit';

// Clean Markdown twin of /projects/<slug>, with the posts that follow the project.
export async function GET({ params, request, fetch }) {
  const project = await publicContent<Project>(
    '/projects/' + encodeURIComponent(params.slug),
    fetch
  );
  if (project.slug !== params.slug) redirect(308, '/projects/' + project.slug + '.md');
  const posts = await publicContent<Page<Article>>(
    '/blogs?per_page=100&project_id=' + encodeURIComponent(project.id ?? ''),
    fetch
  );
  return markdownResponse(
    request,
    projectMarkdown(project, posts.items),
    absolute('/projects/' + project.slug),
    String(project.revision) + (project.updated_at ?? '')
  );
}
