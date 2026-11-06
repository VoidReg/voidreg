<script lang="ts">
  let { open = $bindable(false) }: { open: boolean } = $props();
  let dialog = $state<HTMLDialogElement>();
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? 'Cmd' : 'Ctrl';
  const rows: [string, string][] = [
    [`${mod} + S`, 'Save the draft now'],
    [`${mod} + Enter`, 'Publish or update'],
    ['Alt + Up / Down', 'Move the selected block, or the focused outline row'],
    ['Enter on an outline row', 'Edit that block'],
    ['Left / Right in a tab list', 'Switch tabs'],
    ['?', 'Show this list']
  ];
  $effect(() => {
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  class="ui-dialog"
  aria-labelledby="shortcut-title"
  onclose={() => (open = false)}
  onclick={(event) => {
    if (event.target === dialog) open = false;
  }}
>
  <div class="ui-dialog-body">
    <h2 id="shortcut-title">Keyboard shortcuts</h2>
    <dl class="shortcut-list">
      {#each rows as [keys, what] (keys)}
        <div>
          <dt><kbd class="ui-kbd">{keys}</kbd></dt>
          <dd>{what}</dd>
        </div>
      {/each}
    </dl>
    <div class="ui-dialog-actions">
      <button type="button" class="ui-btn" onclick={() => (open = false)}>Close</button>
    </div>
  </div>
</dialog>

<style>
  .shortcut-list {
    display: grid;
    gap: 0.5rem;
    margin: 0;
  }
  .shortcut-list div {
    display: grid;
    grid-template-columns: 11rem minmax(0, 1fr);
    gap: 0.75rem;
    align-items: baseline;
  }
  dd {
    margin: 0;
    color: var(--foreground);
    font-size: 0.875rem;
  }
</style>
