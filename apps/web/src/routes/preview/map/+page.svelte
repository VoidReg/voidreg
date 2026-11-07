<script lang="ts">
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import { resolve } from '$app/paths';
  import MapSection from '$lib/map/MapSection.svelte';
  let { data } = $props();
  const drafts = $derived(data.graph.nodes.filter((n) => n.draft).length);
  const changed = $derived(data.graph.nodes.filter((n) => n.changed && !n.draft).length);
</script>

<svelte:head><title>Preview: Knowledge map</title></svelte:head>
<main id="main-content" class="site-container page-shell">
  <Breadcrumb items={[{ label: 'Published map', href: resolve('/map') }, { label: 'Draft map' }]} />
  <header class="section-stack">
    <p class="eyebrow">Draft knowledge map</p>
    <h1 class="display-heading">The map as it will look once everything is published</h1>
    <p class="lead">
      Dashed items have never been published. {drafts} draft and {changed} edited
      {drafts + changed === 1 ? 'item' : 'items'} shown. Links open the draft preview for each item.
    </p>
  </header>
  <MapSection
    graph={data.graph}
    expanded={data.expanded}
    filter={data.filter}
    loaded={data.loaded}
    focus={data.focus}
    preview
  />
</main>
