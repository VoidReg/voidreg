<script lang="ts">
  import { onMount } from 'svelte';

  let { text, label = 'Copy' }: { text: string; label?: string } = $props();
  // Without JavaScript the button could not work, so it stays hidden until the page is live.
  let ready = $state(false);
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onMount(() => {
    ready = Boolean(navigator.clipboard);
    return () => clearTimeout(timer);
  });
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

{#if ready}
  <button type="button" class="button button-secondary copy-button" onclick={copy}>
    {copied ? 'Copied' : label}
  </button>
  <span class="sr-only" role="status">{copied ? 'Copied to clipboard' : ''}</span>
{/if}

<style>
  .copy-button {
    min-height: 2.25rem;
    padding-block: 0.25rem;
  }
</style>
