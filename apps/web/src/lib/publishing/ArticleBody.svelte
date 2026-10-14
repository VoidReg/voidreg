<script lang="ts">
  import DOMPurify from 'dompurify';
  import PublisleArticle from '@publisle/adapter-svelte/article';
  import type { Article } from './api';
  import { implementations } from './renderers';
  import '@publisle/adapter-core/document.css';
  import '@publisle/adapter-core/katex.css';
  let { article }: { article: Article } = $props();
  const safe = $derived(
    article.compiled
      ? {
          ...article.compiled,
          html: DOMPurify.sanitize(article.compiled.html, {
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style'],
            FORBID_ATTR: ['style']
          })
        }
      : undefined
  );
</script>

<div class="article-prose">
  {#if safe}
    <PublisleArticle publication={safe} instanceId={`article-${article.slug}`} {implementations} />
  {:else}
    {#each article.sections as section, index (index)}
      <section>
        {#if section.heading}<h2>{section.heading}</h2>{/if}
        <p>{section.body}</p>
      </section>
    {/each}
  {/if}
</div>
