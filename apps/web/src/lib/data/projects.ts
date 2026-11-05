import type { Article, ContentMeta } from '@voidreg/publishing-ui/api';
export type Project = ContentMeta & {
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
