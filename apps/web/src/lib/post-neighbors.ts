/** Neighbours in a newest-first list. Drafts are skipped: they have no public page yet. */
export function publishedNeighbors<T extends { slug: string; status: string }>(
  items: readonly T[],
  slug: string
): { newer: T | null; older: T | null } {
  const index = items.findIndex((item) => item.slug === slug);
  if (index < 0) return { newer: null, older: null };
  let newer: T | null = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (items[i].status === 'published') {
      newer = items[i];
      break;
    }
  }
  const older = items.slice(index + 1).find((item) => item.status === 'published') ?? null;
  return { newer, older };
}
