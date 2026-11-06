<script lang="ts">
  import KnowledgeMap from './KnowledgeMap.svelte';
  import MapOutline from './MapOutline.svelte';
  import { buildModel, type Graph, type MapFilter } from './layout';

  let {
    graph,
    expanded,
    filter,
    open,
    focus = '',
    preview = false
  }: {
    graph: Graph;
    expanded: Graph[];
    filter: MapFilter;
    open: string[];
    focus?: string;
    preview?: boolean;
  } = $props();
  const model = $derived(buildModel(graph, expanded));
</script>

<section class="map-section" aria-label="Map">
  <div class="map-desktop">
    <KnowledgeMap {model} {filter} {open} {focus} {preview} />
  </div>
  <details class="map-outline" open={model.projects.length <= 40}>
    <summary>Text outline</summary>
    <MapOutline {model} {filter} {preview} />
  </details>
</section>

<style>
  .map-desktop {
    display: none;
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

  .map-section {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
  }

  @media (min-width: 48rem) {
    .map-desktop {
      display: block;
    }

    .map-outline:not([open]) {
      padding-block: 0.75rem;
    }

    .map-outline:not([open]) summary {
      margin-bottom: 0;
    }
  }
</style>
