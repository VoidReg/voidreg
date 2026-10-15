<script lang="ts">
  import { onMount } from 'svelte';
  import ArticleCard from '$lib/publishing/ArticleCard.svelte';
  import { resolve } from '$app/paths';
  import { getPublic, type Article, type Page } from '$lib/publishing/api';
  let result = $state<Page<Article>>({ items: [], page: 1, per_page: 20, total: 0 });
  let loading = $state(true),
    error = $state('');
  async function load(page = 1, force = false) {
    loading = true;
    error = '';
    try {
      result = await getPublic(`/blogs?page=${page}`, undefined, force);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    void load();
  });
</script>

<svelte:head
  ><title>Blog | Voidreg</title><meta
    name="description"
    content="Engineering notes on systems, graphics, embedded work, and design."
  /></svelte:head
>
<main id="main-content" class="site-container page-shell">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href={resolve('/')}>Home</a><span>/</span><span aria-current="page">Blog</span>
  </nav>
  <header class="section-stack">
    <p class="eyebrow">Engineering notes</p>
    <h1 class="display-heading">Blog</h1>
    <p class="lead">Ideas, experiments, and lessons from building across layers.</p>
  </header>
  {#if loading}<div class="blog-skeleton" role="status">Loading articles…</div>
  {:else if error}<div class="section-stack">
      <p role="alert">{error}</p>
      <button class="button" onclick={() => load(result.page, true)}>Try again</button>
    </div>
  {:else if result.items.length === 0}<p>No articles published yet. Check back soon.</p>
  {:else}
    <section class="article-list" aria-label="Articles">
      {#each result.items as article (article.slug)}<ArticleCard {article} />{/each}
    </section>
    <nav class="button-row" aria-label="Article pages">
      <button
        class="button button-secondary"
        disabled={result.page <= 1}
        onclick={() => load(result.page - 1)}>Previous</button
      ><span>Page {result.page}</span><button
        class="button button-secondary"
        disabled={result.page * result.per_page >= result.total}
        onclick={() => load(result.page + 1)}>Next</button
      >
    </nav>
  {/if}
</main>

<style>
  .article-list {
    width: min(100%, 68ch);
  }
</style>
