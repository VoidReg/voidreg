import type { PublicationArtifact } from '@publisle/adapter-core';
export type Article = {
  revision?: number;
  slug: string;
  title: string;
  category: string;
  summary: string;
  status: 'draft' | 'published';
  featured: boolean;
  sort_order: number;
  published_at: string | null;
  reading_time_minutes: number | null;
  compiled?: PublicationArtifact;
  document?: unknown;
  content_hash: string;
  sections: { heading?: string; body: string; kind: string }[];
};
export type Page<T> = { items: T[]; page: number; per_page: number; total: number };
export const apiBase = '/api/v1';
const cache = new Map<string, { etag: string; value: unknown; expires: number }>();
export async function getPublic<T>(path: string, signal?: AbortSignal, force = false): Promise<T> {
  const cached = cache.get(path);
  if (!force && cached && cached.expires > Date.now()) return cached.value as T;
  const response = await fetch(apiBase + path, {
    signal,
    headers: cached ? { 'If-None-Match': cached.etag } : {},
    cache: 'no-cache'
  });
  if (response.status === 304 && cached) {
    cached.expires = Date.now() + 60_000;
    return cached.value as T;
  }
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'This article is unavailable.'
        : 'Unable to load articles. Please try again.'
    );
  const value: T = await response.json();
  cache.set(path, {
    etag: response.headers.get('ETag') ?? '',
    value,
    expires: Date.now() + 60_000
  });
  if (cache.size > 50) cache.delete(cache.keys().next().value!);
  return value;
}
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiBase + path, { credentials: 'include', ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? 'The request failed. Please try again.');
  }
  return response.json();
}
