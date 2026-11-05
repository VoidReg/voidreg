import { publicContent } from '$lib/server/content';
import { markdownSource } from '$lib/server/markdown';
import type { Article } from '$lib/publishing/api';
import { redirect } from '@sveltejs/kit';
export async function GET({ params, url, fetch }) {
  const article = await publicContent<Article>('/blogs/' + encodeURIComponent(params.slug), fetch);
  if (article.slug !== params.slug)
    redirect(308, '/blog/' + article.slug + '/source.md' + url.search);
  const archival = url.searchParams.get('format') === 'archival';
  return new Response(markdownSource(article, archival).source, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${article.slug}${archival ? '.archival' : ''}.md"`,
      'Cache-Control': 'no-cache',
      'X-Robots-Tag': 'noindex,follow',
      ETag: '"' + article.content_hash + (archival ? '-archive' : '-md') + '"'
    }
  });
}
