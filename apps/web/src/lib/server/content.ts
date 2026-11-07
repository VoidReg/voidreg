import { error, redirect } from '@sveltejs/kit';
import { TtlCache } from '../ttl-cache';
import { SITE } from '../seo';
export const site = SITE;
export async function publicContent<T>(path: string, fetcher: typeof fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(
      (process.env.VOIDREG_API_URL ?? 'http://127.0.0.1:8080') + '/api/v1' + path,
      {
        signal: AbortSignal.timeout(10000)
      }
    );
  } catch {
    error(503, 'Content is temporarily unavailable. Please try again.');
  }
  if (!response.ok)
    error(
      response.status === 404 ? 404 : 503,
      response.status === 404 ? 'This page is unavailable.' : 'Content is temporarily unavailable.'
    );
  return response.json();
}
// Lookups that change rarely (vocabularies, type-ahead seeds, category lists) are reused for a
// minute, so moving between pages of a list only fetches that page.
const reference = new TtlCache<unknown>(60_000);
export function referenceContent<T>(path: string, fetcher: typeof fetch): Promise<T> {
  return reference.get(path, () => publicContent<T>(path, fetcher)) as Promise<T>;
}
export function pageNumber(url: URL) {
  const n = Number(url.searchParams.get('page') ?? 1);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 1000000) : 1;
}

export function normalizePagination(
  url: URL,
  result: { page: number; per_page: number; total: number }
) {
  const last = Math.max(1, Math.ceil(result.total / result.per_page));
  const current = Math.min(pageNumber(url), last);
  if (
    url.searchParams.has('page') &&
    (current === 1 || url.searchParams.get('page') !== String(current))
  ) {
    const canonical = new URL(url);
    if (current === 1) canonical.searchParams.delete('page');
    else canonical.searchParams.set('page', String(current));
    redirect(307, canonical.pathname + canonical.search);
  }
}
