<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import KnowledgeMap from './KnowledgeMap.svelte';
  import MapOutline from './MapOutline.svelte';
  import { buildModel, type Graph, type MapFilter } from './layout';

  let {
    graph,
    expanded,
    loaded = [],
    filter,
    focus = '',
    preview = false
  }: {
    graph: Graph;
    /** Per-project graphs already loaded on the server. */
    expanded: Graph[];
    /** Slugs of the projects in `expanded`. */
    loaded?: string[];
    filter: MapFilter;
    /** Slug of the project focused by the URL. */
    focus?: string;
    preview?: boolean;
  } = $props();

  // Graphs fetched in the browser as projects are focused, and the slugs they cover.
  let extra = $state<Graph[]>([]);
  let fetched = $state<string[]>([]);
  let pending = $state('');
  let failed = $state('');
  // The URL decides the focus on load and on navigation; clicks override it until then.
  let override = $state<string | null>(null);
  $effect(() => {
    void focus;
    override = null;
  });

  const model = $derived(buildModel(graph, [...expanded, ...extra]));
  const focusSlug = $derived(override ?? focus);
  const focusId = $derived(model.projects.find((p) => p.slug === focusSlug)?.id ?? '');
  const known = $derived([...loaded, ...fetched]);
  const dataPath = $derived(preview ? '/preview/map/data/' : '/map/data/');

  async function ensure(slug: string) {
    if (known.includes(slug) || pending === slug) return;
    pending = slug;
    failed = '';
    try {
      const response = await fetch(dataPath + encodeURIComponent(slug));
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as Graph;
      extra = [...extra, next];
      fetched = [...fetched, slug];
    } catch {
      failed = slug;
    } finally {
      if (pending === slug) pending = '';
    }
  }
  $effect(() => {
    if (focusSlug && focusId) void ensure(focusSlug);
  });

  function onfocus(id: string) {
    const slug = model.projects.find((p) => p.id === id)?.slug ?? '';
    override = slug;
    // The focus lives in the URL so a link shares exactly what is on screen.
    const params = new SvelteURLSearchParams(page.url.search);
    if (slug) params.set('focus', slug);
    else params.delete('focus');
    params.delete('open');
    const query = params.toString();
    try {
      void goto(resolve((page.url.pathname + (query ? `?${query}` : '')) as '/map'), {
        shallow: true,
        replace: true,
        state: page.state
      });
    } catch {
      // The router is not ready before hydration finishes; the focus still applies.
    }
  }
</script>

<section class="map-section" aria-label="Map">
  <KnowledgeMap
    {model}
    {filter}
    {focusId}
    loading={pending === focusSlug && focusSlug !== ''}
    failed={failed === focusSlug && focusSlug !== ''}
    {preview}
    {onfocus}
  />
  <details class="map-outline" open={model.projects.length <= 40}>
    <summary>Text outline</summary>
    <MapOutline {model} {filter} {preview} />
  </details>
</section>

<style>
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
    gap: 1rem;
  }

  .map-outline:not([open]) {
    padding-block: 0.75rem;
  }

  .map-outline:not([open]) summary {
    margin-bottom: 0;
  }
</style>
