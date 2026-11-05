<script lang="ts">
  import { resolve } from '$app/paths';
  import ReadingColumn from '$lib/components/ReadingColumn.svelte';
  import ArticleBody from '$lib/publishing/ArticleBody.svelte';
  import Comments from '$lib/publishing/Comments.svelte';
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
<main id="main-content" class="site-container page-shell">
  <ReadingColumn>
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href={resolve('/')}>Home</a><span>/</span><a href={resolve('/blog')}>Blog</a><span>/</span
      ><span aria-current="page">{article.title}</span>
    </nav>
  </ReadingColumn>
  <article class="section-stack detail-article">
    <ReadingColumn>
      <header class="section-stack detail-header">
        <p class="eyebrow">{article.category}</p>
        <h1 class="display-heading">{article.title}</h1>
        <p class="lead">{article.summary}</p>
        <p>
          {#if article.published_at}<time datetime={article.published_at}
              >{new Date(article.published_at).toLocaleDateString('en', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC'
              })}</time
            >{/if}{#if article.reading_time_minutes}
            | {article.reading_time_minutes} min read{/if}
        </p>
        <a class="text-link" href={resolve('/blog/[slug]/source', { slug: article.slug })}
          >View Markdown source</a
        >
        {#if data.projects.length}<nav class="tags" aria-label="Mentioned projects">
            {#each data.projects as project (project.id)}<a
                class="tag"
                href={resolve('/projects/[slug]', { slug: project.slug })}>{project.title}</a
              >{/each}
          </nav>{/if}
      </header>
    </ReadingColumn>
    {#if article.hero_image}<figure>
        <img
          style="max-width:100%;height:auto"
          src={article.hero_image}
          alt={article.hero_alt ?? ''}
        />{#if article.hero_caption}<figcaption>{article.hero_caption}</figcaption>{/if}
      </figure>{/if}<ArticleBody {article} />
  </article>
  <ReadingColumn>
    {#key article.id ?? article.slug}<Comments slug={article.slug} />{/key}
  </ReadingColumn>
</main>
