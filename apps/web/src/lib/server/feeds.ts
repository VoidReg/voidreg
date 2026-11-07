import copy from '../content/portfolio-copy.json';
import type { Article } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';
import { SITE, SITE_NAME, absolute, describe } from '../seo';

const escape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Large sites keep the index readable: the newest entries, then a pointer to the sitemap. */
const INDEX_LIMIT = 500;

const line = (item: { title: string; summary?: string }, url: string) =>
  '- [' + item.title + '](' + url + ')' + (item.summary ? ': ' + describe(item.summary) : '');

const more = (total: number, noun: string) =>
  total > INDEX_LIMIT
    ? [
        '',
        'Showing the newest ' +
          INDEX_LIMIT +
          ' of ' +
          total +
          ' ' +
          noun +
          '. The sitemap lists them all.'
      ]
    : [];

/** The llms.txt index: what the site is, how to read it, and a Markdown link per page. */
export function llmsIndex(projects: Project[], articles: Article[]) {
  return (
    [
      '# ' + SITE_NAME,
      '',
      '> ' + copy.homeDescription,
      '',
      'Every post and project below has a clean Markdown version. Append `.md` to its URL, or send `Accept: text/markdown` to the normal page URL.',
      '',
      '## Projects',
      '',
      ...(projects.length
        ? [
            ...projects
              .slice(0, INDEX_LIMIT)
              .map((p) => line(p, absolute('/projects/' + p.slug + '.md'))),
            ...more(projects.length, 'projects')
          ]
        : ['No projects are published yet.']),
      '',
      '## Blog',
      '',
      ...(articles.length
        ? [
            ...articles
              .slice(0, INDEX_LIMIT)
              .map((a) => line(a, absolute('/blog/' + a.slug + '.md'))),
            ...more(articles.length, 'posts')
          ]
        : ['No posts are published yet.']),
      '',
      '## Machine access',
      '',
      '- [Sitemap](' + SITE + '/sitemap.xml)',
      '- [RSS feed](' + SITE + '/rss.xml)',
      '- [Full text of every post](' + SITE + '/llms-full.txt)',
      '- [MCP server](' +
        SITE +
        '/mcp): Streamable HTTP. Connect without a token to search and read published posts and projects.',
      ''
    ].join('\n') + '\n'
  );
}

const rfc822 = (iso: string | null | undefined) =>
  iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toUTCString() : '';

export function rssFeed(articles: Article[]) {
  const items = articles
    .slice(0, 50)
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
