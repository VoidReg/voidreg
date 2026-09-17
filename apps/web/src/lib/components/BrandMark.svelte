<script lang="ts">
  import flatDark from '$lib/assets/brand-mark-dark.svg';
  import flatLight from '$lib/assets/brand-mark-light.svg';
  import heroDark from '$lib/assets/hero-mark-dark.svg';
  import heroLight from '$lib/assets/hero-mark-light.svg';

  let { size = 32, extruded = false }: { size?: number; extruded?: boolean } = $props();
</script>

<span class="brand-mark" style:width={`${size}px`} style:height={`${size}px`} aria-hidden="true">
  <img
    class="light-mark"
    src={extruded ? heroLight : flatLight}
    alt=""
    width={size}
    height={size}
  />
  <img class="dark-mark" src={extruded ? heroDark : flatDark} alt="" width={size} height={size} />
</span>

<style>
  .brand-mark {
    display: block;
    flex: none;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .dark-mark {
    display: none;
  }
  :global(.dark) .light-mark {
    display: none;
  }
  :global(.dark) .dark-mark {
    display: block;
  }
</style>
