<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import type { Diagnostic, BlockId } from '@publisle/schema';
  import { outlineText } from './outline-text';

  interface OutlineBlock {
    id: BlockId;
    type: string;
  }
  let {
    blocks,
    labels,
    selectedId,
    diagnostics,
    title,
    onselect,
    onmove,
    onreorder,
    ontitle
  }: {
    blocks: (OutlineBlock & { data?: unknown })[];
    labels: Record<string, string>;
    selectedId: string | undefined;
    diagnostics: readonly Diagnostic[];
    title: string;
    onselect: (id: BlockId) => void;
    onmove: (id: BlockId, direction: 'up' | 'down') => void;
    onreorder: (from: BlockId, to: BlockId) => void;
    ontitle: () => void;
  } = $props();

  let dragging = $state<BlockId | undefined>();
  const issues = (id: string) => diagnostics.filter((d) => d.blockId === id);

  async function key(event: KeyboardEvent, id: BlockId) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const button = event.currentTarget as HTMLElement;
    onmove(id, event.key === 'ArrowUp' ? 'up' : 'down');
    await tick();
    document
      .querySelector<HTMLElement>(`[data-outline-id="${id}"]`)
      ?.focus({ preventScroll: false });
    void button;
  }
</script>

<aside class="document-outline" aria-label="Document outline">
  <div class="panel-heading">
    <h2 class="sidebar-heading">Outline</h2>
    <span class="editor-help">{blocks.length}</span>
  </div>
  <button class="outline-title" onclick={ontitle}>{title}</button>
  {#if blocks.length === 0}<p class="editor-help outline-empty">
      Your blocks will appear here as you write.
    </p>{/if}
  <ol class="outline-list">
    {#each blocks as block, index (block.id)}
      {@const found = issues(block.id)}
      <li
        class:dragging={dragging === block.id}
        draggable="true"
        ondragstart={() => (dragging = block.id)}
        ondragend={() => (dragging = undefined)}
        ondragover={(event) => event.preventDefault()}
        ondrop={(event) => {
          event.preventDefault();
          if (dragging && dragging !== block.id) onreorder(dragging, block.id);
          dragging = undefined;
        }}
      >
        <button
          class:current={selectedId === block.id}
          aria-current={selectedId === block.id ? 'true' : undefined}
          data-outline-id={block.id}
          onclick={() => onselect(block.id)}
          onkeydown={(event) => key(event, block.id)}
          ><span class="outline-number">{String(index + 1).padStart(2, '0')}</span><span
            ><span class="outline-label"
              >{labels[block.type] ?? block.type}{#if found.length}<span
                  class="outline-issue"
                  role="img"
                  aria-label={`${found.length} issue${found.length === 1 ? '' : 's'}`}
                  >{found.length}</span
                >{/if}</span
            ><span class="outline-description"
              >{outlineText(block.data).slice(0, 80) +
                (outlineText(block.data).length > 80 ? '...' : '') || 'No content yet'}</span
            ></span
          ></button
        >
        {#if selectedId === block.id}
          <span class="outline-move">
            <button
              type="button"
              aria-label={`Move block ${index + 1} up`}
              disabled={index === 0}
              onclick={() => onmove(block.id, 'up')}><Icon name="chevron-up" size={16} /></button
            ><button
              type="button"
              aria-label={`Move block ${index + 1} down`}
              disabled={index === blocks.length - 1}
              onclick={() => onmove(block.id, 'down')}
              ><Icon name="chevron-down" size={16} /></button
            >
          </span>
        {/if}
      </li>
    {/each}
  </ol>
  <p class="outline-guidance editor-help">
    Select a block to edit. Drag to reorder, or press Alt with the arrow keys.
  </p>
</aside>

<style>
  .outline-issue {
    display: inline-grid;
    place-items: center;
    margin-inline-start: 0.5rem;
    border: 1px solid var(--danger);
    min-width: 1.25rem;
    color: var(--danger);
    font-family: var(--font-code);
    font-size: 0.6875rem;
  }
  li.dragging {
    opacity: 0.5;
  }
  .outline-move {
    display: flex;
    gap: 0.25rem;
    justify-content: flex-end;
    padding: 0.25rem 0.5rem 0.5rem;
  }
  li .outline-move button {
    display: grid;
    grid-template-columns: 1fr;
    padding: 0;
    place-items: center;
    border: 1px solid var(--input);
    background: var(--background);
    width: 2.25rem;
    height: 2.25rem;
    color: var(--foreground);
    cursor: pointer;
  }
  li .outline-move button:disabled {
    color: var(--disabled-foreground);
    cursor: not-allowed;
  }
</style>
