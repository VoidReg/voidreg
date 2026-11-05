<script lang="ts">
  import { resolve } from '$app/paths';
  import ReadingColumn from '$lib/components/ReadingColumn.svelte';
  import ArticleBody from '@voidreg/publishing-ui/ArticleBody.svelte';
  import ArticleCard from '$lib/publishing/ArticleCard.svelte';
  import Seo from '$lib/Seo.svelte';
  import type { Article } from '@voidreg/publishing-ui/api';
  let { data } = $props();
  const project = $derived(data.project);
</script>

<Seo
  title={(project.seo_title || project.title) + ' | Voidreg'}
  description={project.seo_description || project.summary}
  image={project.social_image || project.hero_image}
  structured={{
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.title,
    description: project.summary,
    url: 'https://www.voidreg.xyz/projects/' + project.slug
  }}
/>
<main id="main-content" class="site-container page-shell">
  <ReadingColumn>
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href={resolve('/')}>Home</a><span>/</span><a href={resolve('/projects')}>Projects</a><span
        >/</span
      ><span aria-current="page">{project.title}</span>
    </nav>
  </ReadingColumn>
  <article class="section-stack detail-article">
    <ReadingColumn>
      <header class="section-stack detail-header">
        <p class="eyebrow">{project.category}</p>
        <h1 class="display-heading">{project.title}</h1>
        <p class="lead">{project.summary}</p>
        {#if project.tags.length}<div class="tags">
            {#each project.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
          </div>{/if}
        {#if project.repo_url || project.demo_url}<div class="button-row">
            {#if project.repo_url}<a class="button button-secondary" href={project.repo_url}
                >Repository</a
              >{/if}{#if project.demo_url}<a class="button button-secondary" href={project.demo_url}
                >Live demo</a
              >{/if}
          </div>{/if}
      </header>
    </ReadingColumn>
    {#if project.hero_image}<img
        class="project-image"
        src={project.hero_image}
        alt={project.hero_alt ?? project.title}
      />{/if}
    <ArticleBody article={project as unknown as Article} />
  </article>
  {#if data.posts.total}<ReadingColumn>
      <section class="section-stack" aria-labelledby="project-posts">
        <h2 id="project-posts" class="section-heading">Writing about this project</h2>
        {#each data.posts.items as article (article.slug)}<ArticleCard
            {article}
            heading="h3"
          />{/each}
        <nav class="button-row" aria-label="Related post pages">
          {#if data.posts.page > 1}<a
              href={resolve(`/projects/${project.slug}?page=${data.posts.page - 1}`)}>Previous</a
            >{/if}{#if data.posts.page * data.posts.per_page < data.posts.total}<a
              href={resolve(`/projects/${project.slug}?page=${data.posts.page + 1}`)}>Next</a
            >{/if}
        </nav>
      </section>
    </ReadingColumn>{/if}
  <ReadingColumn>
    <a class="text-link" href={resolve('/projects')}>All projects</a>
  </ReadingColumn>
</main>

<style>
  .project-image {
    width: 100%;
    height: auto;
    border-radius: var(--radius);
  }
</style>
