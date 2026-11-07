import { redirect } from '@sveltejs/kit';
import { publicContent, referenceContent, normalizePagination } from '$lib/server/content';
import { apiQuery, filterHref, isCanonical, parseFilters, resolveSlug } from '$lib/filters';
import type { Article, Page, Topic } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';
type Vocabulary = { items: { name: string; count_posts: number }[] };

const SEEDS = 20;

export async function load({ fetch, url }) {
  const filters = parseFilters(url.searchParams);
  const soft = <T>(path: string) => publicContent<T>(path, fetch).catch(() => null);
  // Lists that rarely change are reused for a minute, so paging only fetches the page itself.
  const cached = <T>(path: string) => referenceContent<T>(path, fetch).catch(() => null);

  // The project field accepts a slug or a title, so the no-JS form works with typed text.
  let project: Project | null = null;
  if (filters.project) {
    project = await soft<Project>('/projects/' + encodeURIComponent(filters.project));
    if (!project) {
      const found = await soft<Page<Project>>(
        '/projects?per_page=20&q=' + encodeURIComponent(filters.project)
      );
      const slug = resolveSlug(filters.project, found?.items ?? []);
      if (slug) redirect(303, filterHref('/blog', { ...filters, project: slug, page: 1 }));
    }
  }
  // The topic belongs to the chosen project; a leftover topic from another project is dropped.
  const topics = project
    ? ((
        await cached<Page<Topic>>(
          '/topics?per_page=100&project=' + encodeURIComponent(project.slug)
        )
      )?.items ?? [])
    : [];
  const topic =
    filters.topic === 'none' ? null : (topics.find((t) => t.slug === filters.topic) ?? null);
  const cleaned = {
    ...filters,
    project: project?.slug ?? filters.project,
    topic: project && (filters.topic === 'none' || topic) ? filters.topic : ''
  };
  // Canonical address: no empty parameters from the GET form and no stale topic.
  const canonical = filterHref('/blog', cleaned);
  if (!isCanonical(url.searchParams, canonical)) redirect(303, canonical);

  const [result, projects, vocabulary] = await Promise.all([
    publicContent<Page<Article>>('/blogs?' + apiQuery(cleaned), fetch),
    cached<Page<Project>>(`/projects?per_page=${SEEDS}`),
    cached<Vocabulary>(`/tags?limit=${SEEDS}`)
  ]);
  normalizePagination(url, result);
  return {
    result,
    filters: cleaned,
    // Starting points for the type-ahead lists; typing asks the server for more.
    seeds: {
      projects: (projects?.items ?? [])
        .filter((p) => (p.post_count ?? 0) > 0)
        .sort((a, b) => (b.post_count ?? 0) - (a.post_count ?? 0))
        .map((p) => ({ value: p.title, hint: `${p.post_count} posts` })),
      tags: (vocabulary?.items ?? [])
        .filter((t) => t.count_posts > 0)
        .map((t) => ({ value: t.name, hint: `${t.count_posts} posts` }))
    },
    project: project ? { slug: project.slug, title: project.title } : null,
    topics: topics.map((t) => ({ slug: t.slug, title: t.title, count: t.post_count })),
    topicTitle: topic?.title ?? ''
  };
}
