<script lang="ts">
  import { page } from '$app/state';
  import type { PreviewInfo } from '$lib/server/preview';
  let { children } = $props();
  const info = $derived(page.data.preview as PreviewInfo | undefined);
  const editor = $derived(
    info?.kind === 'project' && info.slug
      ? `/admin/?project=${encodeURIComponent(info.slug)}`
      : info?.kind === 'post' && info.slug
        ? `/admin/?article=${encodeURIComponent(info.slug)}`
        : '/admin/'
  );
</script>

<svelte:head><meta name="robots" content="noindex, nofollow" /></svelte:head>

<div class="preview-banner" role="status">
  <p>
    <strong>Draft preview, not published.</strong>
    {#if info?.revision}<span class="preview-detail">Revision {info.revision}.</span>{/if}
    {#if info?.draft}<span class="preview-detail">This has never been published.</span
      >{:else if info?.changed}<span class="preview-detail"
        >It has unpublished changes, so the public page still shows the previous version.</span
      >{:else if info?.revision !== undefined && info.kind !== 'map'}<span class="preview-detail"
        >It matches the published version.</span
      >{/if}
  </p>
  <p class="preview-links">
    <!-- eslint-disable svelte/no-navigation-without-resolve -- the admin app is a separate bundle -->
    <a href={editor}>Back to the editor</a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </p>
</div>
{@render children()}

<style>
  .preview-banner {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    align-items: baseline;
    justify-content: space-between;
    border-bottom: 1px solid var(--foreground);
    background: var(--foreground);
    padding: 0.75rem clamp(1rem, 4vw, 2rem);
    color: var(--background);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .preview-banner p {
    margin: 0;
  }

  .preview-detail {
    margin-inline-start: 0.5rem;
    opacity: 0.85;
  }

  .preview-banner a {
    color: var(--background);
    text-underline-offset: 0.2em;
  }
</style>
