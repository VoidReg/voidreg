<script lang="ts">
  import copy from '$lib/content/portfolio-copy.json';
  import EmptyContent from '$lib/components/EmptyContent.svelte';
  import ArticleCard from '$lib/publishing/ArticleCard.svelte';
  import { resolve } from '$app/paths';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();
  const result = $derived(data.result);
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
  {#if result.items.length === 0}<EmptyContent kind="articles" heading="h2" />
  {:else}
    <section class="note-list" aria-label="Articles">
      {#each result.items as article (article.slug)}<ArticleCard {article} />{/each}
    </section>
    <nav class="button-row" aria-label="Article pages">
      {#if result.page > 1}<a
          class="button button-secondary"
          href={resolve(`/blog?page=${result.page - 1}`)}>Previous</a
        >{/if}<span>Page {result.page}</span>{#if result.page * result.per_page < result.total}<a
          class="button button-secondary"
          href={resolve(`/blog?page=${result.page + 1}`)}>Next</a
        >{/if}
    </nav>
  {/if}
</main>
