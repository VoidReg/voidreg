import { draftItem, draftPosts, draftProjects } from '$lib/server/preview';
import type { PreviewInfo } from '$lib/server/preview';
import type { Article } from '@voidreg/publishing-ui/api';

type Draft = Article & { revision?: number; has_unpublished_changes?: boolean; status?: string };

export async function load({ params, cookies, fetch }) {
  const result = await draftItem<Draft>(cookies, fetch, 'articles', params.slug);
  if (result.state !== 'ready') {
    return {
      result,
      preview: { kind: 'post', title: params.slug, slug: params.slug } as PreviewInfo
    };
  }
  const article = result.item;
  const projects = await draftProjects(cookies, fetch, article.project_ids ?? []);
  let newer: Article | null = null;
  let older: Article | null = null;
  const primary = projects[0];
  if (primary?.id) {
    const posts = await draftPosts(cookies, fetch, primary.id);
    const index = posts.items.findIndex((p) => p.slug === article.slug);
    if (index >= 0) {
      newer = posts.items[index - 1] ?? null;
      older = posts.items[index + 1] ?? null;
    }
  }
  const preview: PreviewInfo = {
    kind: 'post',
    title: article.title,
    slug: article.slug,
    revision: article.revision,
    draft: article.status === 'draft',
    changed: article.has_unpublished_changes
  };
  return { result: { state: 'ready' as const }, article, projects, newer, older, preview };
}
