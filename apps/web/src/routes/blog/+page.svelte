<script lang="ts">
  import copy from '$lib/content/portfolio-copy.json';
  import EmptyContent from '$lib/components/EmptyContent.svelte';
  import ArticleCard from '$lib/publishing/ArticleCard.svelte';
  import { resolve } from '$app/paths';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();
  const result = $derived(data.result);
  const active = $derived(data.filters.find((f) => f.slug === data.project));
  const href = (page: number) => {
    const params = [];
    if (data.project) params.push('project=' + encodeURIComponent(data.project));
    if (page > 1) params.push('page=' + page);
    return params.length ? `/blog?${params.join('&')}` : '/blog';
  };
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
  {#if data.filters.length}<nav aria-label="Filter posts by project">
      <ul class="chip-row">
        <li>
          <a class="chip" href={resolve('/blog')} aria-current={data.project ? undefined : 'true'}
            >All posts</a
          >
        </li>
        {#each data.filters as filter (filter.slug)}<li>
            <a
              class="chip"
              href={resolve(`/blog?project=${encodeURIComponent(filter.slug)}`)}
              aria-current={data.project === filter.slug ? 'true' : undefined}
              >{filter.title} <span class="chip-count">{filter.post_count}</span></a
            >
          </li>{/each}
      </ul>
    </nav>{/if}
  {#if data.project}<p class="filter-status" role="status">
      {#if active}Posts following {active.title}.{:else}No project matches this filter.{/if}
      <a class="text-link" href={resolve('/blog')}>Clear filter</a>
    </p>{/if}
  {#if result.items.length === 0}<EmptyContent kind="articles" heading="h2" />
  {:else}
    <section class="note-list" aria-label="Articles">
      {#each result.items as article (article.slug)}<ArticleCard {article} />{/each}
    </section>
    <nav class="button-row" aria-label="Article pages">
      {#if result.page > 1}<a
          class="button button-secondary"
          href={resolve(href(result.page - 1) as '/blog')}>Previous</a
        >{/if}<span>Page {result.page}</span>{#if result.page * result.per_page < result.total}<a
          class="button button-secondary"
          href={resolve(href(result.page + 1) as '/blog')}>Next</a
        >{/if}
    </nav>
  {/if}
</main>
