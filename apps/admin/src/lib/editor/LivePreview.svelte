<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { Diagnostic } from '@publisle/schema';
  import ArticleBody from '@voidreg/publishing-ui/ArticleBody.svelte';
  import type { Article } from '@voidreg/publishing-ui/api';

  interface Props {
    article: Article;
    diagnostics: readonly Diagnostic[];
    /** Every block id in document order, used to find the nearest rendered heading. */
    blockIds: readonly string[];
    /** The block the editor is focused on or scrolled to. */
    target: string | null;
    exact: boolean;
    rendering: boolean;
    /** Whether the pane is its own scroll area (side by side layout). */
    scrolls: boolean;
    onpick: (id: string) => void;
    onrender: () => unknown;
  }
  let {
    article,
    diagnostics,
    blockIds,
    target,
    exact,
    rendering,
    scrolls,
    onpick,
    onrender
  }: Props = $props();

  let viewport = $state<'desktop' | 'mobile'>('desktop');
  let shown = $state.raw<Article>(untrack(() => article));
  let pane = $state<HTMLElement>();
  let body = $state<HTMLElement>();

  // Rendering a long document on every keystroke is wasteful, so changes settle first.
  $effect(() => {
    const next = article;
    const timer = setTimeout(
      // Keep the last good render visible while the document has errors.
      () => (shown = next.compiled ? next : { ...next, compiled: shown.compiled }),
      300
    );
    return () => clearTimeout(timer);
  });

  const problems = $derived(diagnostics.filter((item) => item.level === 'error'));
  const warnings = $derived(diagnostics.filter((item) => item.level === 'warning'));

  // Only some rendered elements carry a block id, so a block scrolls to the nearest one at or before it.
  function anchorFor(id: string) {
    const index = blockIds.indexOf(id);
    if (!body || index < 0) return null;
    for (let i = index; i >= 0; i--) {
      const found = body.querySelector<HTMLElement>(
        `[data-publisle-id="${CSS.escape(blockIds[i])}"]`
      );
      if (found) return found;
    }
    return null;
  }
  $effect(() => {
    const id = target;
    void shown;
    if (!id || !scrolls) return;
    void tick().then(() => {
      const element = anchorFor(id);
      if (!element || !pane) return;
      const offset = element.getBoundingClientRect().top - pane.getBoundingClientRect().top;
      pane.scrollTo({ top: pane.scrollTop + offset - 72, behavior: 'instant' });
    });
  });

  function click(event: MouseEvent) {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-publisle-id]');
    const id = element?.getAttribute('data-publisle-id');
    if (id && blockIds.includes(id)) onpick(id);
  }
</script>

<aside
  class="live-preview-pane"
  class:scrolls
  aria-label="Live preview"
  bind:this={pane}
  data-viewport={viewport}
>
  <header class="live-preview-bar">
    <div class="live-preview-title">
      <h2 class="sidebar-heading">Live preview</h2>
      <span class="editor-help" role="status"
        >{exact ? 'Exact render' : 'Quick preview, diagrams may differ'}</span
      >
    </div>
    <div class="live-preview-actions">
      <div class="live-preview-viewport" role="group" aria-label="Preview width">
        <button
          type="button"
          aria-pressed={viewport === 'desktop'}
          onclick={() => (viewport = 'desktop')}>Desktop</button
        ><button
          type="button"
          aria-pressed={viewport === 'mobile'}
          onclick={() => (viewport = 'mobile')}>Mobile</button
        >
      </div>
      <button
        type="button"
        class="editor-button secondary"
        disabled={rendering || exact}
        onclick={onrender}>{rendering ? 'Rendering...' : 'Render exactly'}</button
      >
    </div>
  </header>
  {#if problems.length || warnings.length}
    <div class="live-preview-problems" aria-label="Preview problems">
      {#each problems as item, index (index)}
        <p>Error: {item.message}</p>
      {/each}
      {#if warnings.length}
        <details class="live-preview-warnings">
          <summary>{warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}</summary>
          {#each warnings as item, index (index)}
            <p>{item.message}</p>
          {/each}
        </details>
      {/if}
    </div>
  {/if}
  <div class="live-preview-frame">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <article class="live-preview-article" bind:this={body} onclick={click}>
      <p class="editor-kicker">{shown.category || 'Uncategorized'}</p>
      <h1 class="preview-article-title">{shown.title || 'Untitled'}</h1>
      {#if shown.summary}<p class="preview-summary">{shown.summary}</p>{/if}
      {#if problems.length}
        <p class="editor-help">Resolve document errors to refresh the preview.</p>
      {/if}
      {#if shown.compiled}
        <ArticleBody article={shown} />
      {/if}
    </article>
  </div>
</aside>
