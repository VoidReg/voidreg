import type { Article, Page, Topic } from '@voidreg/publishing-ui/api';
import {
  FLAT_LIMIT,
  MAX_SECTIONS,
  SECTION_POSTS,
  TOPIC_SIBLINGS,
  type PostTopic,
  type ProjectLog
} from '$lib/topics';

/** Reads JSON from either the public API or the admin API, so live and preview pages share it. */
export type Get = <T>(path: string) => Promise<T>;
export type Scope = { get: Get; posts: '/blogs' | '/articles' };

const q = encodeURIComponent;

/**
 * The project page log. Cost is bounded by `MAX_SECTIONS + 2` small requests no matter how
 * many posts or topics a project has, so a huge project never floods the page.
 */
export async function projectLog(
  scope: Scope,
  project: { id: string; slug: string }
): Promise<ProjectLog> {
  const { get, posts } = scope;
  const byProject = `${posts}?project_id=${q(project.id)}`;
  const topicList = await get<Page<Topic>>(
    scope.posts === '/blogs'
      ? `/topics?per_page=100&project=${q(project.slug)}`
      : `/topics?per_page=100&project_id=${q(project.id)}`
  );
  const topics = topicList.items.filter((t) => t.post_count > 0);
  if (!topics.length) {
    const flat = await get<Page<Article>>(`${byProject}&per_page=${FLAT_LIMIT}`);
    return { total: flat.total, flat: flat.items, sections: [], more: [], other: null };
  }
  const shown = topics.slice(0, MAX_SECTIONS);
  const [sections, other] = await Promise.all([
    Promise.all(
      shown.map(async (topic) => ({
        topic,
        items: (
          await get<Page<Article>>(`${byProject}&topic_id=${q(topic.id)}&per_page=${SECTION_POSTS}`)
        ).items
      }))
    ),
    get<Page<Article>>(`${byProject}&topic=none&per_page=${SECTION_POSTS}`)
  ]);
  const inTopics = topics.reduce((sum, t) => sum + t.post_count, 0);
  return {
    total: inTopics + other.total,
    flat: [],
    sections,
    more: topics.slice(MAX_SECTIONS),
    other: other.total ? { total: other.total, items: other.items } : null
  };
}

/** Topic context for a post page: one small topic read and one small sibling list. */
export async function postTopic(
  scope: Scope,
  article: { slug: string; topic_id?: string | null }
): Promise<PostTopic | null> {
  if (!article.topic_id) return null;
  const { get, posts } = scope;
  const found = await get<Page<Topic>>(`/topics?per_page=1&ids=${q(article.topic_id)}`).catch(
    () => null
  );
  const topic = found?.items[0];
  if (!topic?.project) return null;
  const siblings = await get<Page<Article>>(
    `${posts}?topic_id=${q(topic.id)}&per_page=${TOPIC_SIBLINGS + 1}`
  ).catch(() => null);
  return {
    slug: topic.slug,
    title: topic.title,
    post_count: topic.post_count,
    project: { slug: topic.project.slug, title: topic.project.title },
    others: (siblings?.items ?? []).filter((p) => p.slug !== article.slug).slice(0, TOPIC_SIBLINGS)
  };
}
