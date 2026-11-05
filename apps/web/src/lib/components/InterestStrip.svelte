<script lang="ts">
  let { items, label }: { items: string[]; label: string } = $props();
</script>

<section class="band band-primary strip" aria-label={label}>
  <div class="strip-track">
    <ul class="strip-list">
      {#each items as item (item)}<li class="strip-item">{item}</li>{/each}
    </ul>
    <ul class="strip-list strip-dup" aria-hidden="true">
      {#each items as item (item)}<li class="strip-item">{item}</li>{/each}
    </ul>
  </div>
</section>
