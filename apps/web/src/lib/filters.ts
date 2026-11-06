// Pure helpers for the reader filter bars: parsing, canonical URLs and removable chips.
// No framework imports so they can be unit tested directly.
export type PostFilters = { q: string; project: string; topic: string; tag: string; page: number };

const clean = (value: string | null, max: number) =>
  (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseFilters(params: Pick<URLSearchParams, 'get'>): PostFilters {
  const page = Number(params.get('page') ?? 1);
  return {
    q: clean(params.get('q'), 100),
    project: clean(params.get('project'), 120),
    topic: clean(params.get('topic'), 120),
    tag: clean(params.get('tag'), 40),
    page: Number.isSafeInteger(page) && page > 1 ? Math.min(page, 1000000) : 1
  };
}

/** Canonical URL: fixed key order, no empty values, no page 1. A topic never outlives its project. */
export function filterHref(base: string, filters: Partial<PostFilters>): string {
  const parts: string[] = [];
  const add = (key: string, value: string | undefined) => {
    if (value) parts.push(`${key}=${encodeURIComponent(value)}`);
  };
  add('q', filters.q);
  add('project', filters.project);
  add('topic', filters.project ? filters.topic : '');
  add('tag', filters.tag);
  if (filters.page && filters.page > 1) parts.push(`page=${filters.page}`);
  return parts.length ? `${base}?${parts.join('&')}` : base;
}

/** The query string sent to the posts API for these filters. */
export function apiQuery(filters: PostFilters): string {
  const parts = [`page=${filters.page}`];
  if (filters.q) parts.push('q=' + encodeURIComponent(filters.q));
  if (filters.project) parts.push('project=' + encodeURIComponent(filters.project));
  if (filters.project && filters.topic) parts.push('topic=' + encodeURIComponent(filters.topic));
  if (filters.tag) parts.push('tag=' + encodeURIComponent(filters.tag));
  return parts.join('&');
}

export type FilterChip = { key: keyof PostFilters; label: string; value: string; href: string };

/** One removable chip per active filter. Removing a project also removes its topic. */
export function filterChips(
  base: string,
  filters: PostFilters,
  labels: { project?: string; topic?: string } = {}
): FilterChip[] {
  const chips: FilterChip[] = [];
  const without = (...keys: (keyof PostFilters)[]) => {
    const next: Partial<PostFilters> = { ...filters, page: 1 };
    for (const key of keys) (next as Record<string, unknown>)[key] = '';
    return filterHref(base, next);
  };
  if (filters.q) chips.push({ key: 'q', label: 'Search', value: filters.q, href: without('q') });
  if (filters.project)
    chips.push({
      key: 'project',
      label: 'Project',
      value: labels.project ?? filters.project,
      href: without('project', 'topic')
    });
  if (filters.project && filters.topic)
    chips.push({
      key: 'topic',
      label: 'Topic',
      value: filters.topic === 'none' ? 'Other posts' : (labels.topic ?? filters.topic),
      href: without('topic')
    });
  if (filters.tag)
    chips.push({ key: 'tag', label: 'Tag', value: filters.tag, href: without('tag') });
  return chips;
}

const fold = (text: string) => text.trim().toLowerCase();

/** Slug for typed text that is a slug or an exact title (case-insensitive), else null. */
export function resolveSlug(typed: string, candidates: { slug: string; title: string }[]) {
  const wanted = fold(typed);
  if (!wanted) return null;
  return (
    candidates.find((c) => fold(c.slug) === wanted)?.slug ??
    candidates.find((c) => fold(c.title) === wanted)?.slug ??
    null
  );
}

/**
 * True when the request already carries exactly the canonical parameters, compared after
 * decoding so differences in percent-encoding can never cause a redirect loop.
 */
export function isCanonical(current: URLSearchParams, canonicalHref: string): boolean {
  const wanted = [...new URL(canonicalHref, 'http://local').searchParams.entries()];
  const have = [...current.entries()];
  return (
    wanted.length === have.length &&
    wanted.every(([k, v], i) => have[i][0] === k && have[i][1] === v)
  );
}

/**
 * Splits a chip row into the visible part and the rest behind "Show more". The active chip is
 * always visible, so a filter can never hide itself.
 */
export function capChips<T>(items: readonly T[], limit: number, isActive: (item: T) => boolean) {
  if (items.length <= limit) return { shown: [...items], rest: [] as T[] };
  const active = items.filter(isActive);
  const shown = [...active, ...items.filter((item) => !isActive(item))].slice(
    0,
    Math.max(limit, active.length)
  );
  return { shown, rest: items.filter((item) => !shown.includes(item)) };
}
