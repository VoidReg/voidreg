/**
 * Deterministic, dependency-free layout for the knowledge map. It looks like routed circuitry:
 * projects are chips on a horizontal bus, each project's posts hang below it on a vertical
 * trace, and project-to-project links run above the chips in tiers with 45 degree corners.
 * Everything is a pure function of the graph, so it renders the same on the server and the client.
 */
export type GraphNode = {
  id: string;
  kind: 'project' | 'post';
  slug: string;
  title: string;
  category: string;
  tags: string[];
  published_at: string | null;
  draft: boolean;
  changed: boolean;
};
export type GraphEdge = {
  source: string;
  target: string;
  kind: 'post-project' | 'related' | 'shared-tag';
  weight: number;
};
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[]; draft?: boolean };

export const CHIP_W = 176;
export const CHIP_H = 66;
const GAP = 48;
const MARGIN = 32;
const POST_STEP = 30;
const TIER_STEP = 16;
const STUB_STEP = 12;
const TOP_PAD = 24;
const STEM_X = 16;
const MAX_SHARED_EDGES = 24;

export type Chip = {
  id: string;
  node: GraphNode | null; // null for the standalone lane header
  x: number;
  y: number;
  lines: string[];
  category: string;
};
export type Pad = {
  key: string;
  node: GraphNode;
  projectId: string | null;
  x: number;
  y: number;
  label: string;
};
export type Trace = {
  key: string;
  kind: 'stem' | 'related' | 'shared-tag';
  /** Node ids this trace connects; used for highlighting. */
  ends: [string, string];
  d: string;
  weight: number;
  /** Terminal pad positions for chip-to-chip traces. */
  terminals: [number, number][];
};
export type Layout = {
  width: number;
  height: number;
  chips: Chip[];
  pads: Pad[];
  traces: Trace[];
  hasStandalone: boolean;
};
export type Outline = {
  projects: { node: GraphNode; posts: GraphNode[]; related: GraphNode[]; shared: GraphNode[] }[];
  standalone: GraphNode[];
};

export const STANDALONE_ID = 'standalone-notes';

/** Wraps text on word boundaries into at most `maxLines`, ending in an ellipsis if cut. */
export function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  const flush = () => {
    if (current) lines.push(current);
    current = '';
  };
  for (const raw of words) {
    // A single token longer than a line is hard-cut.
    const word = raw.length > maxChars ? raw.slice(0, maxChars - 1) + '\u2026' : raw;
    if (!current) current = word;
    else if ((current + ' ' + word).length <= maxChars) current += ' ' + word;
    else {
      flush();
      current = word;
    }
  }
  flush();
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] =
    (last.length >= maxChars ? last.slice(0, maxChars - 1) : last).replace(/[\s.,;:]+$/, '') +
    '\u2026';
  return kept;
}

export function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars - 1).trimEnd() + '\u2026';
}

const byDate = (a: GraphNode, b: GraphNode) => {
  // Oldest first so the trace reads as a timeline going down; undated drafts last.
  if (a.published_at && b.published_at) return a.published_at.localeCompare(b.published_at);
  if (a.published_at) return -1;
  if (b.published_at) return 1;
  return a.slug.localeCompare(b.slug);
};

function groups(graph: Graph) {
  const projects = graph.nodes
    .filter((n) => n.kind === 'project')
    .sort(
      (a, b) =>
        a.category.toLowerCase().localeCompare(b.category.toLowerCase()) ||
        a.title.localeCompare(b.title)
    );
  const posts = new Map(graph.nodes.filter((n) => n.kind === 'post').map((n) => [n.id, n]));
  const projectIds = new Set(projects.map((p) => p.id));
  const postsOf = new Map<string, GraphNode[]>(projects.map((p) => [p.id, []]));
  const linked = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'post-project') continue;
    const post = posts.get(edge.source);
    if (post && projectIds.has(edge.target)) {
      postsOf.get(edge.target)!.push(post);
      linked.add(post.id);
    }
  }
  for (const list of postsOf.values()) list.sort(byDate);
  const standalone = [...posts.values()].filter((p) => !linked.has(p.id)).sort(byDate);
  return { projects, posts, postsOf, standalone };
}

export function outlineOf(graph: Graph): Outline {
  const { projects, postsOf, standalone } = groups(graph);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const neighbours = (id: string, kind: GraphEdge['kind']) =>
    graph.edges
      .filter((e) => e.kind === kind && (e.source === id || e.target === id))
      .map((e) => byId.get(e.source === id ? e.target : e.source))
      .filter((n): n is GraphNode => Boolean(n))
      .sort((a, b) => a.title.localeCompare(b.title));
  return {
    projects: projects.map((node) => ({
      node,
      posts: postsOf.get(node.id) ?? [],
      related: neighbours(node.id, 'related'),
      shared: neighbours(node.id, 'shared-tag')
    })),
    standalone
  };
}

export function layoutGraph(graph: Graph): Layout {
  const { projects, postsOf, standalone } = groups(graph);
  const columns = projects.length + (standalone.length ? 1 : 0);
  const colX = (i: number) => MARGIN + i * (CHIP_W + GAP);
  const chipX = new Map(projects.map((p, i) => [p.id, colX(i)]));

  // Chip-to-chip links: explicit first, then a bounded set of shared-technology links.
  const explicit = graph.edges.filter(
    (e) => e.kind === 'related' && chipX.has(e.source) && chipX.has(e.target)
  );
  const shared = graph.edges
    .filter((e) => e.kind === 'shared-tag' && chipX.has(e.source) && chipX.has(e.target))
    .sort((a, b) => {
      const span = (e: GraphEdge) => Math.abs(chipX.get(e.source)! - chipX.get(e.target)!);
      return b.weight - a.weight || span(a) - span(b);
    })
    .slice(0, MAX_SHARED_EDGES);
  const links = [...explicit, ...shared];

  // Stubs: each chip spreads its top connection points, ordered by where the link goes.
  const incident = new Map<string, GraphEdge[]>();
  for (const e of links)
    for (const id of [e.source, e.target]) incident.set(id, [...(incident.get(id) ?? []), e]);
  const stubX = new Map<string, number>(); // `${edgeKey}|${chipId}` -> x
  const edgeKey = (e: GraphEdge) => `${e.kind}:${e.source}:${e.target}`;
  for (const [id, list] of incident) {
    const here = chipX.get(id)!;
    const other = (e: GraphEdge) => chipX.get(e.source === id ? e.target : e.source)!;
    list.sort((a, b) => other(a) - other(b) || edgeKey(a).localeCompare(edgeKey(b)));
    const step = Math.min(STUB_STEP, (CHIP_W - 32) / Math.max(1, list.length - 1));
    list.forEach((e, i) =>
      stubX.set(`${edgeKey(e)}|${id}`, here + CHIP_W / 2 + (i - (list.length - 1) / 2) * step)
    );
  }

  // Channel routing: lowest tier whose intervals do not overlap (with padding).
  const tiers: [number, number][][] = [];
  const tierOf = new Map<string, number>();
  const ends = (e: GraphEdge): [number, number] => {
    const a = stubX.get(`${edgeKey(e)}|${e.source}`)!;
    const b = stubX.get(`${edgeKey(e)}|${e.target}`)!;
    return a < b ? [a, b] : [b, a];
  };
  const place = (batch: GraphEdge[]) =>
    [...batch]
      .sort(
        (a, b) => ends(a)[1] - ends(a)[0] - (ends(b)[1] - ends(b)[0]) || ends(a)[0] - ends(b)[0]
      )
      .forEach((e) => {
        const [l, r] = ends(e);
        let t = 0;
        while (tiers[t]?.some(([a, b]) => l - 6 < b && r + 6 > a)) t++;
        (tiers[t] ??= []).push([l, r]);
        tierOf.set(edgeKey(e), t);
      });
  place(explicit);
  place(shared);

  const tierCount = Math.max(1, tiers.length);
  const chipY = TOP_PAD + tierCount * TIER_STEP + 20;
  const bottom = chipY + CHIP_H;
  const postRows = Math.max(0, ...[...postsOf.values()].map((p) => p.length), standalone.length);
  const padY = (k: number) => bottom + 30 + k * POST_STEP;

  const chips: Chip[] = projects.map((node, i) => ({
    id: node.id,
    node,
    x: colX(i),
    y: chipY,
    lines: wrap(node.title, 19, 2),
    category: truncate(node.category.toUpperCase(), 22)
  }));
  const pads: Pad[] = [];
  const traces: Trace[] = [];
  const stem = (ownerId: string, x: number, post: GraphNode, k: number) => {
    const px = x + STEM_X;
    pads.push({
      key: `${ownerId}|${post.id}`,
      node: post,
      projectId: ownerId === STANDALONE_ID ? null : ownerId,
      x: px,
      y: padY(k),
      label: truncate(post.title, 26)
    });
    traces.push({
      key: `stem:${ownerId}:${post.id}`,
      kind: 'stem',
      ends: [ownerId, post.id],
      d: `M${px} ${bottom}V${padY(k)}`,
      weight: 1,
      terminals: []
    });
  };
  projects.forEach((p, i) => postsOf.get(p.id)!.forEach((post, k) => stem(p.id, colX(i), post, k)));
  if (standalone.length) {
    const x = colX(projects.length);
    chips.push({
      id: STANDALONE_ID,
      node: null,
      x,
      y: chipY,
      lines: ['Standalone notes'],
      category: 'NO PROJECT'
    });
    standalone.forEach((post, k) => stem(STANDALONE_ID, x, post, k));
  }

  for (const e of links) {
    const [l, r] = ends(e);
    const tierY = chipY - 16 - tierOf.get(edgeKey(e))! * TIER_STEP;
    const c = Math.min(6, (r - l) / 2);
    const d =
      r - l >= 2 * c && c > 0
        ? `M${l} ${chipY}V${tierY + c}L${l + c} ${tierY}H${r - c}L${r} ${tierY + c}V${chipY}`
        : `M${l} ${chipY}V${tierY}H${r}V${chipY}`;
    traces.push({
      key: edgeKey(e),
      kind: e.kind === 'related' ? 'related' : 'shared-tag',
      ends: [e.source, e.target],
      d,
      weight: e.weight,
      terminals: [
        [l, chipY],
        [r, chipY]
      ]
    });
  }

  return {
    width: Math.max(columns, 1) * (CHIP_W + GAP) - GAP + MARGIN * 2,
    height: (postRows ? padY(postRows - 1) : bottom) + MARGIN,
    chips,
    pads,
    traces,
    hasStandalone: standalone.length > 0
  };
}

/** Node ids lit when `id` is active: itself plus everything directly linked to it. */
export function neighbourhood(graph: Graph, id: string): Set<string> {
  const lit = new Set([id]);
  for (const e of graph.edges) {
    if (e.source === id) lit.add(e.target);
    if (e.target === id) lit.add(e.source);
  }
  return lit;
}
