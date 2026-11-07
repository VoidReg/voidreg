<script lang="ts">
  import { initial } from '$lib/publishing/discussion';
  let { name, src, size = 40 }: { name: string; src?: string | null; size?: number } = $props();
  let failed = $state(false);
  $effect(() => {
    void src;
    failed = false;
  });
</script>

<span class="avatar" style:--size={`${size / 16}rem`} aria-hidden="true">
  {#if src && !failed}<img
      {src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      onerror={() => (failed = true)}
    />{:else}{initial(name)}{/if}
</span>

<style>
  .avatar {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: var(--size);
    height: var(--size);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--secondary);
    color: var(--secondary-foreground);
    font: 600 calc(var(--size) * 0.38) / 1 var(--font-ui);
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
