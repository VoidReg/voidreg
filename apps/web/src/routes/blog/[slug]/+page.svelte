<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { getPublic, type Article } from '$lib/publishing/api';
  import ArticleBody from '$lib/publishing/ArticleBody.svelte';
  import Comments from '$lib/publishing/Comments.svelte';
  let article = $state<Article | undefined>(),
    error = $state(''),
    loading = $state(true),
    revision = $state(0);
  $effect(() => {
    const slug = page.params.slug;
    const refresh = revision;
    const controller = new AbortController();
    article = undefined;
    error = '';
    loading = true;
    void getPublic<Article>(
      `/blogs/${encodeURIComponent(slug ?? '')}`,
      controller.signal,
      refresh > 0
    )
      .then((value) => {
        if (!controller.signal.aborted) article = value;
      })
      .catch((e) => {
        if (!controller.signal.aborted) error = (e as Error).message;
      })
      .finally(() => {
        if (!controller.signal.aborted) loading = false;
      });
    return () => controller.abort();
  });
  const jsonLd = $derived(
    article
      ? JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: article.title,
          description: article.summary,
          datePublished: article.published_at,
          url: page.url.href
        }).replaceAll('<', '\\u003c')
      : ''
  );
  $effect(() => {
    if (!jsonLd) return;
    const element = document.createElement('script');
    element.type = 'application/ld+json';
    element.textContent = jsonLd;
    document.head.append(element);
    return () => element.remove();
  });
</script>

<svelte:head
  ><title>{article ? `${article.title} | Voidreg` : 'Article | Voidreg'}</title><meta
    name="description"
    content={article?.summary ?? 'Engineering notes from Voidreg.'}
  /></svelte:head
>
<main id="main-content" class="site-container page-shell">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href={resolve('/')}>Home</a><span>/</span><a href={resolve('/blog')}>Blog</a><span>/</span
    ><span aria-current="page">Article</span>
  </nav>
  {#if loading}<div class="blog-skeleton" role="status">Loading article…</div>
  {:else if error}<div class="section-stack">
      <h1>Article unavailable</h1>
      <p role="alert">{error}</p>
      <button class="button" onclick={() => revision++}>Try again</button>
    </div>
  {:else if article}
    <article class="section-stack">
      <header class="section-stack">
        <p class="eyebrow">{article.category}</p>
        <h1 class="display-heading">{article.title}</h1>
        <p class="lead">{article.summary}</p>
        {#if article.published_at}<time datetime={article.published_at}
            >{new Date(article.published_at).toLocaleDateString()}</time
          >{/if}
      </header>
      <ArticleBody {article} />
    </article>
    {#key article.slug}<Comments slug={article.slug} />{/key}
  {/if}
</main>
