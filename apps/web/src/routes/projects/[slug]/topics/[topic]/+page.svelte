<script lang="ts">
  import { resolve } from '$app/paths';
  import EmptyContent from '$lib/components/EmptyContent.svelte';
  import ArticleCard from '$lib/publishing/ArticleCard.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import Seo from '$lib/Seo.svelte';
  import { filterHref } from '$lib/filters';
  let { data } = $props();
  const topic = $derived(data.topic);
  const project = $derived(data.project);
  const result = $derived(data.result);
  const href = (page: number) => filterHref(data.base, { q: data.q, page });
</script>

<Seo
  title={`${topic.title} | ${project?.title} | Voidreg`}
  description={topic.summary || `Posts about ${topic.title} in ${project?.title}.`}
  structured={{
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: topic.title,
    description: topic.summary,
    url: 'https://www.voidreg.xyz' + data.base
  }}
/>
<main id="main-content" class="site-container page-shell">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href={resolve('/')}>Home</a><span>/</span><a href={resolve('/projects')}>Projects</a><span
      >/</span
    ><a href={resolve('/projects/[slug]', { slug: project?.slug ?? '' })}>{project?.title}</a><span
      >/</span
    ><span aria-current="page">{topic.title}</span>
  </nav>
  <header class="section-stack">
    <p class="eyebrow">Topic in {project?.title}</p>
    <h1 class="display-heading">{topic.title}</h1>
    {#if topic.summary}<p class="lead">{topic.summary}</p>{/if}
    <p class="filter-status">
      {topic.post_count}
      {topic.post_count === 1 ? 'post' : 'posts'}
    </p>
    <form
      class="topic-search"
      method="get"
      action={resolve(data.base as '/')}
      role="search"
      aria-label={`Search ${topic.title}`}
    >
      <label class="topic-field"
        >Search this topic<input
          type="search"
          name="q"
          value={data.q}
          placeholder="Title or summary"
          maxlength="100"
        /></label
      >
      <button type="submit" class="button button-secondary">Search</button>
      {#if data.q}<a class="text-link" href={resolve(data.base as '/')}>Clear search</a>{/if}
    </form>
  </header>
  {#if data.q}<p class="filter-status" role="status">
      {result.total}
      {result.total === 1 ? 'post matches' : 'posts match'} "{data.q}".
    </p>{/if}
  {#if result.items.length === 0}<EmptyContent kind="articles" heading="h2" />
  {:else}
    <section class="note-list" aria-label="Posts in this topic">
      {#each result.items as article (article.slug)}<ArticleCard {article} hideTopic />{/each}
    </section>
    <Pagination
      page={result.page}
      total={result.total}
      perPage={result.per_page}
      {href}
      label="Topic pages"
    />
  {/if}
  <p class="button-row">
    <a class="text-link" href={resolve('/projects/[slug]', { slug: project?.slug ?? '' })}
      >Back to {project?.title}</a
    >
    <a
      class="text-link"
      href={resolve(`/blog?project=${encodeURIComponent(project?.slug ?? '')}` as '/blog')}
      >All posts in this project</a
    >
  </p>
</main>

<style>
  .topic-search {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.75rem 1rem;
  }
  .topic-field {
    display: grid;
    flex: 1 1 14rem;
    gap: 0.25rem;
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .topic-field input {
    min-height: 2.75rem;
    border: 1px solid var(--input);
    border-radius: var(--radius);
    background: var(--background);
    padding: 0.5rem 0.75rem;
    color: var(--foreground);
    font: inherit;
    font-size: 0.9375rem;
  }
</style>
