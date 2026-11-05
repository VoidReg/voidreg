import { publicContent, pageNumber, normalizePagination } from '$lib/server/content';
import type { Page } from '$lib/publishing/api';
import type { Project } from '$lib/data/projects';
export async function load({ fetch, url }) {
  const result = await publicContent<Page<Project>>('/projects?page=' + pageNumber(url), fetch);
  normalizePagination(url, result);
  return { result };
}
