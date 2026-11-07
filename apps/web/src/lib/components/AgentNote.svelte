<script lang="ts">
  import { resolve } from '$app/paths';
  import CopyButton from './CopyButton.svelte';
  import Icon from './Icon.svelte';

  // A quiet pointer to MCP and Markdown. `band` closes the home page; `inline` sits at the end of
  // a page. Pages with a Markdown twin pass its address.
  let {
    variant = 'inline',
    markdown,
    markdownLabel = 'This page as Markdown',
    id = 'agent-note'
  }: {
    variant?: 'band' | 'inline';
    markdown?: string;
    markdownLabel?: string;
    id?: string;
  } = $props();
</script>

{#snippet content()}
  <div class="copy">
    <p class="eyebrow">For agents</p>
    <h2 id={id + '-title'} class="title">Read this site from your AI client.</h2>
    <p class="body">
      Connect over MCP to search and read every published post and project. No account or token is
      needed.
    </p>
  </div>
  <div class="actions">
    <a class="button" href={resolve('/agents')}
      >Connect over MCP <Icon name="arrow-right" size={16} /></a
    >
    <CopyButton text="https://www.voidreg.xyz/mcp" label="Copy server URL" />
    <!-- eslint-disable svelte/no-navigation-without-resolve -- the Markdown twin is already a resolved address -->
    {#if markdown}<a class="text-link" href={markdown}>{markdownLabel}</a>{/if}
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </div>
{/snippet}

{#if variant === 'band'}
  <section class="band band-card note-band" aria-labelledby={id + '-title'}>
    <div class="site-container note-grid">{@render content()}</div>
  </section>
{:else}
  <aside class="note-inline" aria-labelledby={id + '-title'}>{@render content()}</aside>
{/if}

<style>
  .note-band {
    padding-block: 2.5rem;
  }
  .note-grid,
  .note-inline {
    display: grid;
    gap: 1.25rem 3rem;
    align-items: center;
  }
  .note-inline {
    padding: 1.5rem;
    border: 1px solid var(--border);
    background: var(--card);
  }
  .copy {
    display: grid;
    gap: 0.5rem;
    max-width: 44rem;
  }
  .title {
    margin: 0;
    font-size: 1.375rem;
    line-height: 1.3;
  }
  .body {
    margin: 0;
    color: var(--muted-foreground);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
  }
  @media (min-width: 64rem) {
    .note-grid {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .note-grid .actions {
      justify-content: flex-end;
    }
  }
</style>
