import { redirect } from '@sveltejs/kit';
import { publicContent } from '$lib/server/content';
import { markdownSource } from '$lib/server/markdown';
import type { Article } from '$lib/publishing/api';
export async function load({ params, fetch, setHeaders }) {
  const article = await publicContent<Article>('/blogs/' + encodeURIComponent(params.slug), fetch);
  if (article.slug !== params.slug) redirect(308, '/blog/' + article.slug + '/source');
  setHeaders({ 'X-Robots-Tag': 'noindex,follow', 'Cache-Control': 'no-cache' });
  return { article, ...markdownSource(article) };
}
