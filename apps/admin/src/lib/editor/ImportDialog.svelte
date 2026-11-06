<script lang="ts">
  let {
    open = $bindable(false),
    onimport
  }: { open: boolean; onimport: (source: string, format: string) => void } = $props();
  let dialog = $state<HTMLDialogElement>();
  let text = $state('');
  let format = $state('markdown');
  $effect(() => {
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  class="ui-dialog"
  aria-labelledby="import-title"
  onclose={() => (open = false)}
  onclick={(event) => {
    if (event.target === dialog) open = false;
  }}
>
  <form
    class="ui-dialog-body"
    method="dialog"
    onsubmit={(event) => {
      event.preventDefault();
      if (!text.trim()) return;
      onimport(text, format);
      text = '';
      open = false;
    }}
  >
    <h2 id="import-title">Import document</h2>
    <p>Replaces the current blocks with the imported content.</p>
    <label class="ui-field"
      >Format<select bind:value={format}
        ><option value="markdown">Markdown</option><option value="json">Publisle JSON</option
        ></select
      ></label
    >
    <label class="ui-field">Document<textarea rows="10" bind:value={text}></textarea></label>
    <div class="ui-dialog-actions">
      <button type="button" class="ui-btn" onclick={() => (open = false)}>Cancel</button>
      <button type="submit" class="ui-btn ui-btn-primary" disabled={!text.trim()}>Import</button>
    </div>
  </form>
</dialog>
