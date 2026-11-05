<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import { blockTypes, blockLabels } from '@publisle/playground';
  import { extensions } from '$lib/blocks';
  let { oninsert }: { oninsert: (type: string) => void } = $props();
  let search = $state('');
  let menu: HTMLDetailsElement;
  const labels = blockLabels(extensions);
  const matches = $derived(
    blockTypes(extensions).filter((type) =>
      (labels[type] ?? type).toLowerCase().includes(search.toLowerCase())
    )
  );
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && menu?.open && menu.contains(event.target as Node)) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  }}
/>
<details
  class="block-inserter"
  bind:this={menu}
  ontoggle={() => {
    if (!menu.open) search = '';
  }}
>
  <summary class="insert-trigger"><Icon name="plus" size={16} /> Add block</summary>
  <div class="insert-menu">
    <label class="editor-field"
      >Find a block<input
        type="search"
        bind:value={search}
        placeholder="Paragraph, code, math..."
      /></label
    >
    <div class="insert-options">
      {#each matches as type (type)}<button
          type="button"
          onclick={() => {
            menu.open = false;
            oninsert(type);
          }}>{labels[type] ?? type}</button
        >{/each}
    </div>
    {#if matches.length === 0}<p class="editor-help">No matching blocks.</p>{/if}
  </div>
</details>
