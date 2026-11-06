<script lang="ts">
  import { resolve } from '$app/paths';
  import KnowledgeMap from '$lib/map/KnowledgeMap.svelte';
  import MapOutline from '$lib/map/MapOutline.svelte';
  let { data } = $props();
  const drafts = $derived(data.graph.nodes.filter((n) => n.draft).length);
  const changed = $derived(data.graph.nodes.filter((n) => n.changed && !n.draft).length);
</script>

<svelte:head><title>Preview: Knowledge map</title></svelte:head>
<main id="main-content" class="site-container page-shell">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href={resolve('/map')}>Published map</a><span>/</span><span aria-current="page"
      >Draft map</span
    >
  </nav>
  <header class="section-stack">
    <p class="eyebrow">Draft knowledge map</p>
    <h1 class="display-heading">The map as it will look once everything is published</h1>
    <p class="lead">
      Dashed items have never been published. {drafts} draft and {changed} edited
      {drafts + changed === 1 ? 'item' : 'items'} shown. Links open the draft preview for each item.
    </p>
  </header>
  <section class="map-section" aria-label="Map">
    <div class="map-desktop">
      <KnowledgeMap graph={data.graph} focus={data.focus} preview />
    </div>
    <details class="map-outline" open>
      <summary>Text outline</summary>
      <MapOutline graph={data.graph} preview />
    </details>
  </section>
</main>

<style>
  .map-desktop {
    display: none;
  }

  .map-section {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
  }

  .map-outline {
    border: 1px solid var(--border);
    background: var(--card);
    padding: 1.25rem 1.5rem;
  }

  .map-outline summary {
    margin-bottom: 1rem;
    cursor: pointer;
    font-family: var(--font-code);
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  @media (min-width: 48rem) {
    .map-desktop {
      display: block;
    }
  }
</style>
