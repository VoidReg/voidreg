<script lang="ts">
  import PostDetail from '$lib/views/PostDetail.svelte';
  import Seo from '$lib/Seo.svelte';
  import { absolute, author, breadcrumbs, describe, graph, pageTitle, wordCount } from '$lib/seo';
  let { data } = $props();
  const article = $derived(data.article);
</script>

<Seo
  title={pageTitle(article.seo_title || article.title)}
  description={describe(article.seo_description, article.summary)}
  image={article.social_image || article.hero_image}
  imageAlt={article.hero_alt}
  type="article"
  published={article.published_at}
  modified={article.updated_at}
  tags={article.tags}
  markdown={'/blog/' + article.slug + '.md'}
  structured={graph([
    {
      '@type': 'BlogPosting',
      headline: article.title,
      description: describe(article.seo_description, article.summary),
      datePublished: article.published_at,
      dateModified: article.updated_at || article.published_at,
      image:
        article.social_image || article.hero_image
          ? [absolute(article.social_image || article.hero_image || '')]
          : undefined,
      keywords: article.tags?.length ? article.tags.join(', ') : undefined,
      articleSection: article.category,
      wordCount: wordCount(article.sections),
      inLanguage: 'en',
      author,
      publisher: author,
      isPartOf: data.projects[0]
        ? {
            '@type': 'CreativeWork',
            name: data.projects[0].title,
            url: absolute('/projects/' + data.projects[0].slug)
          }
        : undefined,
      mainEntityOfPage: absolute('/blog/' + article.slug)
    },
    breadcrumbs([
      { name: 'Home', path: '/' },
      { name: 'Blog', path: '/blog' },
      { name: article.title, path: '/blog/' + article.slug }
    ])
  ])}
/>
<PostDetail
  {article}
  projects={data.projects}
  newer={data.newer}
  older={data.older}
  topic={data.topic}
/>
