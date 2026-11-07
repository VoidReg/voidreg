<script lang="ts">
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import { resolve } from '$app/paths';
  import MapSection from '$lib/map/MapSection.svelte';
  import Seo from '$lib/Seo.svelte';
  import { breadcrumbs, graph } from '$lib/seo';
  let { data } = $props();
  const projects = $derived(data.graph.totals?.projects ?? 0);
  const posts = $derived(data.graph.totals?.posts ?? 0);
</script>

<Seo
  title="Knowledge map | Voidreg"
  description="How Voidreg projects, the posts that follow them, and the technologies they share connect."
  structured={graph([
    {
      '@type': 'WebPage',
      name: 'Knowledge map',
      url: 'https://www.voidreg.xyz/map'
    },
    breadcrumbs([
      { name: 'Home', path: '/' },
      { name: 'Map', path: '/map' }
    ])
  ])}
/>
<main id="main-content" class="site-container page-shell">
  <Breadcrumb items={[{ label: 'Home', href: resolve('/') }, { label: 'Map' }]} />
  <header class="section-stack">
    <p class="eyebrow">Knowledge map</p>
    <h1 class="display-heading">Projects and the writing that follows them</h1>
    <p class="lead">
      Each module is a category and each chip is a project. Drag and zoom across the board, then
      choose a chip to light its circuit: the projects it relates to, the technologies it shares and
      the posts that follow it. Filter by name, technology or category to jump to a group.
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
      loaded={data.loaded}
      focus={data.focus}
    />
  {/if}
</main>
