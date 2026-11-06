import type { Article, Topic } from '@voidreg/publishing-ui/api';

export type TopicSection = {
  topic: Pick<Topic, 'id' | 'slug' | 'title' | 'summary' | 'post_count' | 'latest_post_at'>;
  items: Article[];
};
export type ProjectLog = {
  /** Total posts linked to the project, with or without a topic. */
  total: number;
  /** Used when the project has no topics: a short flat list. */
  flat: Article[];
  /** Topic sections with their latest posts, at most `MAX_SECTIONS`. */
  sections: TopicSection[];
  /** Topics beyond the section cap, listed as plain links. */
  more: TopicSection['topic'][];
  /** Posts that are not filed under a topic. Only present once the project has topics. */
  other: { total: number; items: Article[] } | null;
};

export const FLAT_LIMIT = 10;
export const SECTION_POSTS = 3;
export const MAX_SECTIONS = 12;

/** The topic a post is filed under, with its project and a few sibling posts. */
export type PostTopic = {
  slug: string;
  title: string;
  post_count: number;
  project: { slug: string; title: string };
  others: Article[];
};
export const TOPIC_SIBLINGS = 4;
