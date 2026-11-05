import { toMarkdown, type MarkdownExportPolicy } from '@publisle/markdown';
import { parseDocument } from '@publisle/schema';
import { error } from '@sveltejs/kit';
import type { Article } from '$lib/publishing/api';
const cache = new Map<string, { source: string; notes: string[] }>();
export function markdownSource(article: Article, archival = false) {
  const key = (article.id ?? article.slug) + article.content_hash + String(archival);
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
  const result = toMarkdown(document, {
    policy: (archival ? 'archival' : 'fallback') as MarkdownExportPolicy
  });
  if (!result.markdown || result.diagnostics.some((d) => d.level === 'error'))
    error(503, 'Source conversion is temporarily unavailable.');
  const value = { source: result.markdown, notes: result.diagnostics.map((d) => d.message) };
  cache.set(key, value);
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return value;
}
