/** Plain text of a block's data, in reading order, for outline previews and word counts. */
export function outlineText(value: unknown): string {
  if (Array.isArray(value)) return value.map(outlineText).filter(Boolean).join(' ');
  if (!value || typeof value !== 'object') return '';
  const node = value as Record<string, unknown>;
  if (typeof node.value === 'string') return node.value;
  return ['data', 'content', 'children', 'items', 'title', 'description']
    .map((key) => outlineText(node[key]))
    .filter(Boolean)
    .join(' ');
}
