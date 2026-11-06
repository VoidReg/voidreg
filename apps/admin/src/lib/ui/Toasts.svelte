<script lang="ts">
  import { toasts } from './toast.svelte';
</script>

<div class="ui-toasts" role="region" aria-label="Notifications">
  {#each toasts.items as toast (toast.id)}
    <div
      class={`ui-toast ui-toast-${toast.tone}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
    >
      <p>{toast.text}</p>
      {#if toast.action}
        <button
          type="button"
          class="ui-btn ui-btn-small"
          onclick={() => {
            toast.action?.run();
            toasts.dismiss(toast.id);
          }}>{toast.action.label}</button
        >
      {/if}
      <button
        type="button"
        class="ui-btn ui-btn-small ui-btn-quiet"
        aria-label="Dismiss notification"
        onclick={() => toasts.dismiss(toast.id)}>Dismiss</button
      >
    </div>
  {/each}
</div>
