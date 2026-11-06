<script lang="ts">
  let {
    state,
    diagnostics = []
  }: { state: 'pending' | 'failed'; diagnostics?: { message?: string; code?: string }[] } =
    $props();
</script>

<svelte:head>
  {#if state === 'pending'}<meta http-equiv="refresh" content="3" />{/if}
</svelte:head>

<main id="main-content" class="site-container page-shell">
  <div class="empty-block" role="status">
    {#if state === 'pending'}
      <h1 class="section-heading">Building the preview</h1>
      <p>The draft is still compiling. This page will refresh by itself.</p>
    {:else}
      <h1 class="section-heading">The draft could not be compiled</h1>
      <p>Fix these problems in the editor, save, then open the preview again.</p>
      {#if diagnostics.length}<ul>
          {#each diagnostics as item, i (i)}<li>
              {item.message ?? item.code ?? 'Unknown problem'}
            </li>{/each}
        </ul>{/if}
    {/if}
  </div>
</main>
