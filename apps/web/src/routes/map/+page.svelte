<script lang="ts">
  import { resolve } from '$app/paths';
  import KnowledgeMap from '$lib/map/KnowledgeMap.svelte';
  import MapOutline from '$lib/map/MapOutline.svelte';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();
  const projects = $derived(data.graph.nodes.filter((n) => n.kind === 'project').length);
  const posts = $derived(data.graph.nodes.filter((n) => n.kind === 'post').length);
</script>

<Seo
  title="Knowledge map | Voidreg"
  description="How Voidreg projects, the posts that follow them, and the technologies they share connect."
/>
<main id="main-content" class="site-container page-shell">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href={resolve('/')}>Home</a><span>/</span><span aria-current="page">Map</span>
  </nav>
  <header class="section-stack">
    <p class="eyebrow">Knowledge map</p>
    <h1 class="display-heading">Projects and the writing that follows them</h1>
    <p class="lead">
      Each chip is a project and each pad below it is a post that follows that project. Traces above
      the chips link related projects; turn on shared technologies to see what else they have in
      common.
    </p>
    <p class="hero-note">{projects} projects | {posts} posts</p>
  </header>
  {#if projects === 0}
    <div class="empty-block">
      <h2>The map is empty</h2>
      <p>Projects and posts will appear here once they are published.</p>
    </div>
  {:else}
    <section class="map-section" aria-label="Map">
      <div class="map-desktop">
        <KnowledgeMap graph={data.graph} focus={data.focus} />
      </div>
      <details class="map-outline" open>
        <summary>Text outline</summary>
        <MapOutline graph={data.graph} />
      </details>
    </section>
  {/if}
</main>

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
