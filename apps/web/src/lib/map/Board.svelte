<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { resolve } from '$app/paths';
  import {
    CHIP_H,
    CHIP_W,
    LOD_MID,
    buildBoard,
    bundlesOf,
    chipNear,
    circuitOf,
    lodFor,
    boundsOf,
    matchingChips,
    nearestChip,
    visibleChips,
    type BoardChip,
    type Dir
  } from './board';
  import { categoryOf, type MapFilter, type MapModel } from './layout';
  import MapControls from './MapControls.svelte';
  import Minimap from './Minimap.svelte';
  import {
    clampView,
    fit,
    panBy,
    pinch,
    reveal,
    toWorld,
    visibleRect,
    zoomAt,
    zoomToRect,
    type Inset,
    type View
  } from './viewport';

  let {
    model,
    filter,
    focusId = '',
    preview = false,
    panelOpen = false,
    onfocus
  }: {
    model: MapModel;
    filter: MapFilter;
    /** Id of the focused project, or an empty string. */
    focusId?: string;
    preview?: boolean;
    /** Whether the side panel covers part of the board, so framing leaves room for it. */
    panelOpen?: boolean;
    onfocus: (id: string) => void;
  } = $props();

  /** Board width from which the panel sits beside the board; narrower boards get a bottom sheet. */
  const SIDE_PANEL_MIN = 832;
  let size = $state({ w: 0, h: 0 });
  const board = $derived(buildBoard(model, size.w > 0 && size.w < 640));
  const circuit = $derived(focusId ? circuitOf(board, model, focusId) : null);
  const bundles = $derived(bundlesOf(board, model));
  const matched = $derived.by(() => {
    const chips = matchingChips(board, filter);
    return chips ? { chips, ids: new Set(chips.map((c) => c.id)) } : null;
  });
  const active = $derived(circuit ? circuit.lit : (matched?.ids ?? null));

  let view = $state<View>({ x: 0, y: 0, k: 1 });
  let ready = $state(false);
  /** True until the person pans or zooms, so a resize re-fits the whole board. */
  let following = true;
  let trail = $state<{ x: number; y: number; w: number; h: number } | null>(null);
  let hover = $state('');
  let cursor = $state('');
  let engaged = $state(false);
  let panning = $state(false);
  let announce = $state('');
  let svg = $state<SVGSVGElement>();

  const shown = $derived(ready ? view : fit(board, { w: 1200, h: 720 }));
  const lod = $derived(lodFor(shown.k));
  const inset = $derived<Inset>(
    !panelOpen
      ? {}
      : size.w >= SIDE_PANEL_MIN
        ? { right: 340 }
        : { bottom: Math.round(size.h * 0.46) }
  );
  const world = $derived.by(() => {
    const now = visibleRect(shown, size.w ? size : { w: 1200, h: 720 });
    if (!trail) return now;
    const x = Math.min(now.x, trail.x);
    const y = Math.min(now.y, trail.y);
    return {
      x,
      y,
      w: Math.max(now.x + now.w, trail.x + trail.w) - x,
      h: Math.max(now.y + now.h, trail.y + trail.h) - y
    };
  });
  const visible = $derived(lod === 'far' ? [] : visibleChips(board, world, 160));
  const dimChips = $derived(active ? visible.filter((c) => !active.has(c.id)) : []);
  const litChips = $derived(active ? visible.filter((c) => active.has(c.id)) : visible);
  const rectPath = (chips: BoardChip[]) =>
    chips.map((c) => `M${c.x} ${c.y}h${CHIP_W}v${CHIP_H}h${-CHIP_W}z`).join('');
  /** Far out, projects are tiles drawn as two paths, whatever the catalogue size. */
  const tiles = $derived.by(() => {
    if (lod !== 'far') return null;
    const lit: BoardChip[] = [];
    const dim: BoardChip[] = [];
    for (const c of board.chips) (!active || active.has(c.id) ? lit : dim).push(c);
    return { lit: rectPath(lit), dim: rectPath(dim) };
  });
  const draftChips = $derived(
    preview && lod !== 'far' ? visible.filter((c) => c.node.draft || c.node.changed) : []
  );
  const hoverChip = $derived(hover ? (board.chipById.get(hover) ?? null) : null);
  const cursorChip = $derived(cursor ? (board.chipById.get(cursor) ?? null) : null);
  const px = $derived(1 / shown.k);
  const silk = $derived(Math.min(72, Math.max(16, 13 / shown.k)));

  // Pins on the top and bottom edges, plus the sides up close.
  const pinPath = (sides: boolean) => {
    let d = '';
    for (let i = 0; i < 6; i++) {
      const x = 16 + (i * (CHIP_W - 32)) / 5;
      d += `M${x} 0v-6M${x} ${CHIP_H}v6`;
    }
    if (sides)
      for (let i = 0; i < 3; i++) {
        const y = 14 + (i * (CHIP_H - 28)) / 2;
        d += `M0 ${y}h-6M${CHIP_W} ${y}h6`;
      }
    return d;
  };
  const PINS_MID = pinPath(false);
  const PINS_NEAR = pinPath(true);

  const postHref = (slug: string) =>
    preview ? resolve('/preview/blog/[slug]', { slug }) : resolve('/blog/[slug]', { slug });
  const moreHref = (slug: string) =>
    preview
      ? resolve('/preview/projects/[slug]', { slug })
      : resolve(`/blog?project=${encodeURIComponent(slug)}` as '/blog');

  const reduced = () =>
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let settle: ReturnType<typeof setTimeout> | undefined;
  /** Moves the view, flying there unless motion is reduced. */
  function go(next: View, animate = true) {
    if (animate && ready && !reduced()) {
      trail = visibleRect(view, size);
      clearTimeout(settle);
      settle = setTimeout(() => (trail = null), 520);
    }
    view = next;
  }
  const flying = $derived(trail !== null && !panning);
  const dims = () => (size.w ? size : { w: 1200, h: 720 });

  // Size and first framing: matches, then a focused project, then the whole board.
  $effect(() => {
    if (!size.w || !size.h) return;
    untrack(() => {
      if (!ready) {
        ready = true;
        view = initialView();
        return;
      }
      view = following ? fit(board, size) : clampView(view, board, size);
    });
  });
  function initialView(): View {
    const hits = matched?.chips;
    if (hits?.length) {
      const bounds = boundsOf(hits)!;
      return zoomToRect(bounds, board, size, { maxK: 1.1, pad: 64, inset });
    }
    if (circuit) {
      following = false;
      return frameCircuit();
    }
    return fit(board, size);
  }
  function frameCircuit(): View {
    const c = circuit!;
    const wide = zoomToRect(c.neighbourBounds, board, size, { maxK: 1.3, pad: 56, inset });
    return wide.k >= LOD_MID * 0.9
      ? wide
      : zoomToRect(c.bounds, board, size, { maxK: 1.3, pad: 80, inset });
  }

  // Focusing a project frames its circuit; clearing the focus leaves the view where it is.
  let framed = '';
  /** Set once the person moves the view after a project is focused, so late posts do not undo it. */
  let touched = false;
  let plated = '';
  $effect(() => {
    const id = focusId;
    const c = circuit;
    if (!ready) return;
    untrack(() => {
      if (!id || !c) {
        framed = '';
        plated = '';
        return;
      }
      if (framed !== id) {
        framed = id;
        plated = c.plate ? id : '';
        following = false;
        touched = false;
        go(frameCircuit());
      } else if (c.plate && plated !== id) {
        // Posts arrived after the project was focused: bring the plate into view.
        plated = id;
        const free = { w: dims().w - (inset.right ?? 0), h: dims().h - (inset.bottom ?? 0) };
        go(touched ? reveal(view, c.plate, board, free, 40) : frameCircuit());
      }
    });
  });

  // New filters frame the matches.
  const filterKey = $derived(`${filter.q}|${filter.tag}|${filter.category}`);
  let lastFilter = untrack(() => filterKey);
  $effect(() => {
    const key = filterKey;
    if (!ready || key === lastFilter) return;
    lastFilter = key;
    untrack(() => {
      const hits = matched?.chips;
      following = false;
      go(
        hits?.length
          ? zoomToRect(boundsOf(hits)!, board, size, { maxK: 1.1, pad: 64, inset })
          : fit(board, size)
      );
    });
  });

  function interact(next: View, animate = false) {
    following = false;
    touched = true;
    go(next, animate);
  }
  const centre = $derived({
    x: (size.w - (inset.right ?? 0)) / 2,
    y: (size.h - (inset.bottom ?? 0)) / 2
  });
  const zoomBy = (factor: number) =>
    interact(zoomAt(view, centre.x, centre.y, factor, board, size), true);
  const fitAll = () => {
    following = true;
    go(fit(board, size));
  };

  // Wheel zooms with Ctrl or Cmd (and trackpad pinch), or plainly once the board is engaged.
  $effect(() => {
    const el = svg;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey || engaged)) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      interact(zoomAt(view, e.clientX - box.left, e.clientY - box.top, factor, board, size));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  const pointers = new SvelteMap<number, [number, number]>();
  let drag: { x: number; y: number; moved: boolean } | null = null;
  const local = (e: PointerEvent): [number, number] => {
    const box = svg!.getBoundingClientRect();
    return [e.clientX - box.left, e.clientY - box.top];
  };
  const interactive = (e: Event) => (e.target as Element).closest('a, button') !== null;

  function down(e: PointerEvent) {
    if (interactive(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    svg!.setPointerCapture(e.pointerId);
    engaged = true;
    const p = local(e);
    pointers.set(e.pointerId, p);
    drag = pointers.size === 1 ? { x: p[0], y: p[1], moved: false } : null;
    if (pointers.size > 1) hover = '';
  }
  function move(e: PointerEvent) {
    const p = local(e);
    const previous = pointers.get(e.pointerId);
    if (!previous) {
      if (e.pointerType === 'mouse') {
        const [wx, wy] = toWorld(shown, p[0], p[1]);
        hover = chipNear(board, wx, wy, 6 / shown.k)?.id ?? '';
      }
      return;
    }
    if (pointers.size === 2) {
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)![1];
      const result = pinch([previous, other], [p, other]);
      pointers.set(e.pointerId, p);
      const zoomed = zoomAt(view, result.from[0], result.from[1], result.factor, board, size);
      interact(
        panBy(zoomed, result.to[0] - result.from[0], result.to[1] - result.from[1], board, size)
      );
      return;
    }
    pointers.set(e.pointerId, p);
    if (!drag) return;
    const dx = p[0] - previous[0];
    const dy = p[1] - previous[1];
    if (!drag.moved && Math.hypot(p[0] - drag.x, p[1] - drag.y) < 5) return;
    drag.moved = true;
    panning = true;
    hover = '';
    interact(panBy(view, dx, dy, board, size));
  }
  function up(e: PointerEvent) {
    const wasTap = drag && !drag.moved && pointers.size === 1 && pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      drag = null;
      panning = false;
    } else if (pointers.size === 1) {
      // One finger of a pinch lifted: carry on panning with the other.
      const [rest] = pointers.values();
      drag = { x: rest[0], y: rest[1], moved: true };
    }
    if (!wasTap || e.type === 'pointercancel') return;
    const [px, py] = local(e);
    const [wx, wy] = toWorld(shown, px, py);
    const touch = e.pointerType !== 'mouse';
    // Zoomed far out, a finger cannot pick one tile, so a tap zooms in to that spot first.
    if (touch && lod === 'far' && !focusId) {
      interact(zoomAt(view, px, py, (LOD_MID * 1.5) / view.k, board, size), true);
      return;
    }
    const chip = chipNear(board, wx, wy, (touch ? 14 : 6) / shown.k);
    if (chip) {
      cursor = chip.id;
      onfocus(chip.id);
    } else if (focusId) onfocus('');
    else if (lod === 'far') {
      const module = board.modules.find(
        (m) => wx >= m.x && wx <= m.x + m.w && wy >= m.y && wy <= m.y + m.h
      );
      if (module) {
        // Frame the whole module, but never so far out that its chips stay as bare tiles.
        const framed = zoomToRect(module, board, size, { maxK: 0.9, pad: 40 });
        interact(
          framed.k >= LOD_MID
            ? framed
            : zoomAt(view, px, py, (LOD_MID * 1.5) / view.k, board, size),
          true
        );
      }
    }
  }

  const describe = (c: BoardChip) => {
    const posts = model.postsOf.get(c.id)?.total ?? c.node.post_count ?? 0;
    const links = model.adjacency.get(c.id)?.size ?? 0;
    return `${c.node.title}, ${categoryOf(c.node)}, ${posts} ${posts === 1 ? 'post' : 'posts'}, ${links} linked`;
  };
  function select(chip: BoardChip) {
    cursor = chip.id;
    announce = describe(chip);
    if (lod === 'far') interact(zoomToRect(chip, board, size, { maxK: 0.9, pad: 200 }), true);
    else interact(reveal(view, chip, board, size, 90), true);
  }
  function key(e: KeyboardEvent) {
    if (e.altKey) return;
    const dirs: Record<string, Dir> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down'
    };
    const dir = dirs[e.key];
    if (dir && e.shiftKey) {
      e.preventDefault();
      const step = 120;
      const [dx, dy] = { left: [step, 0], right: [-step, 0], up: [0, step], down: [0, -step] }[dir];
      interact(panBy(view, dx, dy, board, size));
    } else if (dir) {
      e.preventDefault();
      const start = board.chipById.get(cursor) ?? board.chipById.get(focusId);
      const next = start ? nearestChip(board, start, dir) : nearestToCentre();
      if (next) select(next);
    } else if ((e.key === 'Enter' || e.key === ' ') && cursor) {
      e.preventDefault();
      onfocus(cursor);
    } else if (e.key === 'Escape') {
      if (focusId) {
        e.preventDefault();
        onfocus('');
      }
    } else if (e.key === '+' || e.key === '=') zoomBy(1.4);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.4);
    else if (e.key === '0') fitAll();
  }
  function nearestToCentre(): BoardChip | null {
    const [wx, wy] = toWorld(shown, size.w / 2, size.h / 2);
    for (let r = 200; r < Math.max(board.width, board.height) * 2; r *= 2) {
      const found = board.index.query(wx - r, wy - r, wx + r, wy + r);
      if (found.length)
        return board.chips[
          found.reduce((best, i) => {
            const c = board.chips[i];
            const b = board.chips[best];
            return Math.hypot(c.x - wx, c.y - wy) < Math.hypot(b.x - wx, b.y - wy) ? i : best;
          })
        ];
    }
    return null;
  }

  const bundleWidth = (count: number) => 1.5 + Math.min(7, Math.log2(count + 1) * 1.3);
  const tip = $derived.by(() => {
    if (!hoverChip || hoverChip.id === focusId || panning || lod === 'near') return null;
    return {
      x: hoverChip.x * shown.k + shown.x,
      y: hoverChip.y * shown.k + shown.y,
      title: hoverChip.node.title,
      meta: categoryOf(hoverChip.node)
    };
  });
</script>

<div
  class="board"
  class:panel-open={panelOpen}
  bind:clientWidth={size.w}
  bind:clientHeight={size.h}
  data-lod={lod}
  data-ready={ready}
>
  <!-- role="application" is an interactive widget role; Svelte does not classify it as one. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="stage"
    class:grabbing={panning}
    class:pointing={hover !== ''}
    role="application"
    aria-label="Knowledge map board. Arrow keys move between projects, Enter shows a project's circuit, Escape clears it, plus and minus zoom, zero fits the board."
    tabindex="0"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onpointerleave={() => {
      hover = '';
      engaged = false;
    }}
    onkeydown={key}
    onfocus={() => {
      if (!cursor && focusId) cursor = focusId;
    }}
  >
    <svg bind:this={svg} class="board-svg" style:--px={px}>
      <defs>
        <pattern id="grid-minor" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" class="grid-minor" />
        </pattern>
        <pattern id="grid-major" width="200" height="200" patternUnits="userSpaceOnUse">
          <path d="M200 0H0V200" class="grid-major" />
        </pattern>
      </defs>

      <g
        class="world"
        class:flying
        style:transform="translate({shown.x}px, {shown.y}px) scale({shown.k})"
      >
        <rect class="substrate" width={board.width} height={board.height} />
        <rect class="grid" width={board.width} height={board.height} fill="url(#grid-minor)" />
        <rect class="grid" width={board.width} height={board.height} fill="url(#grid-major)" />
        <rect class="edge" x="24" y="24" width={board.width - 48} height={board.height - 48} />

        {#each board.modules as m (m.key)}
          <g class="module">
            <rect class="module-body" x={m.x} y={m.y} width={m.w} height={m.h} />
            <path
              class="corners"
              d="M{m.x} {m.y + 22}V{m.y}H{m.x + 22}M{m.x + m.w - 22} {m.y}H{m.x + m.w}V{m.y +
                22}M{m.x + m.w} {m.y + m.h - 22}V{m.y + m.h}H{m.x + m.w - 22}M{m.x + 22} {m.y +
                m.h}H{m.x}V{m.y + m.h - 22}"
            />
            <text class="silk" x={m.x} y={m.y - silk * 0.45} style:font-size="{silk}px"
              >{m.name}<tspan class="silk-count" dx={silk * 0.6}>{m.count}</tspan></text
            >
            {#if lod !== 'far'}
              <text class="ref" x={m.x + 26} y={m.y + 28}
                >U{String(m.index + 1).padStart(2, '0')} / {m.count}
                {m.count === 1 ? 'CHIP' : 'CHIPS'}</text
              >
            {/if}
          </g>
        {/each}

        {#if !circuit}
          <g class="bundles" class:quiet={lod === 'near'}>
            {#each bundles as b (b.key)}
              <path class="bundle" d={b.d} style:stroke-width="{bundleWidth(b.count)}px" />
              {#each b.ends as [x, y], i (i)}
                <rect
                  class="bundle-pad"
                  x={x - Math.max(5, 4 * px)}
                  y={y - Math.max(5, 4 * px)}
                  width={Math.max(10, 8 * px)}
                  height={Math.max(10, 8 * px)}
                />
              {/each}
            {/each}
          </g>
        {/if}

        {#if tiles}
          <path class="tile dim" d={tiles.dim} />
          <path class="tile" d={tiles.lit} />
        {/if}

        {#each dimChips as chip (chip.id)}
          {@render chipView(chip, true)}
        {/each}

        {#if circuit}
          <g class="circuit">
            {#each circuit.traces as t (t.key)}
              <path class="trace {t.kind}" d={t.d} />
              {#if t.kind === 'related'}<path class="pulse" d={t.d} />{/if}
              <circle class="via" cx={t.ends[0][0]} cy={t.ends[0][1]} r={Math.max(4, 3.5 * px)} />
              <rect
                class="pad"
                x={t.ends[1][0] - Math.max(4, 3.5 * px)}
                y={t.ends[1][1] - Math.max(4, 3.5 * px)}
                width={Math.max(8, 7 * px)}
                height={Math.max(8, 7 * px)}
              />
            {/each}
            {#if circuit.plate}
              {@const plate = circuit.plate}
              <g class="plate">
                <rect class="plate-body" x={plate.x} y={plate.y} width={plate.w} height={plate.h} />
                <path class="trace related" d={plate.bus} />
                {#each plate.rows as row (row.key)}
                  <a href={postHref(row.node.slug)} class="post-link">
                    <rect
                      class="hit"
                      x={row.x - 10}
                      y={row.y - 13}
                      width={plate.w - 12}
                      height="26"
                    />
                    <rect class="pad" x={row.x - 4} y={row.y - 4} width="8" height="8" />
                    <text class="plate-label" x={row.x + 16} y={row.y + 4}>{row.label}</text>
                  </a>
                {/each}
                {#if plate.more}
                  <a href={moreHref(plate.more.slug)} class="post-link">
                    <rect
                      class="hit"
                      x={plate.more.x - 10}
                      y={plate.more.y - 13}
                      width={plate.w - 12}
                      height="26"
                    />
                    <rect
                      class="pad more"
                      x={plate.more.x - 4}
                      y={plate.more.y - 4}
                      width="8"
                      height="8"
                    />
                    <text class="plate-label more" x={plate.more.x + 16} y={plate.more.y + 4}
                      >{plate.more.count} more {plate.more.count === 1 ? 'post' : 'posts'}</text
                    >
                  </a>
                {/if}
              </g>
            {/if}
          </g>
        {/if}

        {#each litChips as chip (chip.id)}
          {@render chipView(chip, false)}
        {/each}

        {#each draftChips as chip (chip.id)}
          <rect
            class="draft-ring"
            x={chip.x - 4}
            y={chip.y - 4}
            width={CHIP_W + 8}
            height={CHIP_H + 8}
          />
        {/each}
        {#if focusId && circuit}
          <rect
            class="focus ring"
            x={circuit.focus.x - 3}
            y={circuit.focus.y - 3}
            width={CHIP_W + 6}
            height={CHIP_H + 6}
          />
        {/if}
        {#if cursorChip && cursorChip.id !== focusId}
          <rect
            class="cursor ring"
            x={cursorChip.x - 3}
            y={cursorChip.y - 3}
            width={CHIP_W + 6}
            height={CHIP_H + 6}
          />
        {/if}
        {#if hoverChip && hoverChip.id !== focusId}
          <rect
            class="hover ring"
            x={hoverChip.x - 2}
            y={hoverChip.y - 2}
            width={CHIP_W + 4}
            height={CHIP_H + 4}
          />
        {/if}
      </g>
    </svg>
  </div>

  {#if tip}
    <div class="tip" style:left="{tip.x}px" style:top="{tip.y}px">
      <strong>{tip.title}</strong><span>{tip.meta}</span>
    </div>
  {/if}

  <MapControls
    zoom={shown.k}
    onin={() => zoomBy(1.4)}
    onout={() => zoomBy(1 / 1.4)}
    onfit={fitAll}
  />
  <Minimap
    {board}
    width={size.w < 640 ? 112 : 168}
    view={shown}
    size={dims()}
    onnavigate={(wx, wy) =>
      interact(
        clampView(
          { k: view.k, x: size.w / 2 - wx * view.k, y: size.h / 2 - wy * view.k },
          board,
          size
        )
      )}
  />
  <p class="hint" aria-hidden="true">
    <span class="fine">Drag to pan. Ctrl + scroll or pinch to zoom.</span>
    <span class="coarse">Drag to pan, pinch to zoom, tap a group.</span>
  </p>
  <p class="sr-only" role="status" aria-live="polite">{announce}</p>
</div>

{#snippet chipView(chip: BoardChip, dim: boolean)}
  <g
    class="chip"
    class:dim
    class:draft={preview && chip.node.draft}
    transform="translate({chip.x} {chip.y})"
  >
    <rect class="chip-body" width={CHIP_W} height={CHIP_H} />
    <path class="chip-pins" d={lod === 'near' ? PINS_NEAR : PINS_MID} />
    <circle class="pin-one" cx="8" cy="8" r="2" />
    {#each chip.lines as line, i (i)}
      <text class="chip-title" x="16" y={i === 0 ? 24 : 40}>{line}</text>
    {/each}
    {#if lod === 'near'}
      <text class="chip-meta" x="16" y={CHIP_H - 6}>{chip.meta}</text>
      {@const count = model.postsOf.get(chip.id)?.total ?? chip.node.post_count ?? 0}
      {#if count > 0}
        <text class="chip-meta posts" x={CHIP_W - 16} y={CHIP_H - 6} text-anchor="end"
          >{count}P</text
        >
      {/if}
    {/if}
  </g>
{/snippet}

<style>
  .board {
    position: relative;
    height: clamp(30rem, 76vh, 58rem);
    height: clamp(28rem, 72svh, 58rem);
    overflow: hidden;
    border: 1px solid var(--border);
    background: var(--background);
  }

  .stage {
    position: absolute;
    inset: 0;
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
  }

  .board-svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .stage.pointing {
    cursor: pointer;
  }

  .stage.grabbing {
    cursor: grabbing;
  }

  .stage:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .world {
    transform-origin: 0 0;
  }

  .world.flying {
    transition: transform 0.5s cubic-bezier(0.22, 0.8, 0.3, 1);
  }

  .substrate {
    fill: var(--background);
  }

  .grid {
    pointer-events: none;
  }

  .grid-minor,
  .grid-major {
    fill: none;
    stroke: var(--border);
    stroke-width: calc(var(--px) * 1);
  }

  .grid-minor {
    opacity: 0.35;
  }

  .grid-major {
    opacity: 0.7;
  }

  .edge {
    fill: none;
    stroke: var(--border);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 2 6;
  }

  .module-body {
    fill: color-mix(in srgb, var(--card) 70%, transparent);
    stroke: var(--border);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }

  .corners {
    fill: none;
    stroke: var(--primary);
    stroke-width: 2.5px;
    vector-effect: non-scaling-stroke;
  }

  .silk,
  .ref,
  .chip-meta {
    font-family: var(--font-code);
    text-transform: uppercase;
  }

  .silk {
    fill: var(--foreground);
    font-weight: 600;
    letter-spacing: 0.06em;
    pointer-events: none;
  }

  .silk-count {
    fill: var(--primary);
  }

  .ref {
    fill: var(--muted-foreground);
    font-size: 11px;
    letter-spacing: 0.1em;
    pointer-events: none;
  }

  .bundle {
    fill: none;
    stroke: var(--muted-foreground);
    stroke-linecap: square;
    stroke-linejoin: miter;
    opacity: 0.55;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .bundle-pad {
    fill: var(--background);
    stroke: var(--primary);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
  }

  .bundles.quiet {
    opacity: 0.35;
  }

  .tile {
    fill: var(--card);
    stroke: var(--foreground);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .tile.dim {
    opacity: 0.15;
  }

  .chip-body {
    fill: var(--card);
    stroke: var(--input);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }

  .chip.draft .chip-body {
    stroke-dasharray: 6 4;
  }

  .chip.dim {
    opacity: 0.15;
  }

  .chip-pins {
    fill: none;
    stroke: var(--muted-foreground);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
  }

  .pin-one {
    fill: var(--primary);
  }

  .chip-title {
    fill: var(--foreground);
    font-size: 12.5px;
    font-weight: 500;
    pointer-events: none;
  }

  .chip-meta {
    fill: var(--muted-foreground);
    font-size: 9.5px;
    letter-spacing: 0.08em;
    pointer-events: none;
  }

  .chip-meta.posts {
    fill: var(--primary);
  }

  .ring {
    fill: none;
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .ring.focus {
    stroke: var(--primary);
    stroke-width: 3px;
  }

  .ring.cursor {
    stroke: var(--foreground);
    stroke-dasharray: 5 3;
  }

  .ring.hover {
    stroke: var(--primary);
    opacity: 0.8;
  }

  .draft-ring {
    fill: none;
    stroke: var(--muted-foreground);
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .trace {
    fill: none;
    stroke: var(--primary);
    stroke-width: 2px;
    stroke-linecap: square;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .trace.shared-tag {
    stroke: var(--muted-foreground);
    stroke-width: 1.5px;
    stroke-dasharray: 5 4;
  }

  .pulse {
    fill: none;
    stroke: var(--foreground);
    stroke-width: 3px;
    stroke-linecap: round;
    stroke-dasharray: 8 120;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
    animation: flow 2.4s linear infinite;
  }

  @keyframes flow {
    to {
      stroke-dashoffset: -128;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
      stroke-dasharray: 8 120;
      opacity: 0.4;
    }

    .world.flying {
      transition: none;
    }
  }

  .via {
    fill: var(--background);
    stroke: var(--primary);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .pad {
    fill: var(--primary);
    pointer-events: none;
  }

  .pad.more {
    fill: var(--background);
    stroke: var(--primary);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }

  .plate-body {
    fill: var(--card);
    stroke: var(--primary);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }

  .hit {
    fill: transparent;
  }

  .plate-label {
    fill: var(--foreground);
    font-size: 13px;
  }

  .plate-label.more {
    fill: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 11px;
    text-transform: uppercase;
  }

  .post-link {
    cursor: pointer;
  }

  .post-link:hover .plate-label,
  .post-link:focus-visible .plate-label {
    text-decoration: underline;
  }

  .post-link:focus-visible {
    outline: none;
  }

  .post-link:focus-visible .hit {
    stroke: var(--primary);
    stroke-width: 2px;
  }

  .tip {
    position: absolute;
    z-index: 3;
    display: grid;
    gap: 0.125rem;
    max-width: 16rem;
    border: 1px solid var(--foreground);
    background: var(--background);
    padding: 0.375rem 0.625rem;
    font-size: 0.8125rem;
    line-height: 1.3;
    transform: translateY(calc(-100% - 8px));
    pointer-events: none;
  }

  .tip span {
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.6875rem;
    text-transform: uppercase;
  }

  .hint {
    position: absolute;
    right: 0.75rem;
    bottom: 0.625rem;
    margin: 0;
    background: color-mix(in srgb, var(--background) 80%, transparent);
    padding: 0.125rem 0.375rem;
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.6875rem;
    pointer-events: none;
  }

  .board.panel-open .hint {
    display: none;
  }

  .sr-only {
    position: absolute;
    margin: -1px;
    border: 0;
    padding: 0;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .hint .coarse {
    display: none;
  }

  @media (pointer: coarse) {
    .hint .fine {
      display: none;
    }

    .hint .coarse {
      display: inline;
    }
  }

  /* On small boards the hint sits beside the smaller overview and wraps. */
  @container map (max-width: 40rem) {
    .hint {
      right: 0.5rem;
      bottom: 0.5rem;
      max-width: calc(100% - 9.5rem);
      text-align: right;
    }
  }
</style>
