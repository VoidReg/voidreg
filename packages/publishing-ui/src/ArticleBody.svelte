<script lang="ts">
  import { sanitizePublicationHtml } from './publication-html';
  import PublisleArticle from '@publisle/adapter-svelte/article';
  import type { Article } from './api';
  import { outlineFromReadings, tocCount, type TocEntry } from './article-toc';
  import { mountCodeViewers } from './code-viewer';
  import { linkRenderedReferences } from './references';

  /** Keep a wide table in column alignment and let the reader scroll it sideways. */
  function mountTables(element: HTMLElement) {
    for (const table of element.querySelectorAll<HTMLTableElement>('table')) {
      if (table.closest('.table-scroll, .article-toc')) continue;
      const wrap = element.ownerDocument.createElement('div');
      wrap.className = 'table-scroll';
      wrap.tabIndex = 0;
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Data table');
      table.before(wrap);
      wrap.append(table);
    }
  }
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
        'pre, div.publisle-math, p > .katex'
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
                : 'Scrollable code block'
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
  let outline = $state<TocEntry[]>([]);
  // The compiled article has headings and no fragment ids. Read them after render,
  // give each one a stable id, and list the ones a reader can jump to.
  $effect(() => {
    const element = container;
    const hasBody = Boolean(safe?.html) || article.sections.length > 0;
    if (!element || !hasBody) {
      outline = [];
      return;
    }
    let seen = '';
    const collect = () => {
      const headings = [...element.querySelectorAll<HTMLElement>('h2, h3, h4')].filter(
        (heading) => !heading.closest('aside, .article-toc')
      );
      const { outline: next, assigned } = outlineFromReadings(
        headings.map((heading) => ({
          level: Number(heading.tagName.slice(1)),
          text: heading.textContent ?? '',
          id: heading.id
        }))
      );
      headings.forEach((heading, index) => {
        const id = assigned[index];
        if (id && heading.id !== id) heading.id = id;
      });
      mountCodeViewers(element);
      mountTables(element);
      linkRenderedReferences(element);
      const key = JSON.stringify(next);
      if (key === seen) return;
      seen = key;
      outline = tocCount(next) >= 2 ? next : [];
    };
    collect();
    const observer = new MutationObserver(collect);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  });
</script>

{#snippet contents(entries: TocEntry[])}
  <ol>
    {#each entries as entry (entry.id)}
      <li>
        <a href={`#${entry.id}`}>{entry.text}</a>
        {#if entry.children.length}{@render contents(entry.children)}{/if}
      </li>
    {/each}
  </ol>
{/snippet}

<div class="article-prose" bind:this={container}>
  {#if outline.length}
    <nav class="article-toc" aria-label="Contents">
      <p class="article-toc-label">Contents</p>
      {@render contents(outline)}
    </nav>
  {/if}
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
