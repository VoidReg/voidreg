<script lang="ts">
  let {
    name,
    size = 24
  }: {
    name:
      | 'close'
      | 'menu'
      | 'moon'
      | 'sun'
      | 'arrow-right'
      | 'arrow-left'
      | 'plus'
      | 'file'
      | 'folder'
      | 'image'
      | 'message'
      | 'plug'
      | 'more'
      | 'history'
      | 'check'
      | 'chevron-up'
      | 'chevron-down'
      | 'search'
      | 'logout';
    size?: number;
  } = $props();
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
    {:else if name === 'arrow-right'}
      <path d="M4 12h16m-6-6 6 6-6 6" />
    {:else if name === 'arrow-left'}
      <path d="M20 12H4m6-6-6 6 6 6" />
    {:else if name === 'plus'}
      <path d="M12 5v14M5 12h14" />
    {:else if name === 'menu'}
      <path d="M4 8h16M4 16h16" />
    {:else if name === 'file'}
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6" />
    {:else if name === 'folder'}
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    {:else if name === 'image'}
      <path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01" />
    {:else if name === 'message'}
      <path d="M4 5h16v11H9l-5 4z" />
    {:else if name === 'plug'}
      <path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4" />
    {:else if name === 'more'}
      <path d="M5 12h.01M12 12h.01M19 12h.01" />
    {:else if name === 'history'}
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
    {:else if name === 'check'}
      <path d="m5 12 5 5L20 7" />
    {:else if name === 'chevron-up'}
      <path d="m6 15 6-6 6 6" />
    {:else if name === 'chevron-down'}
      <path d="m6 9 6 6 6-6" />
    {:else if name === 'search'}
      <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5" />
    {:else if name === 'logout'}
      <path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9" />
    {:else}
      <path d="m6 6 12 12M18 6 6 18" />
    {/if}
  </svg>
</span>

<style>
  .icon {
    display: inline-grid;
    vertical-align: middle;
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
