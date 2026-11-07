<script lang="ts">
  import { resolve } from '$app/paths';
  import BrandLogo from './BrandLogo.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
</script>

<header class="site-header error-header">
  <div class="site-container header-inner">
    <a class="brand-link" href={resolve('/')} aria-label="Voidreg home"><BrandLogo /></a>

    <div class="desktop-actions">
      <ThemeToggle />
    </div>
  </div>
</header>
