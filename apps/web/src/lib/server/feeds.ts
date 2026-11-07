import copy from '../content/portfolio-copy.json';
import type { Article } from '@voidreg/publishing-ui/api';
import { SITE, SITE_NAME, absolute } from '../seo';

const escape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Posts in the RSS feed. */
export const FEED_ITEMS = 50;

const rfc822 = (iso: string | null | undefined) =>
  iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toUTCString() : '';

export function rssFeed(articles: Article[]) {
  const items = articles
    .slice(0, FEED_ITEMS)
    .map((a) => {
      const url = absolute('/blog/' + a.slug);
      const date = rfc822(a.published_at ?? a.updated_at);
      return (
        '<item><title>' +
        escape(a.title) +
        '</title><link>' +
        escape(url) +
        '</link><guid isPermaLink="true">' +
        escape(url) +
        '</guid>' +
        (date ? '<pubDate>' + date + '</pubDate>' : '') +
        '<description>' +
        escape(a.summary) +
        '</description>' +
        (a.category ? '<category>' + escape(a.category) + '</category>' : '') +
        (a.tags ?? []).map((t) => '<category>' + escape(t) + '</category>').join('') +
        '</item>'
      );
    })
    .join('');
  const built = rfc822(articles[0]?.updated_at ?? articles[0]?.published_at);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>' +
    '<title>' +
    SITE_NAME +
    '</title><link>' +
    SITE +
    '/</link><description>' +
    escape(copy.blogDescription) +
    '</description><language>en</language>' +
    (built ? '<lastBuildDate>' + built + '</lastBuildDate>' : '') +
    '<atom:link href="' +
    SITE +
    '/rss.xml" rel="self" type="application/rss+xml" />' +
    items +
    '</channel></rss>'
  );
}
