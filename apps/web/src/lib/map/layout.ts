/**
 * Graph model of the knowledge map: the API graph types, a normalised model with adjacency maps,
 * filters, and the text outline. The board layout built on top of it lives in `board.ts`.
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

/** Projects a URL may keep expanded at once (matches the server). */
export const MAX_OPEN = 8;
export const UNCATEGORIZED = 'Uncategorized';

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
