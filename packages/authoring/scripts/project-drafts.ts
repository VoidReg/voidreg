// Reads the project write-ups in docs/drafts/projects. Each file is YAML-style front matter
// (the project fields) followed by a Markdown body that becomes the project document.
// Pure and dependency-free so tests and the import script share one parser.

export interface ProjectDraft {
  slug: string;
  title: string;
  category: string;
  summary: string;
  tags: string[];
  repo_url: string | null;
  featured: boolean;
  sort_order: number;
  related: string[];
  /** Cover image: an `assets/...` file next to the drafts, or an http(s) or `/media/` URL. */
  hero_image: string | null;
  /** Alt text and caption stored on the cover's media asset. */
  hero_alt: string;
  hero_caption: string;
  body: string;
}

const KEY = /^([a-z_]+):\s*(.*)$/;

function list(value: string): string[] {
  const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  return inner
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseDraft(source: string): ProjectDraft {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(
    source.replace(/\r\n/g, "\n"),
  );
  if (!match) throw new Error("Draft needs front matter between --- lines");
  const fields = new Map<string, string>();
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const found = KEY.exec(line);
    if (!found) throw new Error(`Unreadable front matter line: ${line}`);
    fields.set(found[1], found[2].trim());
  }
  const need = (name: string) => {
    const value = fields.get(name);
    if (value === undefined || value === "")
      throw new Error(`Front matter is missing "${name}"`);
    return value;
  };
  const sortOrder = Number(need("sort_order"));
  if (!Number.isInteger(sortOrder))
    throw new Error("sort_order must be a whole number");
  const featured = need("featured");
  if (featured !== "true" && featured !== "false")
    throw new Error("featured must be true or false");
  return {
    slug: need("slug"),
    title: need("title"),
    category: need("category"),
    summary: need("summary"),
    tags: list(need("tags")),
    repo_url: fields.get("repo_url") || null,
    featured: featured === "true",
    sort_order: sortOrder,
    related: list(fields.get("related") ?? ""),
    hero_image: fields.get("hero_image") || null,
    hero_alt: fields.get("hero_alt") ?? "",
    hero_caption: fields.get("hero_caption") ?? "",
    body: match[2].trim() + "\n",
  };
}

const LOCAL = /^assets\/[A-Za-z0-9._\/-]+\.(png|jpg)$/;
const BODY_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;

export function isLocalAsset(ref: string): boolean {
  return LOCAL.test(ref) && !ref.includes("..");
}

/** Image files a draft refers to as `assets/...`, cover first, each once. */
export function localAssets(draft: ProjectDraft): string[] {
  const refs = new Set<string>();
  if (draft.hero_image && isLocalAsset(draft.hero_image))
    refs.add(draft.hero_image);
  for (const match of draft.body.matchAll(BODY_IMAGE))
    if (isLocalAsset(match[2])) refs.add(match[2]);
  return [...refs];
}

/** Replaces `assets/...` image references in the body with the given media URLs. */
export function withMediaUrls(body: string, urls: Map<string, string>): string {
  return body.replace(BODY_IMAGE, (whole, alt, ref, title) => {
    const url = urls.get(ref);
    if (!url) return whole;
    return `![${alt}](${url}${title ? ` "${title}"` : ""})`;
  });
}
