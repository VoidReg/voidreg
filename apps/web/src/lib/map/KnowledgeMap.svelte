<script lang="ts">
  import { resolve } from '$app/paths';
  import { CHIP_H, CHIP_W, STANDALONE_ID, layoutGraph, neighbourhood, type Graph } from './layout';

  let {
    graph,
    focus = '',
    preview = false
  }: { graph: Graph; focus?: string; preview?: boolean } = $props();

  const layout = $derived(layoutGraph(graph));
  const projectHref = (slug: string) =>
    preview ? resolve('/preview/projects/[slug]', { slug }) : resolve('/projects/[slug]', { slug });
  const postHref = (slug: string) =>
    preview ? resolve('/preview/blog/[slug]', { slug }) : resolve('/blog/[slug]', { slug });

  const technologies = $derived(
    [
      ...new Map(
        graph.nodes
          .filter((n) => n.kind === 'project')
          .flatMap((n) => n.tags)
          .map((t) => [t.toLowerCase(), t])
      ).values()
    ].sort((a, b) => a.localeCompare(b))
  );

  let tech = $state('');
  let showShared = $state(false);
  let hovered = $state('');
  let focused = $state('');
  const selected = $derived(graph.nodes.find((n) => n.slug === focus)?.id ?? '');
  const active = $derived(hovered || focused || selected);
  const lit = $derived(active ? neighbourhood(graph, active) : null);

  const hasTech = (id: string) =>
    !tech ||
    Boolean(
      graph.nodes.find((n) => n.id === id)?.tags.some((t) => t.toLowerCase() === tech.toLowerCase())
    );
  // A node is dimmed when something else is active, or when it falls outside the technology filter.
  const dimmed = (id: string, owner: string | null = null) => {
    const projectId = owner ?? id;
    if (tech && projectId !== STANDALONE_ID && !hasTech(projectId)) return true;
    if (tech && projectId === STANDALONE_ID) return true;
    return lit ? !lit.has(id) : false;
  };
  const projectIds = $derived(
    new Set(graph.nodes.filter((n) => n.kind === 'project').map((n) => n.id))
  );
  const traceLit = (ends: [string, string]) => Boolean(active) && ends.includes(active);
  const traceDimmed = (ends: [string, string]) =>
    (Boolean(active) && !ends.includes(active)) ||
    (Boolean(tech) &&
      (ends.includes(STANDALONE_ID) || ends.some((id) => projectIds.has(id) && !hasTech(id))));
</script>

<div class="map-tools">
  {#if technologies.length}<div class="map-filter" role="group" aria-label="Filter by technology">
      <p class="filter-label">Technology</p>
      <ul class="chip-row">
        <li>
          <button type="button" class="chip" aria-pressed={tech === ''} onclick={() => (tech = '')}
            >All</button
          >
        </li>
        {#each technologies as t (t)}<li>
            <button
              type="button"
              class="chip"
              aria-pressed={tech.toLowerCase() === t.toLowerCase()}
              onclick={() => (tech = tech.toLowerCase() === t.toLowerCase() ? '' : t)}>{t}</button
            >
          </li>{/each}
      </ul>
    </div>{/if}
  <label class="map-toggle">
    <input type="checkbox" bind:checked={showShared} />
    Show links from shared technologies
  </label>
</div>

<ul class="map-legend" aria-label="Legend">
  <li><span class="legend-swatch" data-kind="stem"></span>Post follows project</li>
  <li><span class="legend-swatch" data-kind="related"></span>Related projects</li>
  <li><span class="legend-swatch" data-kind="shared"></span>Shared technology</li>
  {#if graph.draft}<li>
      <span class="legend-swatch" data-kind="draft"></span>Draft or edited
    </li>{/if}
</ul>

<div class="map-scroll" role="region" aria-label="Knowledge map, scrolls sideways">
  <svg
    class="map-svg"
    class:show-shared={showShared}
    width={layout.width}
    height={layout.height}
    viewBox={`0 0 ${layout.width} ${layout.height}`}
    role="group"
    aria-label="Knowledge map of projects and the posts that follow them"
    focusable="false"
  >
    {#each layout.traces as trace (trace.key)}
      <g
        class="trace-group"
        data-kind={trace.kind}
        class:lit={traceLit(trace.ends)}
        class:dim={traceDimmed(trace.ends)}
      >
        <path class="trace" d={trace.d} />
        {#each trace.terminals as [x, y] (x + ',' + y)}
          <rect class="terminal" x={x - 4} y={y - 4} width="8" height="8" />
        {/each}
      </g>
    {/each}

    {#each layout.chips as chip (chip.id)}
      {@const node = chip.node}
      <g class="chip-node" class:dim={dimmed(chip.id)} class:lane={!node} class:draft={node?.draft}>
        {#if node}<a
            href={projectHref(node.slug)}
            onmouseenter={() => (hovered = chip.id)}
            onmouseleave={() => (hovered = '')}
            onfocus={() => (focused = chip.id)}
            onblur={() => (focused = '')}
          >
            <rect class="box" x={chip.x} y={chip.y} width={CHIP_W} height={CHIP_H} />
            <text class="category" x={chip.x + 12} y={chip.y + 18}>{chip.category}</text>
            {#each chip.lines as line, i (i)}<text
                class="title"
                x={chip.x + 12}
                y={chip.y + 38 + i * 16}>{line}</text
              >{/each}
            {#if node.draft || node.changed}<text
                class="badge"
                x={chip.x + CHIP_W - 10}
                y={chip.y + 18}
                text-anchor="end">{node.draft ? 'DRAFT' : 'EDITED'}</text
              >{/if}
            <title>{node.title}</title>
          </a>{:else}
          <rect class="box" x={chip.x} y={chip.y} width={CHIP_W} height={CHIP_H} />
          <text class="category" x={chip.x + 12} y={chip.y + 18}>{chip.category}</text>
          <text class="title" x={chip.x + 12} y={chip.y + 38}>{chip.lines[0]}</text>
        {/if}
      </g>
    {/each}

    {#each layout.pads as pad (pad.key)}
      <g
        class="pad-node"
        class:dim={dimmed(pad.node.id, pad.projectId ?? STANDALONE_ID)}
        class:draft={pad.node.draft}
      >
        <a
          href={postHref(pad.node.slug)}
          onmouseenter={() => (hovered = pad.node.id)}
          onmouseleave={() => (hovered = '')}
          onfocus={() => (focused = pad.node.id)}
          onblur={() => (focused = '')}
        >
          <rect class="hit" x={pad.x - 8} y={pad.y - 13} width={CHIP_W - 8} height="26" />
          <rect class="pad" x={pad.x - 5} y={pad.y - 5} width="10" height="10" />
          <text class="label" x={pad.x + 16} y={pad.y + 4}>{pad.label}</text>
          <title>{pad.node.title}</title>
        </a>
      </g>
    {/each}
  </svg>
</div>

<style>
  .map-tools {
    display: grid;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .map-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    justify-self: start;
    font-size: 0.875rem;
  }

  .map-toggle input {
    display: grid;
    flex: none;
    place-content: center;
    margin: 0;
    border: 1px solid var(--input);
    background: var(--background);
    width: 1.125rem;
    height: 1.125rem;
    appearance: none;
  }

  .map-toggle input:checked {
    border-color: var(--foreground);
    background: var(--foreground);
  }

  .map-toggle input:checked::after {
    background: var(--background);
    width: 0.625rem;
    height: 0.625rem;
    content: '';
    clip-path: polygon(14% 44%, 0 62%, 40% 100%, 100% 20%, 82% 4%, 40% 66%);
  }

  .map-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    margin: 0 0 1rem;
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

  .legend-swatch[data-kind='draft'] {
    border-top: 2px dashed var(--foreground);
  }

  .map-scroll {
    overflow-x: auto;
    border: 1px solid var(--border);
    background: var(--background);
  }

  .map-svg {
    display: block;
    max-width: none;
  }

  /* Traces */
  .trace {
    fill: none;
    stroke: var(--foreground);
    stroke-width: 1.5;
    stroke-linejoin: miter;
    transition: opacity var(--duration-medium) var(--ease-standard);
  }

  .trace-group[data-kind='related'] .trace {
    stroke: var(--primary);
    stroke-width: 2;
  }

  .trace-group[data-kind='shared-tag'] {
    display: none;
  }

  .trace-group[data-kind='shared-tag'] .trace {
    stroke: var(--muted-foreground);
    stroke-width: 1;
  }

  .show-shared .trace-group[data-kind='shared-tag'],
  .trace-group[data-kind='shared-tag'].lit {
    display: inline;
  }

  .terminal {
    fill: var(--background);
    stroke: var(--primary);
    stroke-width: 2;
  }

  .trace-group[data-kind='shared-tag'] .terminal {
    stroke: var(--muted-foreground);
    stroke-width: 1;
  }

  .trace-group.dim {
    opacity: 0.15;
  }

  .trace-group.lit .trace {
    stroke: var(--primary);
    stroke-width: 2.5;
    stroke-dasharray: 8 6;
    animation: map-flow 1.2s linear infinite;
  }

  @keyframes map-flow {
    to {
      stroke-dashoffset: -14;
    }
  }

  /* Project chips */
  .chip-node a {
    outline: none;
    cursor: pointer;
  }

  .chip-node .box {
    fill: var(--card);
    stroke: var(--input);
    stroke-width: 1.5;
    transition:
      fill var(--duration-fast) var(--ease-standard),
      stroke var(--duration-fast) var(--ease-standard);
  }

  .chip-node.draft .box,
  .chip-node.lane .box {
    stroke-dasharray: 6 4;
  }

  .chip-node a:hover .box,
  .chip-node a:focus-visible .box {
    fill: var(--primary);
    stroke: var(--primary);
  }

  .chip-node a:focus-visible .box {
    stroke: var(--ring);
    stroke-width: 3;
  }

  .chip-node .category {
    fill: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 10px;
    letter-spacing: 0.04em;
  }

  .chip-node .title {
    fill: var(--foreground);
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 500;
  }

  .chip-node .badge {
    fill: var(--foreground);
    font-family: var(--font-code);
    font-size: 10px;
    font-weight: 600;
  }

  .chip-node a:hover :is(.category, .title, .badge),
  .chip-node a:focus-visible :is(.category, .title, .badge) {
    fill: var(--primary-foreground);
  }

  /* Post pads */
  .pad-node a {
    outline: none;
    cursor: pointer;
  }

  .pad-node .hit {
    fill: transparent;
  }

  .pad-node .pad {
    fill: var(--background);
    stroke: var(--primary);
    stroke-width: 2;
  }

  .pad-node.draft .pad {
    stroke-dasharray: 3 2;
  }

  .pad-node .label {
    fill: var(--foreground);
    font-family: var(--font-ui);
    font-size: 12px;
  }

  .pad-node a:hover .label {
    text-decoration: underline;
  }

  .pad-node a:hover .pad,
  .pad-node a:focus-visible .pad {
    fill: var(--primary);
  }

  .pad-node a:focus-visible .hit {
    stroke: var(--ring);
    stroke-width: 3;
  }

  .chip-node.dim,
  .pad-node.dim {
    opacity: 0.25;
  }

  .chip-node,
  .pad-node {
    transition: opacity var(--duration-medium) var(--ease-standard);
  }

  @media (prefers-reduced-motion: reduce) {
    .trace-group.lit .trace {
      animation: none;
      stroke-dasharray: none;
    }

    .trace,
    .chip-node,
    .pad-node,
    .chip-node .box {
      transition: none;
    }
  }
</style>
