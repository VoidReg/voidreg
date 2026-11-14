import { toMarkdown, type MarkdownExportPolicy } from '@publisle/markdown';
import { parseDocument } from '@publisle/schema';
import { error } from '@sveltejs/kit';
import type { Article } from '@voidreg/publishing-ui/api';
import { readingDocument } from '@voidreg/publishing-ui/references';
const cache = new Map<string, { source: string; notes: string[] }>();
/** The parts of an article or project that the Markdown export reads. */
export type Exportable = Pick<Article, 'slug' | 'title' | 'sections'> & {
  id?: string;
  document?: unknown;
  content_hash?: string;
  revision?: number;
};

export function markdownSource(article: Exportable, archival = false) {
  const version = article.content_hash ?? String(article.revision ?? '');
  const key = (article.id ?? article.slug) + version + String(archival);
  const cached = cache.get(key);
  if (cached) return cached;
  const document = article.document
    ? parseDocument(article.document)
    : parseDocument({
        schemaVersion: 1,
        metadata: { title: article.title, language: 'en' },
        blocks: article.sections.flatMap((section) => [
          ...(section.heading
            ? [
                {
                  id: crypto.randomUUID(),
                  type: 'publisle:heading',
                  schemaVersion: 1,
                  data: { level: 2, content: [{ type: 'text', value: section.heading }] }
                }
              ]
            : []),
          {
            id: crypto.randomUUID(),
            type: 'publisle:paragraph',
            schemaVersion: 1,
            data: { content: [{ type: 'text', value: section.body }] }
          }
        ])
      });
  const result = archival
    ? toMarkdown(document, { policy: 'archival' satisfies MarkdownExportPolicy })
    : toMarkdown(readingDocument(document), { policy: 'standard' });
  if (!result.markdown || result.diagnostics.some((d) => d.level === 'error'))
    error(503, 'Source conversion is temporarily unavailable.');
  // Standard export warns that payloads were left out. That omission is the point of this copy.
  const notes = archival
    ? result.diagnostics.map((d) => d.message)
    : result.diagnostics
        .filter(
          (d) =>
            ![
              'extension-semantics-lost',
              'interactive-behavior-lost',
              'document-envelope-not-exported',
              'readable-representation-not-exported'
            ].includes(d.code)
        )
        .map((d) => d.message);
  const value = { source: result.markdown, notes };
  cache.set(key, value);
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return value;
}
