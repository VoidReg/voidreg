<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<div class="reading-column">
  <div class="reading-content">{@render children()}</div>
</div>

<style>
  /* Resolve the measure at the prose font size, independent of child typography. */
  .reading-column {
    min-width: 0;
    width: min(100%, var(--prose-width));
    margin-inline: auto;
    font-size: 1.125rem;
  }

  .reading-content {
    min-width: 0;
    font-size: 1rem;
  }

  .reading-content :global(.comments) {
    width: 100%;
  }
</style>
