<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Article } from './api';
  let { article, heading = 'h2' }: { article: Article; heading?: 'h2' | 'h3' } = $props();
</script>

<article class="article-preview">
  <p class="eyebrow">{article.category}</p>
  <svelte:element this={heading}
    ><a class="text-link" href={resolve('/blog/[slug]', { slug: article.slug })}>{article.title}</a
    ></svelte:element
  >
  <p>{article.summary}</p>
  <p class="placeholder-note">
    {#if article.published_at}<time datetime={article.published_at}
        >{new Date(article.published_at).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })}</time
      >{/if}
    {#if article.published_at && article.reading_time_minutes}<span aria-hidden="true">
        ·
      </span>{/if}
    {#if article.reading_time_minutes}{article.reading_time_minutes} min read{/if}
  </p>
</article>

<style>
  .article-preview {
    display: grid;
    gap: 0.75rem;
    padding-block: 1.5rem;
    border-block-end: 1px solid var(--border);
    min-width: 0;
  }
  .article-preview :is(h2, h3) {
    font-size: 1.5rem;
    line-height: 1.3;
  }
  .article-preview p {
    overflow-wrap: anywhere;
  }
  @media (max-width: 47.999rem) {
    .article-preview :is(h2, h3) {
      font-size: 1.25rem;
    }
  }
</style>
