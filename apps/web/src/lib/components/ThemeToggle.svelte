<script lang="ts">
  import { onMount } from 'svelte';
  import { setTheme } from '$lib/theme';
  import Icon from './Icon.svelte';

  let dark = $state(false);

  onMount(() => {
    dark = document.documentElement.classList.contains('dark');
  });

  function toggleTheme() {
    dark = !document.documentElement.classList.contains('dark');
    setTheme(dark ? 'dark' : 'light');
  }
</script>

<button
  type="button"
  class="theme-toggle"
  aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
  aria-pressed={dark}
  onclick={toggleTheme}
>
  <span class="theme-toggle-face">
    <span class="theme-icon theme-icon-light"><Icon name="moon" /></span>
    <span class="theme-icon theme-icon-dark"><Icon name="sun" /></span>
  </span>
</button>

<style>
  .theme-icon-dark {
    display: none;
  }

  :global(.dark) .theme-icon-light {
    display: none;
  }

  :global(.dark) .theme-icon-dark {
    display: grid;
  }
</style>
