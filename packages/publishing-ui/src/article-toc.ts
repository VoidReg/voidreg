/** One heading that can appear in a table of contents. */
export type TocHeading = {
  level: number;
  text: string;
  id: string;
};

/** A heading plus the deeper headings that belong under it. */
export type TocEntry = TocHeading & { children: TocEntry[] };

/** A heading as read from the rendered article, before an id is chosen. */
export type HeadingReading = {
  level: number;
  text: string;
  id: string;
};

const slugLength = 80;

/** A URL fragment for a heading, using letters, digits, and hyphens. */
export function headingSlug(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, slugLength);
  return slug || 'section';
}

/** A slug that does not collide with ids already used in this article. */
export function uniqueHeadingId(text: string, used: Set<string>): string {
  const base = headingSlug(text);
  let id = base;
  let n = 2;
  while (used.has(id)) {
    const suffix = `-${n}`;
    id = `${base.slice(0, slugLength - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(id);
  return id;
}

/**
 * Keep headings from level 2 through 4, skip blank ones, and keep an id the
 * heading already has. Missing ids are filled in and reserved against the rest.
 */
export function outlineFromReadings(readings: readonly HeadingReading[]): {
  outline: TocEntry[];
  assigned: (string | null)[];
} {
  const assigned: (string | null)[] = readings.map(() => null);
  const used = new Set(readings.map((reading) => reading.id).filter((id) => id.length > 0));
  const flat: TocHeading[] = [];
  readings.forEach((reading, index) => {
    if (reading.level < 2 || reading.level > 4) return;
    const text = reading.text.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const id = reading.id || uniqueHeadingId(text, used);
    assigned[index] = id;
    flat.push({ level: reading.level, text, id });
  });
  return { outline: nestHeadings(flat), assigned };
}

/** Place each heading under the nearest shallower heading before it. */
export function nestHeadings(headings: readonly TocHeading[]): TocEntry[] {
  const root: TocEntry[] = [];
  const stack: TocEntry[] = [];
  for (const heading of headings) {
    const entry: TocEntry = { ...heading, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(entry);
    else root.push(entry);
    stack.push(entry);
  }
  return root;
}

/** How many headings the outline contains, including nested ones. */
export function tocCount(entries: readonly TocEntry[]): number {
  return entries.reduce((count, entry) => count + 1 + tocCount(entry.children), 0);
}
