export type AdminTab = 'articles' | 'projects' | 'media' | 'comments' | 'mcp';
export type EditorView = {
  mode: 'write' | 'preview';
  panel: 'document' | 'outline' | 'settings';
  inspector: 'article' | 'block';
  block: string | null;
};
// SvelteKit's `page.url` is a readonly view of URL, so helpers take only what they read.
export type UrlLike = Pick<URL, 'href' | 'pathname' | 'search' | 'hash'> & {
  searchParams: Pick<URLSearchParams, 'get' | 'has'>;
};
export function adminRoute(url: UrlLike) {
  const p = url.searchParams;
  const requested = p.get('tab') ?? (p.has('project') ? 'projects' : 'articles');
  const tab: AdminTab = ['articles', 'projects', 'media', 'comments', 'mcp'].includes(requested)
    ? (requested as AdminTab)
    : 'articles';
  const item = tab === 'projects' ? p.get('project') : tab === 'articles' ? p.get('article') : null;
  return {
    tab,
    item,
    editing: !!item || (['articles', 'projects'].includes(tab) && p.get('new') === '1'),
    page: Math.max(1, Math.min(1000000, Number(p.get('page')) || 1)) | 0,
    query: p.get('q') ?? '',
    status: p.get('status') ?? '',
    sort: (['title', 'category', 'status', 'date'].includes(p.get('sort') ?? '')
      ? p.get('sort')
      : '') as '' | 'title' | 'category' | 'status' | 'date',
    dir: p.get('dir') === 'desc' ? ('desc' as const) : ('asc' as const),
    perPage: [10, 20, 50, 100].includes(Number(p.get('per_page'))) ? Number(p.get('per_page')) : 20,
    mode: p.get('mode') === 'preview' ? ('preview' as const) : ('write' as const),
    panel:
      p.get('panel') === 'settings'
        ? ('settings' as const)
        : p.get('panel') === 'outline'
          ? ('outline' as const)
          : ('document' as const),
    block: p.get('block'),
    inspector: p.get('inspector') === 'block' ? ('block' as const) : ('article' as const)
  };
}
export function adminUrl(
  url: UrlLike,
  changes: Record<string, string | number | null | undefined>
) {
  const next = new URL(url.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === '') next.searchParams.delete(key);
    else next.searchParams.set(key, String(value));
  }
  return next.pathname + next.search + next.hash;
}
export function editorIdentity(url: UrlLike) {
  const r = adminRoute(url);
  return r.editing ? r.tab + ':' + (r.item ?? '$new') : '';
}
