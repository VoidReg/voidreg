import { publicContent, pageNumber, normalizePagination } from '$lib/server/content';
import type { Article, Page } from '$lib/publishing/api';
export async function load({ fetch, url }) {
  const result = await publicContent<Page<Article>>('/blogs?page=' + pageNumber(url), fetch);
  normalizePagination(url, result);
  return { result };
}
