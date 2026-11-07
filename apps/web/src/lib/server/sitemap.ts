import { SITE, absolute } from '../seo';

export type SitemapUrl = { path: string; date?: string | null; image?: string | null };

const escape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** The latest of several ISO timestamps, or empty when none are known. */
export function newest(dates: (string | null | undefined)[]) {
  return dates.filter((d): d is string => Boolean(d)).sort((a, b) => b.localeCompare(a))[0] ?? '';
}

export function sitemapXml(urls: SitemapUrl[]) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' +
    urls
      .map(
        (u) =>
          '<url><loc>' +
          escape(SITE + u.path) +
          '</loc>' +
          (u.date ? '<lastmod>' + escape(u.date) + '</lastmod>' : '') +
          (u.image
            ? '<image:image><image:loc>' + escape(absolute(u.image)) + '</image:loc></image:image>'
            : '') +
          '</url>'
      )
      .join('') +
    '</urlset>'
  );
}
