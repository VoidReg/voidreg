import type { Article, ContentMeta } from '@voidreg/publishing-ui/api';
export type RelatedProject = {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  tags: string[];
};
export type Project = ContentMeta & {
  /** Present on listings: published posts linked to this project. */
  post_count?: number;
  latest_post_at?: string | null;
  /** Present on detail reads: published related projects. */
  related?: RelatedProject[];
  slug: string;
  title: string;
  category: string;
  summary: string;
  tags: string[];
  revision: number;
  status: 'draft' | 'published';
  featured: boolean;
  sort_order: number;
  document?: unknown;
  compiled?: Article['compiled'];
  sections: Article['sections'];
  repo_url?: string | null;
  has_detail_page?: boolean;
};
