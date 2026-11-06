<script lang="ts">
  import { confirmState } from './confirm.svelte';

  let dialog = $state<HTMLDialogElement>();
  let typed = $state('');
  const pending = $derived(confirmState.current);
  const ready = $derived(!pending?.typeToConfirm || typed.trim() === pending.typeToConfirm);

  $effect(() => {
    if (pending && dialog && !dialog.open) {
      typed = '';
      dialog.showModal();
    }
  });

  function close(ok: boolean) {
    const current = confirmState.current;
    if (!current) return;
    confirmState.current = null;
    dialog?.close();
    current.resolve(ok);
  }
</script>

<dialog
  bind:this={dialog}
  class="ui-dialog"
  aria-labelledby="confirm-title"
  aria-describedby="confirm-body"
  oncancel={(event) => {
    event.preventDefault();
    close(false);
  }}
  onclick={(event) => {
    if (event.target === dialog) close(false);
  }}
>
  {#if pending}
    <form
      method="dialog"
      class="ui-dialog-body"
      onsubmit={(event) => {
        event.preventDefault();
        if (ready) close(true);
      }}
    >
      <h2 id="confirm-title">{pending.title}</h2>
      <p id="confirm-body">{pending.body ?? ''}</p>
      {#if pending.typeToConfirm}
        <label class="ui-field"
          >Type <code>{pending.typeToConfirm}</code> to confirm
          <input bind:value={typed} autocomplete="off" spellcheck="false" />
        </label>
      {/if}
      <div class="ui-dialog-actions">
        <button type="button" class="ui-btn" onclick={() => close(false)}
          >{pending.cancelLabel ?? 'Cancel'}</button
        >
        <button
          type="submit"
          class={pending.danger ? 'ui-btn ui-btn-danger' : 'ui-btn ui-btn-primary'}
          disabled={!ready}>{pending.confirmLabel ?? 'Confirm'}</button
        >
      </div>
    </form>
  {/if}
</dialog>
