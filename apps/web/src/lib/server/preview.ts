import { error, redirect, type Cookies } from '@sveltejs/kit';
import type { Article, Page } from '@voidreg/publishing-ui/api';
import type { Project, RelatedProject } from '$lib/data/projects';

const COOKIE = 'voidreg_admin_session';

export type PreviewInfo = {
  kind: 'project' | 'post' | 'map';
  title: string;
  revision?: number;
  changed?: boolean;
  draft?: boolean;
  slug?: string;
};
export type PreviewState<T> =
  | { state: 'ready'; item: T }
  | { state: 'pending' }
  | { state: 'failed'; diagnostics: { message?: string; code?: string }[] };

/** Preview pages are private. Anyone without an admin session goes to the sign-in page. */
export function requireSession(cookies: Cookies) {
  const token = cookies.get(COOKIE);
  if (!token) redirect(303, '/admin/');
  return token;
}

export async function adminJson<T>(
  cookies: Cookies,
  fetcher: typeof fetch,
  path: string,
  { allowPending = false } = {}
): Promise<{ status: number; body: T }> {
  const token = requireSession(cookies);
  let response: Response;
  try {
    response = await fetcher(
      (process.env.VOIDREG_API_URL ?? 'http://127.0.0.1:8080') + '/api/v1/admin' + path,
      {
        headers: { cookie: `${COOKIE}=${token}` },
        signal: AbortSignal.timeout(20000)
      }
    );
  } catch {
    error(503, 'The preview is temporarily unavailable.');
  }
  if (response.status === 401 || response.status === 403) redirect(303, '/admin/');
  if (response.status === 404) error(404, 'Nothing to preview here.');
  if (!(response.ok || (allowPending && response.status === 202)))
    error(503, 'The preview is temporarily unavailable.');
  return { status: response.status, body: (await response.json()) as T };
}

/** Compiles the working copy through the API and returns the compiled item or a notice state. */
export async function draftItem<T>(
  cookies: Cookies,
  fetcher: typeof fetch,
  kind: 'projects' | 'articles',
  slug: string
): Promise<PreviewState<T>> {
  const { body } = await adminJson<PreviewState<T>>(
    cookies,
    fetcher,
    `/preview/${kind}/${encodeURIComponent(slug)}`,
    { allowPending: true }
  );
  return body;
}

export const toRelated = (p: Project): RelatedProject => ({
  id: p.id ?? '',
  slug: p.slug,
  title: p.title,
  category: p.category,
  summary: p.summary,
  tags: p.tags
});

/** Draft projects (working copies) by id, in the order requested. */
export async function draftProjects(
  cookies: Cookies,
  fetcher: typeof fetch,
  ids: string[]
): Promise<Project[]> {
  if (!ids.length) return [];
  const { body } = await adminJson<Page<Project>>(
    cookies,
    fetcher,
    '/projects?per_page=100&ids=' + ids.join(',')
  );
  return ids
    .map((id) => body.items.find((p) => p.id === id))
    .filter((p): p is Project => Boolean(p));
}

export async function draftPosts(
  cookies: Cookies,
  fetcher: typeof fetch,
  projectId: string
): Promise<Page<Article>> {
  return (
    await adminJson<Page<Article>>(
      cookies,
      fetcher,
      '/articles?per_page=100&project_id=' + encodeURIComponent(projectId)
    )
  ).body;
}

/** Typed reader over the admin API, for helpers shared with the public pages. */
export const adminGet =
  (cookies: Cookies, fetcher: typeof fetch) =>
  async <T>(path: string): Promise<T> =>
    (await adminJson<T>(cookies, fetcher, path)).body;
