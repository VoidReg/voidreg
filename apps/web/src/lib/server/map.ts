import { MAX_OPEN, parseOpen, type Graph } from '$lib/map/layout';

/**
 * Loads the map for a page. The graph is a full graph for small catalogues and a summary for
 * large ones; in summary mode only the projects listed in `?open=` also load their posts, so the
 * work follows what is on screen. Filters are read from the URL and applied by the page.
 */
export async function loadMap(url: URL, fetchGraph: (query: string) => Promise<Graph>) {
  const full = await fetchGraph('');
  // Summary projects never use their publish date, and the payload travels in the page.
  const graph: Graph =
    full.mode === 'summary'
      ? { ...full, nodes: full.nodes.map((node) => ({ ...node, published_at: null })) }
      : full;
  const open = parseOpen(url.searchParams.get('open'));
  const expanded =
    graph.mode === 'summary'
      ? (
          await Promise.all(
            open
              .slice(0, MAX_OPEN)
              .map((slug) => fetchGraph('?project=' + encodeURIComponent(slug)).catch(() => null))
          )
        ).filter((g): g is Graph => g !== null)
      : [];
  return {
    graph,
    expanded,
    open,
    filter: {
      q: (url.searchParams.get('q') ?? '').slice(0, 80),
      tag: (url.searchParams.get('tag') ?? '').slice(0, 40),
      category: (url.searchParams.get('category') ?? '').slice(0, 80)
    },
    focus: url.searchParams.get('focus') ?? ''
  };
}
