<script lang="ts">
  import type { Block, BlockId } from '@publisle/schema';
  import { outlineText } from './outline-text';
  import { editorLink } from './editor-links';

  type Node = {
    type: string;
    value?: string;
    url?: string;
    ordered?: boolean;
    start?: number;
    content?: Node[];
    children?: Node[];
    items?: Node[];
    [key: string]: unknown;
  };
  let {
    block,
    onUpdate
  }: {
    block: Block;
    onUpdate: (id: BlockId, data: unknown) => void;
  } = $props();
  const data = $derived(block.data as Node);
  function replace(nodes: Node[], index: number, node: Node) {
    return nodes.map((current, i) => (i === index ? node : current));
  }
  function emptyItem(): Node {
    return {
      type: 'listItem',
      children: [{ type: 'paragraph', content: [{ type: 'text', value: '' }] }]
    };
  }
</script>

{#snippet inline(nodes: Node[], update: (nodes: Node[]) => void)}
  {#each nodes as node, index (index)}
    {#if typeof node.value === 'string'}
      <label class="list-field">
        <span
          >{node.type === 'text' ? 'Text' : node.type === 'inlineCode' ? 'Code' : node.type}</span
        >
        <textarea
          rows="2"
          value={node.value}
          oninput={(event) =>
            update(replace(nodes, index, { ...node, value: event.currentTarget.value }))}
        ></textarea>
      </label>
    {:else if node.children}
      <div class="list-inline-group">
        {#if node.type === 'link'}
          <label class="list-field">
            <span>Link URL</span>
            <input
              type="url"
              value={node.url ?? ''}
              oninput={(event) =>
                update(replace(nodes, index, { ...node, url: event.currentTarget.value }))}
            />
          </label>
          {#if editorLink(node.url)}
            <a
              class="block-settings-link"
              href={editorLink(node.url)}
              target="_blank"
              rel="noopener noreferrer">Open link ↗</a
            >
          {/if}
        {/if}
        {@render inline(node.children, (children) =>
          update(replace(nodes, index, { ...node, children }))
        )}
      </div>
    {:else}
      <p class="editor-help">
        {outlineText(node) || node.type} — edit this inline element in Block JSON.
      </p>
    {/if}
  {/each}
  {#if nodes.length === 0}
    <button
      type="button"
      class="editor-button secondary"
      onclick={() => update([{ type: 'text', value: '' }])}>Add text</button
    >
  {/if}
{/snippet}

{#snippet list(node: Node, update: (node: Node) => void)}
  <div class="list-editor">
    <label class="list-numbered">
      <input
        type="checkbox"
        checked={node.ordered === true}
        onchange={(event) => update({ ...node, ordered: event.currentTarget.checked })}
      />
      Numbered list
    </label>
    {#if node.ordered}
      <label class="list-field">
        <span>Start number</span>
        <input
          type="number"
          min="1"
          value={node.start ?? 1}
          onchange={(event) =>
            update({ ...node, start: Math.max(1, Number(event.currentTarget.value) || 1) })}
        />
      </label>
    {/if}
    {#each node.items ?? [] as item, index (index)}
      <fieldset class="list-item-editor">
        <legend>Item {index + 1}</legend>
        {#each item.children ?? [] as child, childIndex (childIndex)}
          {#if child.type === 'paragraph'}
            {@render inline(child.content ?? [], (content) =>
              update({
                ...node,
                items: replace(node.items ?? [], index, {
                  ...item,
                  children: replace(item.children ?? [], childIndex, { ...child, content })
                })
              })
            )}
          {:else if child.type === 'list'}
            {@render list(child, (changed) =>
              update({
                ...node,
                items: replace(node.items ?? [], index, {
                  ...item,
                  children: replace(item.children ?? [], childIndex, changed)
                })
              })
            )}
          {:else}
            <p class="editor-help">
              {outlineText(child) || child.type} — edit this element in Block JSON.
            </p>
          {/if}
        {/each}
        {#if !item.children?.length}
          <button
            type="button"
            class="editor-button secondary"
            onclick={() =>
              update({
                ...node,
                items: replace(node.items ?? [], index, { ...item, children: emptyItem().children })
              })}>Add text</button
          >
        {/if}
        <button
          type="button"
          class="block-settings-link"
          onclick={() =>
            update({ ...node, items: (node.items ?? []).filter((_, i) => i !== index) })}
          >Remove item {index + 1}</button
        >
      </fieldset>
    {/each}
    <button
      type="button"
      class="editor-button secondary"
      onclick={() => update({ ...node, items: [...(node.items ?? []), emptyItem()] })}
      >Add item</button
    >
  </div>
{/snippet}

{@render list(data, (changed) => onUpdate(block.id, changed))}

<style>
  .list-editor,
  .list-item-editor,
  .list-field,
  .list-inline-group {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }
  .list-item-editor {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
  }
  .list-item-editor legend {
    padding-inline: 0.25rem;
    font-weight: 500;
  }
  .list-field > span {
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .list-field input,
  .list-field textarea {
    width: 100%;
    min-width: 0;
  }
  .list-numbered {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .list-numbered input {
    width: auto;
  }
</style>
