<script lang="ts">
  import { resolve } from '$app/paths';
  import {
    CHIP_H,
    CHIP_W,
    LANE_PAGE,
    layoutLane,
    neighbourhood,
    type GraphNode,
    type MapModel
  } from './layout';

  let {
    name,
    projects,
    model,
    open,
    active,
    showShared = false,
    preview = false,
    eager = false,
    toggleHref,
    onactive
  }: {
    name: string;
    projects: GraphNode[];
    model: MapModel;
    open: ReadonlySet<string>;
    active: string;
    showShared?: boolean;
    preview?: boolean;
    /** Render the drawing on the server and before scrolling, instead of when it nears the viewport. */
    eager?: boolean;
    toggleHref: (slug: string) => string;
    onactive: (id: string) => void;
  } = $props();

  let limit = $state(LANE_PAGE);
  const layout = $derived(layoutLane(projects, model, { open, limit, showShared }));
  const lit = $derived(active ? neighbourhood(model, active) : null);
  const dimmed = (id: string) => (lit ? !lit.has(id) : false);
  const traceLit = (ends: [string, string]) => Boolean(active) && ends.includes(active);
  const traceDimmed = (ends: [string, string]) => Boolean(active) && !ends.includes(active);
  const projectHref = (slug: string) =>
    preview ? resolve('/preview/projects/[slug]', { slug }) : resolve('/projects/[slug]', { slug });
  const postHref = (slug: string) =>
    preview ? resolve('/preview/blog/[slug]', { slug }) : resolve('/blog/[slug]', { slug });
  const moreHref = (slug: string) =>
    preview
      ? resolve('/preview/projects/[slug]', { slug })
      : resolve(`/blog?project=${encodeURIComponent(slug)}` as '/blog');

  // Long lanes only draw while near the viewport; the placeholder keeps the scroll height stable.
  let section = $state<HTMLElement>();
  let near = $state(false);
  $effect(() => {
    if (!section || typeof IntersectionObserver === 'undefined') {
      near = true;
      return;
    }
    const observer = new IntersectionObserver(([entry]) => (near = entry.isIntersecting), {
      rootMargin: '900px 0px'
    });
    observer.observe(section);
    return () => observer.disconnect();
  });
  const drawn = $derived(eager || near);
  const hidden = $derived(projects.length - Math.min(projects.length, limit));
</script>

<section class="lane" aria-label={`${name} projects`} bind:this={section}>
  <header class="lane-header">
    <h2 class="lane-title">{name}</h2>
    <span class="lane-count"
      >{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span
    >
  </header>
  <div class="map-scroll" role="region" aria-label={`${name} map, scrolls sideways`}>
    {#if drawn}
      <svg
        class="map-svg"
        class:show-shared={showShared}
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="group"
        aria-label={`Projects in ${name} and the posts that follow them`}
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
          <g class="chip-node" class:dim={dimmed(chip.id)} class:draft={node.draft}>
            <a
              href={projectHref(node.slug)}
              onmouseenter={() => onactive(chip.id)}
              onmouseleave={() => onactive('')}
              onfocus={() => onactive(chip.id)}
              onblur={() => onactive('')}
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
            </a>
          </g>
        {/each}

        {#each layout.toggles as toggle (toggle.key)}
          <g class="toggle-node" class:dim={dimmed(toggle.id)}>
            <a
              href={resolve(toggleHref(toggle.slug) as '/map')}
              data-sveltekit-noscroll
              data-sveltekit-replacestate
              data-sveltekit-keepfocus
              aria-expanded={toggle.open}
              aria-label={`${toggle.open ? 'Hide' : 'Show'} ${toggle.count} ${toggle.count === 1 ? 'post' : 'posts'} following ${model.projects.find((p) => p.id === toggle.id)?.title ?? 'project'}`}
            >
              <rect
                class="hit"
                x={toggle.x - 4}
                y={toggle.y - 17}
                width={CHIP_W - 16}
                height="26"
              />
              <text class="toggle" x={toggle.x} y={toggle.y}
                >{toggle.open ? '- Hide' : '+ Show'}
                {toggle.count}
                {toggle.count === 1 ? 'post' : 'posts'}</text
              >
            </a>
          </g>
        {/each}

        {#each layout.pads as pad (pad.key)}
          <g class="pad-node" class:dim={dimmed(pad.node.id)} class:draft={pad.node.draft}>
            <a
              href={postHref(pad.node.slug)}
              onmouseenter={() => onactive(pad.node.id)}
              onmouseleave={() => onactive('')}
              onfocus={() => onactive(pad.node.id)}
              onblur={() => onactive('')}
            >
              <rect class="hit" x={pad.x - 8} y={pad.y - 13} width={CHIP_W - 8} height="26" />
              <rect class="pad" x={pad.x - 5} y={pad.y - 5} width="10" height="10" />
              <text class="label" x={pad.x + 16} y={pad.y + 4}>{pad.label}</text>
              <title>{pad.node.title}</title>
            </a>
          </g>
        {/each}

        {#each layout.mores as more (more.key)}
          <g class="pad-node more" class:dim={dimmed(more.projectId)}>
            <a href={moreHref(more.slug)}>
              <rect class="hit" x={more.x - 8} y={more.y - 13} width={CHIP_W - 8} height="26" />
              <text class="label" x={more.x + 16} y={more.y + 4}
                >{more.count} more {more.count === 1 ? 'post' : 'posts'}</text
              >
            </a>
          </g>
        {/each}
      </svg>
    {:else}
      <div class="lane-placeholder" style:height={`${layout.height}px`} aria-hidden="true"></div>
    {/if}
  </div>
  {#if hidden > 0}
    <button type="button" class="lane-more" onclick={() => (limit += LANE_PAGE)}
      >Show {Math.min(LANE_PAGE, hidden)} more projects ({hidden} left)</button
    >
  {/if}
</section>

<style>
  .lane {
    display: grid;
    gap: 0.5rem;
  }

  .lane-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 1rem;
  }

  .lane-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.5;
  }

  .lane-count {
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.75rem;
  }

  .lane-more {
    justify-self: start;
    border: 1px solid var(--input);
    background: var(--background);
    padding: 0.5rem 1rem;
    min-height: 2.75rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .lane-more:hover {
    background: var(--secondary);
  }

  .lane-placeholder {
    min-width: 1px;
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

  .toggle-node a {
    outline: none;
    cursor: pointer;
  }

  .toggle-node .hit {
    fill: transparent;
  }

  .toggle-node .toggle {
    fill: var(--foreground);
    font-family: var(--font-code);
    font-size: 11px;
  }

  .toggle-node a:hover .toggle {
    text-decoration: underline;
  }

  .toggle-node a:focus-visible .hit {
    stroke: var(--ring);
    stroke-width: 3;
  }

  .toggle-node.dim {
    opacity: 0.25;
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

  .chip-node.draft .box {
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
