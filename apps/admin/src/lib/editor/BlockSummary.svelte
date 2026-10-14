<script lang="ts">
  import type { Block } from '@publisle/schema';
  let { block }: { block: Block } = $props();
  function text(value: unknown): string {
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' ');
    if (!value || typeof value !== 'object') return '';
    const node = value as Record<string, unknown>;
    if (typeof node.value === 'string') return node.value;
    return ['content', 'children', 'items', 'caption', 'title', 'description', 'fallback']
      .map((key) => text(node[key]))
      .filter(Boolean)
      .join(' ');
  }
  const data = $derived(
    (block.data && typeof block.data === 'object' ? block.data : {}) as Record<string, unknown>
  );
  const content = $derived(text(data));
</script>

{#if block.type === 'publisle:heading'}
  <p class="block-heading-summary">{content || 'Untitled heading'}</p>
{:else if block.type === 'publisle:code'}
  <pre class="block-code-summary"><code>{String(data.value ?? 'Empty code block')}</code></pre>
{:else if block.type === 'publisle:list' && Array.isArray(data.items)}
  <ul class="block-list-summary">
    {#each data.items as item, index (index)}<li>{text(item)}</li>{/each}
  </ul>
{:else if block.type === 'publisle:divider'}
  <hr />
{:else}
  <p class="block-content-summary">{content || 'Select this block to edit its content.'}</p>
{/if}
