/**
 * Deterministic, dependency-free layout for the knowledge map. Projects are grouped into
 * category lanes. Inside a lane, projects are chips on a bounded grid, each row has its own
 * routing channel above it for project-to-project links, and a project's posts hang below its
 * chip only while it is expanded. Everything is a pure function of the model, so it renders the
 * same on the server and the client and its width never grows with the catalogue.
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
  post_count?: number;
};
export type GraphEdge = {
  source: string;
  target: string;
  kind: 'post-project' | 'related' | 'shared-tag';
  weight: number;
};
export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  draft?: boolean;
  mode?: 'full' | 'summary' | 'project';
  totals?: { projects: number; posts: number };
  unlinked_posts?: number;
  posts_total?: number;
  project?: string;
};

export const CHIP_W = 176;
export const CHIP_H = 84;
/** Chips per row, which bounds a lane to roughly 1140 px however many projects it holds. */
export const PER_ROW = 5;
/** Projects shown per lane before "Show more". */
export const LANE_PAGE = 30;
/** Posts listed under an expanded project before a link to the rest. */
export const POSTS_SHOWN = 12;
/** Projects a URL may keep expanded at once (matches the server). */
export const MAX_OPEN = 8;
const GAP = 48;
const MARGIN = 32;
const POST_STEP = 30;
const TIER_STEP = 16;
const STUB_STEP = 12;
const STEM_X = 16;
const ROW_GAP = 28;
const MAX_SHARED_EDGES = 24;
export const UNCATEGORIZED = 'Uncategorized';

export type Chip = {
  id: string;
  node: GraphNode;
  x: number;
  y: number;
  lines: string[];
  category: string;
};
export type Pad = {
  key: string;
  node: GraphNode;
  projectId: string;
  x: number;
  y: number;
  label: string;
};
/** "N more posts" row under an expanded project. */
export type MorePad = {
  key: string;
  projectId: string;
  slug: string;
  x: number;
  y: number;
  count: number;
};
/** Expand or collapse control on a chip. */
export type Toggle = {
  key: string;
  id: string;
  slug: string;
  x: number;
  y: number;
  open: boolean;
  count: number;
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
  mores: MorePad[];
  toggles: Toggle[];
  traces: Trace[];
};

export type MapModel = {
  mode: 'full' | 'summary';
  /** Sorted by category then title. */
  projects: GraphNode[];
  /** Posts known per project: all of them in full mode, only expanded projects in summary mode. */
  postsOf: Map<string, { items: GraphNode[]; total: number }>;
  /** Posts that follow no project (full mode only). */
  standalone: GraphNode[];
  unlinked: number;
  /** Project-to-project links. */
  edges: GraphEdge[];
  totals: { projects: number; posts: number };
  adjacency: Map<string, Set<string>>;
};
export type MapFilter = { q: string; tag: string; category: string };
export type Lane = { name: string; projects: GraphNode[] };

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

export const categoryOf = (node: GraphNode) => node.category.trim() || UNCATEGORIZED;

/**
 * Normalises any graph response into one model. `expanded` holds per-project graphs fetched for
 * projects whose posts are open while the main graph is only a summary.
 */
export function buildModel(graph: Graph, expanded: Graph[] = []): MapModel {
  const projects = graph.nodes
    .filter((n) => n.kind === 'project')
    .sort(
      (a, b) =>
        categoryOf(a).toLowerCase().localeCompare(categoryOf(b).toLowerCase()) ||
        a.title.localeCompare(b.title) ||
        a.slug.localeCompare(b.slug)
    );
  const projectIds = new Set(projects.map((p) => p.id));
  const postsOf = new Map<string, { items: GraphNode[]; total: number }>();
  const unlinkedIds = new Set<string>();
  const posts = new Map(graph.nodes.filter((n) => n.kind === 'post').map((n) => [n.id, n]));
  const full = graph.mode !== 'summary';
  if (full) {
    for (const p of projects) postsOf.set(p.id, { items: [], total: 0 });
    const linked = new Set<string>();
    for (const e of graph.edges) {
      if (e.kind !== 'post-project') continue;
      const post = posts.get(e.source);
      if (post && projectIds.has(e.target)) {
        postsOf.get(e.target)!.items.push(post);
        linked.add(post.id);
      }
    }
    for (const entry of postsOf.values()) {
      entry.items.sort(byDate);
      entry.total = entry.items.length;
    }
    for (const id of posts.keys()) if (!linked.has(id)) unlinkedIds.add(id);
  }
  const edgeKey = (e: GraphEdge) => `${e.kind}:${e.source}:${e.target}`;
  const edges = new Map<string, GraphEdge>();
  const addEdge = (e: GraphEdge) => {
    if (e.kind === 'post-project') return;
    if (projectIds.has(e.source) && projectIds.has(e.target)) edges.set(edgeKey(e), e);
  };
  graph.edges.forEach(addEdge);
  for (const g of expanded) {
    const items = g.nodes.filter((n) => n.kind === 'post').sort(byDate);
    if (g.project && projectIds.has(g.project) && (!full || !postsOf.has(g.project)))
      postsOf.set(g.project, { items, total: g.posts_total ?? items.length });
    g.edges.forEach(addEdge);
  }
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const e of edges.values()) {
    link(e.source, e.target);
    link(e.target, e.source);
  }
  for (const [projectId, entry] of postsOf)
    for (const post of entry.items) {
      link(projectId, post.id);
      link(post.id, projectId);
    }
  return {
    mode: full ? 'full' : 'summary',
    projects,
    postsOf,
    standalone: [...unlinkedIds].map((id) => posts.get(id)!).sort(byDate),
    unlinked: full ? unlinkedIds.size : (graph.unlinked_posts ?? 0),
    edges: [...edges.values()],
    totals: graph.totals ?? {
      projects: projects.length,
      posts: posts.size
    },
    adjacency
  };
}

export const emptyFilter: MapFilter = { q: '', tag: '', category: '' };

export function matches(node: GraphNode, filter: MapFilter): boolean {
  if (filter.category && categoryOf(node).toLowerCase() !== filter.category.toLowerCase())
    return false;
  if (filter.tag && !node.tags.some((t) => t.toLowerCase() === filter.tag.toLowerCase()))
    return false;
  const q = filter.q.trim().toLowerCase();
  return (
    !q ||
    node.title.toLowerCase().includes(q) ||
    node.slug.includes(q) ||
    node.tags.some((t) => t.toLowerCase().includes(q))
  );
}

/** Category lanes of the projects that pass the filter, in category then title order. */
export function lanesOf(model: MapModel, filter: MapFilter = emptyFilter): Lane[] {
  const lanes = new Map<string, Lane>();
  for (const project of model.projects) {
    if (!matches(project, filter)) continue;
    const name = categoryOf(project);
    const key = name.toLowerCase();
    if (!lanes.has(key)) lanes.set(key, { name, projects: [] });
    lanes.get(key)!.projects.push(project);
  }
  return [...lanes.values()];
}

/** Category names and sizes, for the filter control, regardless of the current filter. */
export function categoriesOf(model: MapModel): { name: string; count: number }[] {
  return lanesOf(model).map((lane) => ({ name: lane.name, count: lane.projects.length }));
}

/** Most used technologies, for the technology filter suggestions. */
export function technologiesOf(model: MapModel, limit = 100): string[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const project of model.projects)
    for (const tag of project.tags) {
      const entry = counts.get(tag.toLowerCase()) ?? { name: tag, count: 0 };
      entry.count++;
      counts.set(tag.toLowerCase(), entry);
    }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((t) => t.name);
}

export type LayoutOptions = {
  /** Ids of projects whose posts are listed. */
  open: ReadonlySet<string>;
  /** Projects laid out; the rest of the lane waits behind "Show more". */
  limit?: number;
  showShared?: boolean;
};

/** Lays one lane out on a bounded grid. Height grows with rows, width does not. */
export function layoutLane(projects: GraphNode[], model: MapModel, options: LayoutOptions): Layout {
  const limit = options.limit ?? LANE_PAGE;
  const shown = projects.slice(0, limit);
  const columns = Math.max(1, Math.min(PER_ROW, shown.length));
  const colX = (i: number) => MARGIN + i * (CHIP_W + GAP);
  const chips: Chip[] = [];
  const pads: Pad[] = [];
  const mores: MorePad[] = [];
  const toggles: Toggle[] = [];
  const traces: Trace[] = [];
  const edgeKey = (e: GraphEdge) => `${e.kind}:${e.source}:${e.target}`;
  const usable = (e: GraphEdge) => options.showShared || e.kind === 'related';
  const linkEdges = model.edges.filter(usable);
  let sharedBudget = MAX_SHARED_EDGES;
  let top = MARGIN / 2;

  for (let start = 0; start < shown.length; start += PER_ROW) {
    const row = shown.slice(start, start + PER_ROW);
    const chipX = new Map(row.map((p, i) => [p.id, colX(i)]));
    const links = linkEdges.filter((e) => chipX.has(e.source) && chipX.has(e.target));
    const explicit = links.filter((e) => e.kind === 'related');
    const shared = links
      .filter((e) => e.kind === 'shared-tag')
      .sort((a, b) => b.weight - a.weight || edgeKey(a).localeCompare(edgeKey(b)))
      .slice(0, Math.max(0, sharedBudget));
    sharedBudget -= shared.length;
    const routed = [...explicit, ...shared];

    // Stubs: each chip spreads its top connection points, ordered by where the link goes.
    const incident = new Map<string, GraphEdge[]>();
    for (const e of routed)
      for (const id of [e.source, e.target]) incident.set(id, [...(incident.get(id) ?? []), e]);
    const stubX = new Map<string, number>();
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
          (a, b) =>
            ends(a)[1] - ends(a)[0] - (ends(b)[1] - ends(b)[0]) ||
            ends(a)[0] - ends(b)[0] ||
            edgeKey(a).localeCompare(edgeKey(b))
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

    const chipY = top + (tiers.length ? tiers.length * TIER_STEP + 20 : 8);
    const bottom = chipY + CHIP_H;
    let postRows = 0;
    row.forEach((node, i) => {
      const x = colX(i);
      chips.push({
        id: node.id,
        node,
        x,
        y: chipY,
        lines: wrap(node.title, 19, 2),
        category: truncate(categoryOf(node).toUpperCase(), 22)
      });
      const entry = model.postsOf.get(node.id);
      const count = entry?.total ?? node.post_count ?? 0;
      const isOpen = options.open.has(node.id);
      if (count > 0)
        toggles.push({
          key: `toggle:${node.id}`,
          id: node.id,
          slug: node.slug,
          x: x + 12,
          y: chipY + CHIP_H - 12,
          open: isOpen,
          count
        });
      if (!isOpen || !entry) return;
      const listed = entry.items.slice(0, POSTS_SHOWN);
      const padY = (k: number) => bottom + 30 + k * POST_STEP;
      const px = x + STEM_X;
      listed.forEach((post, k) => {
        pads.push({
          key: `${node.id}|${post.id}`,
          node: post,
          projectId: node.id,
          x: px,
          y: padY(k),
          label: truncate(post.title, 26)
        });
        traces.push({
          key: `stem:${node.id}:${post.id}`,
          kind: 'stem',
          ends: [node.id, post.id],
          d: `M${px} ${bottom}V${padY(k)}`,
          weight: 1,
          terminals: []
        });
      });
      const rest = entry.total - listed.length;
      let rows = listed.length;
      if (rest > 0) {
        mores.push({
          key: `more:${node.id}`,
          projectId: node.id,
          slug: node.slug,
          x: px,
          y: padY(listed.length),
          count: rest
        });
        traces.push({
          key: `stem:${node.id}:more`,
          kind: 'stem',
          ends: [node.id, node.id],
          d: `M${px} ${bottom}V${padY(listed.length)}`,
          weight: 1,
          terminals: []
        });
        rows++;
      }
      postRows = Math.max(postRows, rows);
    });

    for (const e of routed) {
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
    top = (postRows ? bottom + 30 + (postRows - 1) * POST_STEP + 14 : bottom) + ROW_GAP;
  }

  return {
    width: columns * (CHIP_W + GAP) - GAP + MARGIN * 2,
    height: Math.max(0, top - ROW_GAP + MARGIN / 2),
    chips,
    pads,
    mores,
    toggles,
    traces
  };
}

/** Node ids lit when `id` is active: itself plus everything directly linked to it. */
export function neighbourhood(model: MapModel, id: string): Set<string> {
  const lit = new Set([id]);
  for (const other of model.adjacency.get(id) ?? []) lit.add(other);
  return lit;
}

export type OutlineGroup = {
  name: string;
  projects: {
    node: GraphNode;
    posts: GraphNode[];
    postsTotal: number;
    related: GraphNode[];
    shared: GraphNode[];
  }[];
};

/** Text outline grouped by category, built from adjacency maps so cost stays linear. */
export function outlineOf(model: MapModel, filter: MapFilter = emptyFilter): OutlineGroup[] {
  const byId = new Map(model.projects.map((p) => [p.id, p]));
  const related = new Map<string, GraphNode[]>();
  const shared = new Map<string, GraphNode[]>();
  const add = (map: Map<string, GraphNode[]>, from: string, to: string) => {
    const node = byId.get(to);
    if (!node) return;
    if (!map.has(from)) map.set(from, []);
    map.get(from)!.push(node);
  };
  for (const e of model.edges) {
    const map = e.kind === 'related' ? related : shared;
    add(map, e.source, e.target);
    add(map, e.target, e.source);
  }
  for (const list of [...related.values(), ...shared.values()])
    list.sort((a, b) => a.title.localeCompare(b.title));
  return lanesOf(model, filter).map((lane) => ({
    name: lane.name,
    projects: lane.projects.map((node) => {
      const entry = model.postsOf.get(node.id);
      return {
        node,
        posts: entry?.items ?? [],
        postsTotal: entry?.total ?? node.post_count ?? 0,
        related: related.get(node.id) ?? [],
        shared: shared.get(node.id) ?? []
      };
    })
  }));
}

/** Parses the `open` URL parameter into at most MAX_OPEN valid project slugs. */
export function parseOpen(value: string | null | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 120)
    )
  ].slice(0, MAX_OPEN);
}

/** The `open` list after toggling `slug`; the oldest entry drops out when the cap is reached. */
export function toggleOpen(open: readonly string[], slug: string): string[] {
  if (open.includes(slug)) return open.filter((s) => s !== slug);
  return [...open, slug].slice(-MAX_OPEN);
}
