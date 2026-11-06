<script lang="ts">
  // One row: previous, a window of five numbered pages, next. Jumps to the first and last page
  // appear beside the window when there is room. Plain links, so it works without JavaScript.
  import { resolve } from '$app/paths';
  import { pageCount, pageWindow } from '@voidreg/publishing-ui/pagination';
  import Icon from './Icon.svelte';

  let {
    page,
    total,
    perPage,
    href,
    label = 'Pages'
  }: {
    page: number;
    total: number;
    perPage: number;
    /** Canonical address of a page number; page 1 should omit the parameter. */
    href: (page: number) => string;
    label?: string;
  } = $props();

  const count = $derived(pageCount(total, perPage));
  const win = $derived(pageWindow(page, count, 5));
  const link = (n: number) => resolve(href(n) as '/');
</script>

{#if count > 1}
  <nav class="pager" aria-label={label}>
    {#if win.current > 1}
      <a class="pg pg-step" rel="prev" href={link(win.current - 1)} aria-label="Previous page"
        ><Icon name="arrow-left" size={16} /></a
      >
    {:else}
      <span class="pg pg-step" aria-disabled="true"><Icon name="arrow-left" size={16} /></span>
    {/if}
    {#if win.showFirst}
      <a class="pg pg-edge" href={link(1)} aria-label="Page 1">1</a>
      {#if win.gapBefore}<span class="pg-gap pg-edge" aria-hidden="true">&hellip;</span>{/if}
    {/if}
    {#each win.pages as n (n)}
      {#if n === win.current}
        <span class="pg" aria-current="page" aria-label={`Page ${n}, current page`}>{n}</span>
      {:else}
        <a class="pg" href={link(n)} aria-label={`Page ${n}`}>{n}</a>
      {/if}
    {/each}
    {#if win.showLast}
      {#if win.gapAfter}<span class="pg-gap pg-edge" aria-hidden="true">&hellip;</span>{/if}
      <a class="pg pg-edge" href={link(count)} aria-label={`Page ${count}, last page`}>{count}</a>
    {/if}
    {#if win.current < count}
      <a class="pg pg-step" rel="next" href={link(win.current + 1)} aria-label="Next page"
        ><Icon name="arrow-right" size={16} /></a
      >
    {:else}
      <span class="pg pg-step" aria-disabled="true"><Icon name="arrow-right" size={16} /></span>
    {/if}
  </nav>
  <p class="pager-status" role="status">Page {win.current} of {count}</p>
{/if}

<style>
  .pager {
    container-type: inline-size;
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    margin-top: 2rem;
  }
  .pg {
    display: inline-flex;
    flex: 0 1 2.75rem;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-width: 2.25rem;
    height: 2.75rem;
    border: 1px solid var(--input);
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-code);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    text-decoration: none;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }
  a.pg:hover {
    border-color: var(--foreground);
    background: var(--secondary);
  }
  a.pg:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .pg[aria-current='page'] {
    border-color: var(--foreground);
    background: var(--foreground);
    color: var(--background);
  }
  .pg[aria-disabled='true'] {
    border-color: var(--border);
    color: var(--muted-foreground);
    opacity: 0.55;
  }
  .pg-gap {
    display: inline-flex;
    align-items: center;
    height: 2.75rem;
    flex: 0 0 auto;
    padding-inline: 0.25rem;
    color: var(--muted-foreground);
    font-family: var(--font-code);
  }
  .pager-status {
    margin: 0.5rem 0 0;
    text-align: center;
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.75rem;
  }
  /* Narrow rows keep to previous, five pages and next so everything stays in one line. */
  @container (max-width: 33.99rem) {
    .pg-edge {
      display: none;
    }
  }
</style>
