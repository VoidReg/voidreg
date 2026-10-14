<script lang="ts">
  let { payload }: { payload: { initial: number; step: number } } = $props();
  let value = $derived(payload.initial);
</script>

<div class="section-stack" aria-label="Counter demonstration">
  <p role="status">Count: {value}</p>
  <div class="button-row">
    <button class="button" onclick={() => (value += payload.step)}>Add {payload.step}</button>
    <button class="button button-secondary" onclick={() => (value = payload.initial)}>Reset</button>
  </div>
</div>
