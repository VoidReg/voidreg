// Pure revision diff shared by the admin History panel and tests. No Publisle imports so it stays cheap to load.
export type DocBlock = { id: string; type: string; schemaVersion?: number; data?: unknown };
export type DocLike = { blocks?: DocBlock[] } | null | undefined;
export type EntryLike = Record<string, unknown> & { document?: DocLike };

export type FieldChange = { field: string; before: unknown; after: unknown };
export type BlockChange = {
  id: string;
  type: string;
  kind: 'added' | 'removed' | 'changed' | 'moved';
  /** Index in the older revision, if the block existed there. */
  from?: number;
  /** Index in the newer revision, if the block exists there. */
  to?: number;
  moved?: boolean;
  label: string;
  before?: string;
  after?: string;
  words: WordPart[];
};
export type WordPart = { op: 'same' | 'add' | 'del'; text: string };
export type RevisionDiff = {
  fields: FieldChange[];
  blocks: BlockChange[];
  unchanged: number;
  identical: boolean;
};

export const DIFF_FIELDS = [
  'title',
  'summary',
  'category',
  'tags',
  'featured',
  'sort_order',
  'slug',
  'pending_slug',
  'project_ids',
  'topic_id',
  'related_project_ids',
  'repo_url',
  'demo_url',
  'hero_image',
  'hero_alt',
  'hero_caption',
  'social_image',
  'seo_title',
  'seo_description',
  'media_ids'
] as const;

const SKIP_KEYS = new Set(['type', 'id', 'kind', 'activation', 'ref', 'identifier', 'level']);
const MAX_TOKENS = 1500;

function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value as object)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stable((value as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}

export function sameValue(a: unknown, b: unknown): boolean {
  return stable(a ?? null) === stable(b ?? null);
}

/** All human readable text of a block, in document order. */
export function blockText(block: DocBlock): string {
  const parts: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (typeof value === 'string') {
      if (!SKIP_KEYS.has(key)) parts.push(value);
    } else if (Array.isArray(value)) value.forEach((v) => walk(v, key));
    else if (value && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  walk(block.data, '');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function blockLabel(block: DocBlock, max = 80): string {
  const name = block.type.replace(/^.*:/, '');
  const text = blockText(block);
  const excerpt = text.length > max ? text.slice(0, max - 1) + '\u2026' : text;
  return excerpt ? `${name}: ${excerpt}` : name;
}

/** Word level diff using a longest common subsequence, bounded so huge blocks stay cheap. */
export function wordDiff(before: string, after: string): WordPart[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    const out: WordPart[] = [];
    if (before) out.push({ op: 'del', text: before });
    if (after) out.push({ op: 'add', text: after });
    return out;
  }
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const out: WordPart[] = [];
  const push = (op: WordPart['op'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += ' ' + text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) push('del', a[i++]);
    else push('add', b[j++]);
  }
  while (i < a.length) push('del', a[i++]);
  while (j < b.length) push('add', b[j++]);
  return out;
}

/** Ids of the longest increasing run of `positions`, i.e. blocks that kept their relative order. */
function stableOrder(positions: number[]): Set<number> {
  const tails: number[] = [];
  const parent: number[] = new Array(positions.length).fill(-1);
  const tailIndex: number[] = [];
  positions.forEach((p, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < p) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = p;
    tailIndex[lo] = i;
    parent[i] = lo > 0 ? tailIndex[lo - 1] : -1;
  });
  const keep = new Set<number>();
  let at = tailIndex[tails.length - 1] ?? -1;
  while (at >= 0) {
    keep.add(at);
    at = parent[at];
  }
  return keep;
}

export function diffRevisions(older: EntryLike, newer: EntryLike): RevisionDiff {
  const fields: FieldChange[] = [];
  for (const field of DIFF_FIELDS)
    if (!sameValue(older[field], newer[field]))
      fields.push({ field, before: older[field] ?? null, after: newer[field] ?? null });

  const oldBlocks = older.document?.blocks ?? [];
  const newBlocks = newer.document?.blocks ?? [];
  const oldIndex = new Map(oldBlocks.map((b, i) => [b.id, i]));
  const newIndex = new Map(newBlocks.map((b, i) => [b.id, i]));

  const common = newBlocks.filter((b) => oldIndex.has(b.id));
  const keep = stableOrder(common.map((b) => oldIndex.get(b.id) as number));
  const movedIds = new Set(common.filter((_, i) => !keep.has(i)).map((b) => b.id));

  const blocks: BlockChange[] = [];
  let unchanged = 0;
  for (const block of oldBlocks)
    if (!newIndex.has(block.id))
      blocks.push({
        id: block.id,
        type: block.type,
        kind: 'removed',
        from: oldIndex.get(block.id),
        label: blockLabel(block),
        before: blockText(block),
        words: wordDiff(blockText(block), '')
      });
  for (const block of newBlocks) {
    const from = oldIndex.get(block.id);
    const to = newIndex.get(block.id);
    if (from === undefined) {
      blocks.push({
        id: block.id,
        type: block.type,
        kind: 'added',
        to,
        label: blockLabel(block),
        after: blockText(block),
        words: wordDiff('', blockText(block))
      });
      continue;
    }
    const before = oldBlocks[from];
    const edited =
      before.type !== block.type ||
      !sameValue(before.data, block.data) ||
      (before.schemaVersion ?? 1) !== (block.schemaVersion ?? 1);
    const moved = movedIds.has(block.id);
    if (!edited && !moved) {
      unchanged++;
      continue;
    }
    blocks.push({
      id: block.id,
      type: block.type,
      kind: edited ? 'changed' : 'moved',
      from,
      to,
      moved,
      label: blockLabel(block),
      before: blockText(before),
      after: blockText(block),
      words: wordDiff(blockText(before), blockText(block))
    });
  }
  return { fields, blocks, unchanged, identical: fields.length === 0 && blocks.length === 0 };
}
