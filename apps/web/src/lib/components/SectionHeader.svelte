<script lang="ts">
  let { index, eyebrow, title, id }: { index: string; eyebrow: string; title: string; id: string } =
    $props();
</script>

<div class="section-head">
  <span class="section-index" aria-hidden="true">{index}</span>
  <p class="eyebrow">{eyebrow}</p>
  <h2 {id} class="section-heading">{title}</h2>
</div>
