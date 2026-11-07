import { absolute, describe } from '../seo';
import { markdownSource, type Exportable } from './markdown';

type Described = Exportable & {
  summary: string;
  category?: string;
  tags?: string[];
  updated_at?: string;
  published_at?: string | null;
  repo_url?: string | null;
  demo_url?: string | null;
  seo_description?: string;
};

type Link = { slug: string; title: string; summary?: string };

const quote = (value: string) => JSON.stringify(value);

/** YAML front matter. Strings are JSON-quoted, which is valid YAML, so nothing needs escaping. */
export function frontMatter(fields: Record<string, string | string[] | null | undefined>) {
  const lines = Object.entries(fields)
    .filter(([, value]) => value && (!Array.isArray(value) || value.length))
    .map(([key, value]) =>
      Array.isArray(value)
        ? key + ': [' + value.map(quote).join(', ') + ']'
        : key + ': ' + quote(value as string)
    );
  return '---\n' + lines.join('\n') + '\n---\n';
}

function body(item: Described) {
  // The exporter writes its own front matter; this module writes the one readers get.
  const source = markdownSource(item)
    .source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .trim();
  // Published documents usually open with their own title; keep exactly one top heading.
  return /^#\s/.test(source) ? source : '# ' + item.title + '\n\n' + source;
}

function related(heading: string, base: string, items: Link[]) {
  if (!items.length) return '';
  return (
    '\n\n## ' +
    heading +
    '\n\n' +
    items
      .map(
        (item) =>
          '- [' +
          item.title +
          '](' +
          absolute(base + item.slug + '.md') +
          ')' +
          (item.summary ? ': ' + describe(item.summary) : '')
      )
      .join('\n')
  );
}

export function articleMarkdown(article: Described, projects: Link[] = []) {
  return (
    frontMatter({
      title: article.title,
      summary: article.summary,
      url: absolute('/blog/' + article.slug),
      published: article.published_at,
      updated: article.updated_at,
      category: article.category,
      tags: article.tags,
      projects: projects.map((p) => p.title)
    }) +
    '\n' +
    body(article) +
    '\n' +
    related('Projects', '/projects/', projects)
  );
}

export function projectMarkdown(project: Described, posts: Link[] = []) {
  return (
    frontMatter({
      title: project.title,
      summary: project.summary,
      url: absolute('/projects/' + project.slug),
      updated: project.updated_at,
      category: project.category,
      tags: project.tags,
      repository: project.repo_url,
      demo: project.demo_url
    }) +
    '\n' +
    body(project) +
    '\n' +
    related('Posts', '/blog/', posts)
  );
}

/** Whether an Accept header asks for Markdown ahead of HTML. A bare wildcard keeps HTML. */
export function prefersMarkdown(accept: string | null) {
  if (!accept) return false;
  const quality = (type: string) => {
    let best = -1;
    for (const part of accept.split(',')) {
      const [name, ...params] = part.trim().toLowerCase().split(';');
      if (name !== type) continue;
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      best = Math.max(best, q ? Number(q.slice(2)) || 0 : 1);
    }
    return best;
  };
  const markdown = quality('text/markdown');
  return markdown > 0 && markdown >= quality('text/html');
}
