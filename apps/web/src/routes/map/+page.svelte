<script lang="ts">
  import { resolve } from '$app/paths';
  import MapSection from '$lib/map/MapSection.svelte';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();
  const projects = $derived(data.graph.totals?.projects ?? 0);
  const posts = $derived(data.graph.totals?.posts ?? 0);
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
      Projects are grouped by category. Each chip is a project; choose Show posts on a chip to list
      the posts that follow it. Hover or focus a project to light up everything it connects to, and
      filter by name, technology or category to narrow a large map.
    </p>
    <p class="hero-note">{projects} projects | {posts} posts</p>
  </header>
  {#if projects === 0}
    <div class="empty-block">
      <h2>The map is empty</h2>
      <p>Projects and posts will appear here once they are published.</p>
    </div>
  {:else}
    <MapSection
      graph={data.graph}
      expanded={data.expanded}
      filter={data.filter}
      open={data.open}
      focus={data.focus}
    />
  {/if}
</main>
