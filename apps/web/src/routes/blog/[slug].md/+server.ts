import { publicContent } from '$lib/server/content';
import { articleMarkdown } from '$lib/server/llm';
import { markdownResponse } from '$lib/server/markdown-response';
import { absolute } from '$lib/seo';
import type { Article, Page } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';
import { redirect } from '@sveltejs/kit';

// Clean Markdown twin of /blog/<slug> for crawlers, LLMs and readers who want plain text.
export async function GET({ params, request, fetch }) {
  const article = await publicContent<Article>('/blogs/' + encodeURIComponent(params.slug), fetch);
  if (article.slug !== params.slug) redirect(308, '/blog/' + article.slug + '.md');
  const projects = article.project_ids?.length
    ? (await publicContent<Page<Project>>('/projects?ids=' + article.project_ids.join(','), fetch))
        .items
    : [];
  return markdownResponse(
    request,
    articleMarkdown(article, projects),
    absolute('/blog/' + article.slug),
    article.content_hash
  );
}
