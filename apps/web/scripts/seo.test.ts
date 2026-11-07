import assert from 'node:assert/strict';
import test from 'node:test';
import {
  absolute,
  breadcrumbs,
  collection,
  describe,
  graph,
  pageTitle,
  wordCount
} from '../src/lib/seo.ts';
import { newest, sitemapXml } from '../src/lib/server/sitemap.ts';
import { llmsIndex, rssFeed } from '../src/lib/server/feeds.ts';
import {
  articleMarkdown,
  frontMatter,
  prefersMarkdown,
  projectMarkdown
} from '../src/lib/server/llm.ts';
import { markdownResponse } from '../src/lib/server/markdown-response.ts';

const article = {
  slug: 'first-post',
  title: 'First "quoted" post',
  summary: 'A summary & more',
  category: 'Graphics',
  tags: ['rust', 'gpu'],
  published_at: '2026-01-02T03:04:05Z',
  updated_at: '2026-02-03T00:00:00Z',
  content_hash: 'abc123',
  sections: [
    { heading: 'Intro', body: 'Plain words here.', kind: 'text' },
    { body: 'More words.', kind: 'text' }
  ]
};

test('descriptions and titles are trimmed at word boundaries', () => {
  const long = 'word '.repeat(80);
  const text = describe('', long);
  assert(text.length <= 160, String(text.length));
  assert(text.endsWith('...'));
  assert(!text.includes('wor...'));
  assert.equal(describe('  Short   text '), 'Short text');
  assert.equal(describe(undefined, null, 'fallback'), 'fallback');
  assert(pageTitle('x'.repeat(200)).length <= 60 + ' | Voidreg'.length);
  assert.equal(pageTitle('Blog'), 'Blog | Voidreg');
});

test('structured data is one valid graph with breadcrumbs', () => {
  const crumbs = breadcrumbs([
    { name: 'Home', path: '/' },
    { name: 'Blog', path: '/blog' }
  ]);
  assert.equal(crumbs.itemListElement[1].item, 'https://www.voidreg.xyz/blog');
  assert.equal(crumbs.itemListElement[1].position, 2);
  const single = graph({ '@type': 'WebPage' });
  assert.equal(single['@context'], 'https://schema.org');
  const many = graph([{ '@type': 'A' }, crumbs]) as { '@graph': unknown[] };
  assert.equal(many['@graph'].length, 2);
  const list = collection(
    'Blog',
    '/blog',
    'd',
    [{ slug: 'a', title: 'A' }],
    (i) => '/blog/' + i.slug
  );
  assert.equal(list.mainEntity.itemListElement[0].url, 'https://www.voidreg.xyz/blog/a');
  assert.equal(wordCount(article.sections), 6);
  assert.equal(wordCount(undefined), undefined);
  assert.equal(absolute('/og-default.png'), 'https://www.voidreg.xyz/og-default.png');
  assert.equal(absolute('https://cdn.test/a.png'), 'https://cdn.test/a.png');
});

test('sitemap escapes values, keeps honest lastmod and lists images', () => {
  const xml = sitemapXml([
    { path: '/about' },
    { path: '/blog/a&b', date: '2026-01-01T00:00:00Z', image: '/media/x.png?a=1&b=2' }
  ]);
  assert(xml.includes('<loc>https://www.voidreg.xyz/about</loc></url>'));
  assert(xml.includes('/blog/a&amp;b'));
  assert(xml.includes('<lastmod>2026-01-01T00:00:00Z</lastmod>'));
  assert(xml.includes('<image:loc>https://www.voidreg.xyz/media/x.png?a=1&amp;b=2</image:loc>'));
  assert.equal(newest(['2026-01-01', null, '2026-03-01', undefined]), '2026-03-01');
  assert.equal(newest([]), '');
});

test('RSS and llms.txt list published content and stay well formed', () => {
  const rss = rssFeed([article as never]);
  assert(rss.includes('<guid isPermaLink="true">https://www.voidreg.xyz/blog/first-post</guid>'));
  assert(rss.includes('First &quot;quoted&quot; post'));
  assert(rss.includes('<pubDate>Fri, 02 Jan 2026 03:04:05 GMT</pubDate>'));
  assert(rss.includes('<category>rust</category>'));
  assert(rssFeed([]).includes('<channel>'));
  const index = llmsIndex(
    [{ slug: 'p', title: 'Proj', summary: 'About p' } as never],
    [article as never]
  );
  assert(index.startsWith('# Voidreg'));
  assert(index.includes('[Proj](https://www.voidreg.xyz/projects/p.md): About p'));
  assert(index.includes('https://www.voidreg.xyz/blog/first-post.md'));
  assert(index.includes('https://www.voidreg.xyz/mcp'));
  assert(index.includes('https://www.voidreg.xyz/agents'));
  assert(!index.includes('\u2014'));
  assert(llmsIndex([], []).includes('No posts are published yet.'));
  // A truncated list still reports the real size of the catalogue.
  const partial = llmsIndex(
    [],
    Array.from({ length: 500 }, (_, i) => ({ ...article, slug: 'p' + i })) as never[],
    {
      articles: 9000
    }
  );
  assert(partial.includes('Showing the newest 500 of 9000 posts'));
});

test('markdown twins carry front matter, one heading and related links', () => {
  const markdown = articleMarkdown(article as never, [{ slug: 'p', title: 'Proj' }]);
  assert(markdown.startsWith('---\ntitle: "First \\"quoted\\" post"\n'));
  assert(markdown.includes('url: "https://www.voidreg.xyz/blog/first-post"'));
  assert(markdown.includes('tags: ["rust", "gpu"]'));
  assert.equal(markdown.match(/^# /gm)?.length, 1);
  assert.equal(markdown.match(/^---$/gm)?.length, 2, 'exactly one front matter block');
  assert(markdown.includes('Plain words here.'));
  assert(markdown.includes('[Proj](https://www.voidreg.xyz/projects/p.md)'));
  const project = projectMarkdown(
    {
      slug: 'p',
      title: 'Proj',
      summary: 's',
      sections: [{ body: 'Body', kind: 'text' }],
      revision: 3
    } as never,
    [{ slug: 'first-post', title: 'First post' }]
  );
  assert(project.includes('## Posts'));
  assert(project.includes('/blog/first-post.md'));
  assert.equal(frontMatter({ a: 'x', b: [], c: null }), '---\na: "x"\n---\n');
});

test('Accept negotiation prefers markdown only when asked for it', () => {
  assert.equal(prefersMarkdown(null), false);
  assert.equal(prefersMarkdown('*/*'), false);
  assert.equal(prefersMarkdown('text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'), false);
  assert.equal(prefersMarkdown('text/markdown'), true);
  assert.equal(prefersMarkdown('text/markdown, text/html;q=0.5'), true);
  assert.equal(prefersMarkdown('text/html, text/markdown;q=0.5'), false);
  assert.equal(prefersMarkdown('text/markdown;q=0'), false);
});

test('markdown responses are inline, canonical, cacheable and revalidate', async () => {
  const request = new Request('https://x.test/blog/a.md');
  const response = markdownResponse(request, 'body', 'https://www.voidreg.xyz/blog/a', 'h-1');
  assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.equal(response.headers.get('link'), '<https://www.voidreg.xyz/blog/a>; rel="canonical"');
  assert.equal(response.headers.get('content-disposition'), null);
  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.equal(await response.text(), 'body');
  const etag = response.headers.get('etag')!;
  const again = markdownResponse(
    new Request('https://x.test/blog/a.md', { headers: { 'if-none-match': etag } }),
    'body',
    'https://www.voidreg.xyz/blog/a',
    'h-1'
  );
  assert.equal(again.status, 304);
});
