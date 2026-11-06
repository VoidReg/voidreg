import { MAX_OPEN, parseOpen, type Graph } from '$lib/map/layout';

/**
 * Loads the map for a page. The graph is a full graph for small catalogues and a summary for
 * large ones; only the project in `?focus=` also loads its posts, so the work follows what is on
 * screen. Filters are read from the URL and applied by the page.
 */
export async function loadMap(url: URL, fetchGraph: (query: string) => Promise<Graph>) {
  const full = await fetchGraph('');
  // Summary projects never use their publish date, and the payload travels in the page.
  const graph: Graph =
    full.mode === 'summary'
      ? { ...full, nodes: full.nodes.map((node) => ({ ...node, published_at: null })) }
      : full;
  // The focused project (and any legacy `open` projects) load their posts and shared-technology
  // links up front, so a shared link renders the same circuit on the server. Later focus changes
  // fetch on demand through the map data route.
  const focus = parseOpen(url.searchParams.get('focus')).slice(0, 1);
  const slugs = [...new Set([...focus, ...parseOpen(url.searchParams.get('open'))])].slice(
    0,
    MAX_OPEN
  );
  const known = new Set(graph.nodes.filter((n) => n.kind === 'project').map((n) => n.slug));
  const wanted = slugs.filter((slug) => known.has(slug));
  const results = await Promise.all(
    wanted.map((slug) =>
      fetchGraph('?project=' + encodeURIComponent(slug) + '&links=shared').catch(() => null)
    )
  );
  const expanded = results.filter((g): g is Graph => g !== null);
  const loaded = wanted.filter((_, i) => results[i] !== null);
  return {
    graph,
    expanded,
    loaded,
    filter: {
      q: (url.searchParams.get('q') ?? '').slice(0, 80),
      tag: (url.searchParams.get('tag') ?? '').slice(0, 40),
      category: (url.searchParams.get('category') ?? '').slice(0, 80)
    },
    focus: wanted[0] ?? ''
  };
}
