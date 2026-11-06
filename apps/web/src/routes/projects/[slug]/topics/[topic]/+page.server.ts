import { redirect } from '@sveltejs/kit';
import { publicContent, normalizePagination } from '$lib/server/content';
import { filterHref, isCanonical, parseFilters } from '$lib/filters';
import type { Article, Page, Topic } from '@voidreg/publishing-ui/api';

export async function load({ params, fetch, url }) {
  const topic = await publicContent<Topic>(
    `/topics/${encodeURIComponent(params.slug)}/${encodeURIComponent(params.topic)}`,
    fetch
  );
  const project = topic.project;
  if (!project) redirect(307, '/projects');
  const base = `/projects/${project.slug}/topics/${topic.slug}`;
  if (project.slug !== params.slug || topic.slug !== params.topic) redirect(308, base);
  // Only search and the page number apply inside a topic.
  const { q, page } = parseFilters(url.searchParams);
  const canonical = filterHref(base, { q, page });
  if (!isCanonical(url.searchParams, canonical)) redirect(303, canonical);
  const result = await publicContent<Page<Article>>(
    `/blogs?topic_id=${encodeURIComponent(topic.id)}&page=${page}` +
      (q ? '&q=' + encodeURIComponent(q) : ''),
    fetch
  );
  normalizePagination(url, result);
  return { topic, project, result, q, base };
}
