import { publicContent, site } from '$lib/server/content';
import type { Article, Page } from '$lib/publishing/api';
import type { Project } from '$lib/data/projects';
const escape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export async function GET({ fetch }) {
  const urls = ['/', '/about', '/projects', '/blog', '/privacy'].map((path) => ({
    path,
    date: ''
  }));
  for (const [endpoint, prefix] of [
    ['projects', 'projects'],
    ['blogs', 'blog']
  ]) {
    let page = 1;
    while (true) {
      const result = await publicContent<Page<Article | Project>>(
        '/' + endpoint + '?per_page=100&page=' + page,
        fetch
      );
      for (const item of result.items)
        urls.push({ path: '/' + prefix + '/' + item.slug, date: item.updated_at ?? '' });
      if (page * result.per_page >= result.total) break;
      page++;
    }
  }
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      urls
        .map(
          (u) =>
            '<url><loc>' +
            escape(site + u.path) +
            '</loc>' +
            (u.date ? '<lastmod>' + escape(u.date) + '</lastmod>' : '') +
            '</url>'
        )
        .join('') +
      '</urlset>',
    { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'no-cache' } }
  );
}
