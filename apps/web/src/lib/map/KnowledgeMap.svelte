<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import Board from './Board.svelte';
  import MapPanel from './MapPanel.svelte';
  import { categoriesOf, lanesOf, technologiesOf, type MapFilter, type MapModel } from './layout';

  let {
    model,
    filter,
    focusId = '',
    loading = false,
    failed = false,
    preview = false,
    onfocus
  }: {
    model: MapModel;
    filter: MapFilter;
    focusId?: string;
    loading?: boolean;
    failed?: boolean;
    preview?: boolean;
    onfocus: (id: string) => void;
  } = $props();

  const lanes = $derived(lanesOf(model, filter));
  const categories = $derived(categoriesOf(model));
  const technologies = $derived(technologiesOf(model));
  const shown = $derived(lanes.reduce((sum, lane) => sum + lane.projects.length, 0));
  const filtered = $derived(Boolean(filter.q || filter.tag || filter.category));
  const focused = $derived(model.projects.find((p) => p.id === focusId));
  const hasShared = $derived(
    model.edges.some((e) => e.kind === 'shared-tag') || model.mode === 'summary'
  );
  const clearPath = $derived(page.url.pathname);
</script>

<form class="map-filters" method="get" role="search" aria-label="Filter the map">
  <label class="map-field"
    >Search projects<input
      type="search"
      name="q"
      value={filter.q}
      placeholder="Title or technology"
      maxlength="80"
    /></label
  >
  <label class="map-field"
    >Technology<input
      name="tag"
      value={filter.tag}
      list="map-technologies"
      placeholder="Any technology"
      maxlength="40"
      autocomplete="off"
    />
    <datalist id="map-technologies">
      {#each technologies as tag (tag)}<option value={tag}></option>{/each}
    </datalist>
  </label>
  <label class="map-field"
    >Category<select name="category" value={filter.category}>
      <option value="">All categories</option>
      {#each categories as category (category.name)}
        <option value={category.name} selected={filter.category === category.name}
          >{category.name} ({category.count})</option
        >
      {/each}
    </select></label
  >
  <div class="map-filter-actions">
    <button type="submit" class="map-button">Apply</button>
    {#if filtered}<a class="text-link" href={resolve(clearPath as '/map')}>Clear filters</a>{/if}
  </div>
</form>

<div class="map-tools">
  <ul class="map-legend" aria-label="Legend">
    <li><span class="legend-swatch" data-kind="chip"></span>Project</li>
    <li><span class="legend-swatch" data-kind="related"></span>Related project</li>
    {#if hasShared}<li>
        <span class="legend-swatch" data-kind="shared"></span>Shared technology
      </li>{/if}
    <li><span class="legend-swatch" data-kind="pad"></span>Post</li>
    {#if preview && model.projects.some((p) => p.draft || p.changed)}<li>
        <span class="legend-swatch" data-kind="draft"></span>Draft or edited
      </li>{/if}
  </ul>
  <p class="map-status" role="status">
    {shown === model.projects.length
      ? `${shown} ${shown === 1 ? 'project' : 'projects'}`
      : `${shown} of ${model.projects.length} projects match`}
    in {lanes.length}
    {lanes.length === 1 ? 'category' : 'categories'}.
  </p>
</div>

<div class="board-shell">
  <Board {model} {filter} {focusId} {preview} panelOpen={Boolean(focused)} {onfocus} />
  {#if focused}
    <MapPanel
      project={focused}
      {model}
      {loading}
      {failed}
      {preview}
      onclose={() => onfocus('')}
      {onfocus}
    />
  {/if}
</div>
{#if shown === 0}
  <p class="map-empty">
    No projects match these filters. <a class="text-link" href={resolve(clearPath as '/map')}
      >Clear filters</a
    >
  </p>
{/if}

{#if model.mode === 'full' ? model.standalone.length : model.unlinked}
  <section class="standalone" aria-label="Standalone notes">
    <h2 class="lane-title">Standalone notes</h2>
    {#if model.mode === 'full'}
      <ul class="standalone-list">
        {#each model.standalone.slice(0, 12) as post (post.id)}<li>
            <a
              href={preview
                ? resolve('/preview/blog/[slug]', { slug: post.slug })
                : resolve('/blog/[slug]', { slug: post.slug })}>{post.title}</a
            >
          </li>{/each}
      </ul>
    {/if}
    {#if !preview}<p class="map-status">
        {model.unlinked}
        {model.unlinked === 1 ? 'post does' : 'posts do'} not follow a project.
        <a class="text-link" href={resolve('/blog')}>Browse all posts</a>
      </p>{/if}
  </section>
{/if}

<style>
  .map-filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    align-items: end;
    gap: 0.75rem 1rem;
    margin-bottom: 1rem;
  }

  .map-field {
    display: grid;
    gap: 0.25rem;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
  }

  .map-field :where(input, select) {
    min-height: 2.75rem;
    border: 1px solid var(--input);
    border-radius: var(--radius);
    background: var(--background);
    padding: 0.5rem 0.75rem;
    color: var(--foreground);
    font: inherit;
    font-size: 0.9375rem;
  }

  .map-filter-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
  }

  .map-button {
    min-height: 2.75rem;
    border: 1px solid var(--foreground);
    background: var(--foreground);
    padding: 0.5rem 1.25rem;
    color: var(--background);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .map-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1.5rem;
    margin-bottom: 1rem;
  }

  .map-status {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }

  .map-empty {
    margin: 0;
    padding: 2rem 0;
  }

  .map-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    margin: 0;
    padding: 0;
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.75rem;
    list-style: none;
  }

  .map-legend li {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .legend-swatch {
    display: inline-block;
    width: 1.5rem;
    border-top: 2px solid var(--foreground);
  }

  .legend-swatch[data-kind='related'] {
    border-color: var(--primary);
  }

  .legend-swatch[data-kind='shared'] {
    border-top: 1px solid var(--muted-foreground);
  }

  .legend-swatch[data-kind='chip'] {
    border: 1px solid var(--input);
    background: var(--card);
    width: 1rem;
    height: 0.625rem;
  }

  .legend-swatch[data-kind='pad'] {
    background: var(--primary);
    border: 0;
    width: 0.5rem;
    height: 0.5rem;
  }

  .legend-swatch[data-kind='draft'] {
    border-top: 2px dashed var(--foreground);
  }

  .board-shell {
    position: relative;
  }

  .standalone {
    display: grid;
    gap: 0.5rem;
    margin-top: 1.5rem;
  }

  .lane-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.5;
  }

  .standalone-list {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
