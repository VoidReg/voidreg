<script lang="ts">
  import { sanitizePublicationHtml } from './publication-html';
  import PublisleArticle from '@publisle/adapter-svelte/article';
  import type { Article } from './api';
  import { implementations } from './renderers';
  import '@publisle/adapter-core/document.css';
  import '@publisle/adapter-core/katex.css';
  import './styles/prose.css';
  import './blocks/styles.css';
  let { article, linksInNewTab = false }: { article: Article; linksInNewTab?: boolean } = $props();
  const componentId = $props.id();
  const instanceId = 'article-' + componentId.replace(/[^A-Za-z0-9_-]/g, '');
  let container = $state<HTMLDivElement>();
  $effect(() => {
    if (!container || !article.compiled) return;
    const element = container;
    // An interactive block swaps its static fallback for the live component when it activates.
    // Until then the section keeps the fallback's height, so the swap never collapses the page.
    const reserveIslands = () => {
      for (const section of element.querySelectorAll<HTMLElement>('[data-publisle-island]')) {
        const mount = section.querySelector<HTMLElement>('[data-publisle-mount]');
        if (!mount) continue;
        if (mount.hidden) {
          section.style.minHeight = '';
          section.style.minHeight = `${section.offsetHeight}px`;
        }
      }
    };
    const update = () => {
      reserveIslands();
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
  $effect(() => {
    if (!container || !linksInNewTab) return;
    const element = container;
    const updateLinks = () => {
      for (const link of element.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        const href = link.getAttribute('href') ?? '';
        // Keep footnotes and other in-document references in this preview.
        if (!href || href.startsWith('#') || link.hasAttribute('download')) continue;
        if (!['http:', 'https:'].includes(link.protocol)) continue;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
    };
    updateLinks();
    const observer = new MutationObserver(updateLinks);
    observer.observe(element, { childList: true, subtree: true });
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
