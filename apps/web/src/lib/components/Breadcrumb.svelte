<script lang="ts">
  // Trail of links ending at the current page. Callers pass links already resolved.
  let { items }: { items: { label: string; href?: string }[] } = $props();
</script>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <ol>
    {#each items as item, index (index)}
      <li>
        {#if item.href && index < items.length - 1}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a href={item.href}>{item.label}</a>
        {:else}
          <span
            aria-current={index === items.length - 1 ? 'page' : undefined}
            title={index === items.length - 1 ? item.label : undefined}>{item.label}</span
          >
        {/if}
      </li>
    {/each}
  </ol>
</nav>
