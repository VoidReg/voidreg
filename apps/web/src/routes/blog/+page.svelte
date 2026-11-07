<script lang="ts">
  import copy from '$lib/content/portfolio-copy.json';
  import EmptyContent from '$lib/components/EmptyContent.svelte';
  import ArticleCard from '$lib/publishing/ArticleCard.svelte';
  import { resolve } from '$app/paths';
  import Seo from '$lib/Seo.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import PostFilters from '$lib/components/PostFilters.svelte';
  import { filterHref } from '$lib/filters';
  let { data } = $props();
  const result = $derived(data.result);
  const href = (page: number) => filterHref('/blog', { ...data.filters, page });
</script>

<Seo title="Blog | Voidreg" description={copy.blogDescription} />
<main id="main-content" class="site-container page-shell">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href={resolve('/')}>Home</a><span>/</span><span aria-current="page">Blog</span>
  </nav>
  <header class="section-stack">
    <p class="eyebrow">{copy.blogEyebrow}</p>
    <h1 class="display-heading">{copy.blogTitle}</h1>
    <p class="lead">{copy.blogIntro}</p>
  </header>
  <PostFilters
    filters={data.filters}
    projectTitle={data.project?.title ?? ''}
    topics={data.topics}
    seeds={data.seeds}
    total={result.total}
  />
  {#if data.filters.project && !data.project}<p class="filter-status" role="status">
      No project matches "{data.filters.project}".
      <a class="text-link" href={resolve('/blog')}>Clear filters</a>
    </p>{/if}
  {#if result.items.length === 0}<EmptyContent kind="articles" heading="h2" />
  {:else}
    <section class="note-list" aria-label="Articles" data-paged-list tabindex="-1">
      {#each result.items as article (article.slug)}<ArticleCard {article} />{/each}
    </section>
    <Pagination
      page={result.page}
      total={result.total}
      perPage={result.per_page}
      {href}
      label="Article pages"
    />
  {/if}
</main>
