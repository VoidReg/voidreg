export type AdminTab = 'articles' | 'projects' | 'media' | 'comments' | 'mcp';
export type EditorView = {
  mode: 'write' | 'preview';
  panel: 'document' | 'outline' | 'settings';
  inspector: 'article' | 'block';
  block: string | null;
};
export function adminRoute(url: URL) {
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
export function adminUrl(url: URL, changes: Record<string, string | number | null | undefined>) {
  const next = new URL(url);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === '') next.searchParams.delete(key);
    else next.searchParams.set(key, String(value));
  }
  return next.pathname + next.search + next.hash;
}
export function editorIdentity(url: URL) {
  const r = adminRoute(url);
  return r.editing ? r.tab + ':' + (r.item ?? '$new') : '';
}
