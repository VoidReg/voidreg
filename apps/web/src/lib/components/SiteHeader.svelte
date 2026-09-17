<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import BrandMark from './BrandMark.svelte';
  import Icon from './Icon.svelte';
  import ThemeToggle from './ThemeToggle.svelte';

  let menuOpen = $state(false);
  const current = (path: string) => page.url.pathname === path;
</script>

<header class="site-header">
  <div class="site-container header-inner">
    <a class="brand-link" href={resolve('/')} aria-label="Voidreg home"
      ><BrandMark /><span>Voidreg</span></a
    >

    <div class="desktop-actions desktop-only">
      <nav class="nav-links" aria-label="Primary navigation">
        <a
          class="nav-link"
          aria-current={current('/projects') ? 'page' : undefined}
          href={resolve('/projects')}>Projects</a
        >
        <a
          class="nav-link"
          aria-current={current('/about') ? 'page' : undefined}
          href={resolve('/about')}>About</a
        >
        <span class="nav-link nav-link-disabled" aria-disabled="true">Blog</span>
        <a class="button" href={resolve('/about#contact')}>Contact</a>
      </nav>
      <ThemeToggle />
    </div>

    <div class="header-controls mobile-only">
      <ThemeToggle />
      <button
        type="button"
        class="menu-toggle"
        aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={menuOpen}
        aria-controls="mobile-navigation"
        onclick={() => (menuOpen = !menuOpen)}
      >
        {#if menuOpen}
          <Icon name="close" />
        {:else}
          <Icon name="menu" />
        {/if}
      </button>
    </div>
  </div>

  {#if menuOpen}
    <nav id="mobile-navigation" class="mobile-menu" aria-label="Mobile navigation">
      <a class="nav-link" href={resolve('/')} onclick={() => (menuOpen = false)}>Home</a>
      <a
        class="nav-link"
        aria-current={current('/projects') ? 'page' : undefined}
        href={resolve('/projects')}
        onclick={() => (menuOpen = false)}>Projects</a
      >
      <a
        class="nav-link"
        aria-current={current('/about') ? 'page' : undefined}
        href={resolve('/about')}
        onclick={() => (menuOpen = false)}>About</a
      >
      <a class="nav-link" href={resolve('/about#contact')} onclick={() => (menuOpen = false)}
        >Contact</a
      >
      <span class="nav-link nav-link-disabled" aria-disabled="true">Blog</span>
    </nav>
  {/if}
</header>
