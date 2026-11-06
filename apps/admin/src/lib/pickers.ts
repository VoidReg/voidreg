// Pure helpers for the chip pickers (tags, project links). No framework imports.
export type Option = { value: string; label: string; hint?: string; create?: boolean };

/** Collapse whitespace; the server applies the same rule and the final length check. */
export function normalizeTag(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function hasValue(values: readonly string[], value: string): boolean {
  return values.some((v) => same(v, value));
}

/** Appends unless already present (case-insensitive) or at the limit. Returns the same array when unchanged. */
export function addValue(values: readonly string[], value: string, max = Infinity): string[] {
  if (!value || hasValue(values, value) || values.length >= max) return values as string[];
  return [...values, value];
}

export function removeValue(values: readonly string[], value: string): string[] {
  return values.filter((v) => !same(v, value));
}

/**
 * Options shown under the input: server results that are not selected yet, plus a leading
 * "create" option when creation is allowed and no existing option matches the typed text exactly.
 */
export function buildOptions(
  results: readonly Option[],
  selected: readonly string[],
  query: string,
  createValue?: (raw: string) => string
): Option[] {
  const options = results.filter((option) => !hasValue(selected, option.value));
  const typed = createValue ? createValue(query) : '';
  if (typed && !hasValue(selected, typed) && !results.some((option) => same(option.value, typed)))
    options.unshift({ value: typed, label: typed, create: true });
  return options;
}

/** Wraps the index into the option list for arrow key movement. */
export function moveActive(current: number, delta: 1 | -1, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}
