import { cachedText, everything } from '$lib/server/catalog';
import { newest, sitemapXml, type SitemapUrl } from '$lib/server/sitemap';
import type { Article, Topic } from '@voidreg/publishing-ui/api';
import type { Project } from '$lib/data/projects';

export async function GET({ fetch }) {
  const xml = await cachedText('sitemap', () => build(fetch));
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

async function build(fetch: typeof globalThis.fetch) {
  const [projects, articles, topics] = await Promise.all([
    everything<Project>('projects', fetch),
    everything<Article>('blogs', fetch),
    everything<Topic>('topics', fetch)
  ]);
  const stamp = (item: { updated_at?: string; published_at?: string | null }) =>
    item.updated_at ?? item.published_at ?? '';
  const latestProject = newest(projects.map(stamp));
  const latestPost = newest(articles.map(stamp));
  const urls: SitemapUrl[] = [
    { path: '/', date: newest([latestProject, latestPost]) },
    // Pages with no dated content carry no lastmod rather than an invented one.
    { path: '/about' },
    { path: '/agents' },
    { path: '/projects', date: latestProject },
    { path: '/blog', date: latestPost },
    { path: '/map', date: newest([latestProject, latestPost]) },
    { path: '/privacy' }
  ];
  for (const project of projects)
    urls.push({
      path: '/projects/' + project.slug,
      date: stamp(project),
      image: project.social_image || project.hero_image
    });
  for (const article of articles)
    urls.push({
      path: '/blog/' + article.slug,
      date: stamp(article),
      image: article.social_image || article.hero_image
    });
  // Topic pages, only for topics that hold published posts.
  for (const topic of topics)
    if (topic.project && topic.post_count > 0)
      urls.push({
        path: '/projects/' + topic.project.slug + '/topics/' + topic.slug,
        date: topic.latest_post_at ?? ''
      });
  return sitemapXml(urls);
}
