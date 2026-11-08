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
    body: match[2].trim() + "\n",
  };
}
