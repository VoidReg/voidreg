// The llms.txt documents, built from the public API. The choosing and ordering lives in
// llm-map.ts; this file reads the posts and keeps the text of unchanged ones between rebuilds.
import type { Article } from '@voidreg/publishing-ui/api';
import { absolute } from '../seo';
import { publicContent } from './content';
import { articleMarkdown } from './llm';
import { TextStore, UNFILED, type MapPost, type Region } from './llm-map';

/** One post's Markdown, kept until the post changes. */
const texts = new TextStore();

/** Size of a full-text document, in characters. */
export const FULL_TEXT_LIMIT = 1_000_000;

/**
 * The text of posts in the given order, until the size budget is spent. Posts are read a few at
 * a time, and a post whose content has not changed since the last build is not read again.
 */
export async function fullText(
  order: MapPost[],
  fetcher: typeof fetch,
  limit = FULL_TEXT_LIMIT
): Promise<{ text: string; used: number }> {
  const parts: string[] = [];
  let size = 0;
  let used = 0;
  for (let start = 0; start < order.length && size < limit; start += 8) {
    const batch = await Promise.all(
      order
        .slice(start, start + 8)
        .map((post) =>
          texts.get(post, async () =>
            articleMarkdown(
              await publicContent<Article>('/blogs/' + encodeURIComponent(post.slug), fetcher)
            )
          )
        )
    );
    for (const part of batch) {
      if (size + part.length > limit) return { text: parts.join('\n\n---\n\n'), used };
      parts.push(part);
      size += part.length;
      used++;
    }
  }
  return { text: parts.join('\n\n---\n\n'), used };
}

/** Points to the project documents for everything the full text had no room for. */
export function leftover(groups: Region[], order: MapPost[], used: number) {
  const included = new Set(order.slice(0, used).map((post) => post.slug));
  const rows = groups
    .map((group) => ({
      group,
      missing: group.posts.filter((post) => !included.has(post.slug)).length
    }))
    .filter((row) => row.missing > 0);
  if (!rows.length) return '';
  return (
    '## More posts\n\nThe size limit was reached. Read the rest by project:\n\n' +
    rows
      .slice(0, 200)
      .map(({ group, missing }) =>
        group.slug === UNFILED
          ? '- ' +
            group.title +
            ': ' +
            missing +
            ' more, listed in [llms.txt](' +
            absolute('/llms.txt') +
            ')'
          : '- [' +
            group.title +
            '](' +
            absolute('/llms/' + group.slug + '-full.txt') +
            '): ' +
            missing +
            ' more'
      )
      .join('\n')
  );
}
