<script lang="ts">
  import PostDetail from '$lib/views/PostDetail.svelte';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();
  const article = $derived(data.article);
</script>

<Seo
  title={(article.seo_title || article.title) + ' | Voidreg'}
  description={article.seo_description || article.summary}
  image={article.social_image || article.hero_image}
  structured={{
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.summary,
    datePublished: article.published_at,
    dateModified: article.updated_at || article.published_at,
    author: { '@type': 'Person', name: 'Voidreg', url: 'https://www.voidreg.xyz/about' },
    mainEntityOfPage: 'https://www.voidreg.xyz/blog/' + article.slug
  }}
/>
<PostDetail
  {article}
  projects={data.projects}
  newer={data.newer}
  older={data.older}
  topic={data.topic}
/>
