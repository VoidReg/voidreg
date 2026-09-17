<script lang="ts">
  let { name, size = 24 }: { name: 'close' | 'menu' | 'moon' | 'sun'; size?: number } = $props();
</script>

<span class="icon" style:width={`${size}px`} style:height={`${size}px`} aria-hidden="true">
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    {#if name === 'sun'}
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      />
    {:else if name === 'moon'}
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    {:else if name === 'menu'}
      <path d="M4 8h16M4 16h16" />
    {:else}
      <path d="m6 6 12 12M18 6 6 18" />
    {/if}
  </svg>
</span>

<style>
  .icon {
    display: inline-grid;
    flex: none;
    place-items: center;
    color: inherit;
  }

  .icon svg {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
