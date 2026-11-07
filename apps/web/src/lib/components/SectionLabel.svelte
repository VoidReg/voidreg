<script lang="ts">
  // A numbered section marker such as "02 / Background": the index, a short rule, then the name.
  // Labels without a number fall back to the plain eyebrow.
  let { label }: { label: string } = $props();
  const parts = $derived(/^(\d{1,2}) \/ (.+)$/.exec(label.trim()));
</script>

{#if parts}
  <p class="section-label">
    <span class="section-label-index" aria-hidden="true">{parts[1]}</span>
    <span class="section-label-rule" aria-hidden="true"></span>
    <span class="section-label-text">{parts[2]}</span>
  </p>
{:else}
  <p class="eyebrow">{label}</p>
{/if}
