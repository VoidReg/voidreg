<script lang="ts">
  import { sanitizePublicationHtml } from './publication-html';
  import PublisleArticle from '@publisle/adapter-svelte/article';
  import type { Article } from './api';
  import { implementations } from './renderers';
  import '@publisle/adapter-core/document.css';
  import '@publisle/adapter-core/katex.css';
  import './blocks/styles.css';
  let { article }: { article: Article } = $props();
  const componentId = $props.id();
  const instanceId = 'article-' + componentId.replace(/[^A-Za-z0-9_-]/g, '');
  let container = $state<HTMLDivElement>();
  $effect(() => {
    if (!container || !article.compiled) return;
    const element = container;
    const update = () => {
      for (const block of element.querySelectorAll<HTMLElement>(
        'pre, table, div.publisle-math, p > .katex'
      )) {
        if (block.scrollWidth > block.clientWidth) {
          block.tabIndex = 0;
          if (block.tagName === 'PRE' || block.matches('.publisle-math, .katex'))
            block.setAttribute('role', 'region');
          if (!block.hasAttribute('aria-label'))
            block.setAttribute(
              'aria-label',
              block.matches('.publisle-math, .katex')
                ? 'Scrollable equation'
                : block.tagName === 'PRE'
                  ? 'Scrollable code block'
                  : 'Scrollable data table'
            );
        }
      }
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  });
  const safe = $derived(
    article.compiled
      ? {
          ...article.compiled,
          html: sanitizePublicationHtml(article.compiled.html)
        }
      : undefined
  );
</script>

<div class="article-prose" bind:this={container}>
  {#if safe}
    <PublisleArticle publication={safe} {instanceId} {implementations} />
  {:else}
    {#each article.sections as section, index (index)}
      <section>
        {#if section.heading}<h2>{section.heading}</h2>{/if}
        <p>{section.body}</p>
      </section>
    {/each}
  {/if}
</div>
