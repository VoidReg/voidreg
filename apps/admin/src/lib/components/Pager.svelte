<script lang="ts">
  // One row: previous, a window of five numbered pages, next. Edge jumps show when there is room.
  import { pageWindow } from '@voidreg/publishing-ui/pagination';
  import Icon from './Icon.svelte';

  let {
    page,
    pages,
    disabled = false,
    label = 'Pages',
    summary = '',
    onselect
  }: {
    page: number;
    pages: number;
    disabled?: boolean;
    label?: string;
    /** Extra text after "Page N of M", such as a record count. */
    summary?: string;
    onselect: (page: number) => void;
  } = $props();

  const win = $derived(pageWindow(page, pages, 5));
</script>

{#if win.total > 1 || summary}
  <div class="pager-wrap">
    {#if win.total > 1}
      <nav class="pager" aria-label={label}>
        <button
          type="button"
          class="pg pg-step"
          aria-label="Previous page"
          disabled={disabled || win.current <= 1}
          onclick={() => onselect(win.current - 1)}><Icon name="arrow-left" size={16} /></button
        >
        {#if win.showFirst}
          <button
            type="button"
            class="pg pg-edge"
            aria-label="Page 1"
            {disabled}
            onclick={() => onselect(1)}>1</button
          >
          {#if win.gapBefore}<span class="pg-gap pg-edge" aria-hidden="true">&hellip;</span>{/if}
        {/if}
        {#each win.pages as n (n)}
          <button
            type="button"
            class="pg"
            aria-current={n === win.current ? 'page' : undefined}
            aria-label={`Page ${n}`}
            disabled={disabled && n !== win.current}
            onclick={() => n !== win.current && onselect(n)}>{n}</button
          >
        {/each}
        {#if win.showLast}
          {#if win.gapAfter}<span class="pg-gap pg-edge" aria-hidden="true">&hellip;</span>{/if}
          <button
            type="button"
            class="pg pg-edge"
            aria-label={`Page ${win.total}, last page`}
            {disabled}
            onclick={() => onselect(win.total)}>{win.total}</button
          >
        {/if}
        <button
          type="button"
          class="pg pg-step"
          aria-label="Next page"
          disabled={disabled || win.current >= win.total}
          onclick={() => onselect(win.current + 1)}><Icon name="arrow-right" size={16} /></button
        >
      </nav>
    {/if}
    <p class="pager-status" aria-live="polite">
      Page {win.current} of {win.total}{summary ? ` | ${summary}` : ''}
    </p>
  </div>
{/if}

<style>
  .pager-wrap {
    container-type: inline-size;
    display: grid;
    gap: 0.5rem;
    justify-items: center;
  }
  .pager {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    max-width: 100%;
  }
  .pg {
    display: inline-flex;
    flex: 0 1 2.5rem;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-width: 2.25rem;
    height: 2.5rem;
    padding: 0;
    border: 1px solid var(--input);
    border-radius: var(--radius);
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-code, ui-monospace, monospace);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    cursor: pointer;
  }
  .pg:hover:not(:disabled) {
    border-color: var(--foreground);
    background: var(--secondary);
  }
  .pg:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .pg[aria-current='page'] {
    border-color: var(--foreground);
    background: var(--foreground);
    color: var(--background);
    cursor: default;
  }
  .pg:disabled:not([aria-current='page']) {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .pg-gap {
    display: inline-flex;
    align-items: center;
    height: 2.5rem;
    padding-inline: 0.25rem;
    color: var(--muted-foreground);
  }
  .pager-status {
    margin: 0;
    color: var(--muted-foreground);
    font-family: var(--font-code, ui-monospace, monospace);
    font-size: 0.75rem;
  }
  @container (max-width: 33.99rem) {
    .pg-edge {
      display: none;
    }
  }
</style>
