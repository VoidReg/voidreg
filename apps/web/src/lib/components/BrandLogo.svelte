<script lang="ts">
  // The full lockup: mark and wordmark in one image per theme (built by scripts/make-logo.py).
  // The ratio is that of the SVG, so the space is reserved before the image loads.
  // Size it with --logo-height on a parent (default 30px).
  const ratio = 443.2 / 101.2;
  const height = 30;
</script>

<span class="brand-logo">
  <img
    class="light-logo"
    src="/brand/voidreg-logo-light.svg"
    alt="Voidreg"
    width={Math.round(height * ratio)}
    {height}
  />
  <img
    class="dark-logo"
    src="/brand/voidreg-logo-dark.svg"
    alt=""
    aria-hidden="true"
    width={Math.round(height * ratio)}
    {height}
  />
</span>

<style>
  .brand-logo {
    display: block;
    flex: none;
    height: var(--logo-height, 30px);
    aspect-ratio: 443.2 / 101.2;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .dark-logo {
    display: none;
  }
  :global(.dark) .light-logo {
    display: none;
  }
  :global(.dark) .dark-logo {
    display: block;
  }
</style>
