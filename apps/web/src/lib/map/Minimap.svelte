<script lang="ts">
  import type { Board } from './board';
  import { visibleRect, type Size, type View } from './viewport';

  let {
    board,
    view,
    size,
    width: WIDTH = 168,
    onnavigate
  }: {
    board: Board;
    width?: number;
    view: View;
    size: Size;
    /** Called with the world point the person chose, to centre the main view on it. */
    onnavigate: (x: number, y: number) => void;
  } = $props();

  const height = $derived(Math.max(48, Math.min(132, (board.height * WIDTH) / board.width)));
  const fitted = $derived(Math.min(WIDTH / board.width, height / board.height));
  const vp = $derived(visibleRect(view, size));
  let svg = $state<SVGSVGElement>();
  let dragging = false;

  function go(e: PointerEvent) {
    const box = svg!.getBoundingClientRect();
    onnavigate((e.clientX - box.left) / fitted, (e.clientY - box.top) / fitted);
  }
</script>

<svg
  bind:this={svg}
  class="minimap"
  width={WIDTH}
  {height}
  role="img"
  aria-label="Overview of the whole board. Drag to move the view."
  onpointerdown={(e) => {
    dragging = true;
    svg!.setPointerCapture(e.pointerId);
    go(e);
  }}
  onpointermove={(e) => dragging && go(e)}
  onpointerup={() => (dragging = false)}
  onpointercancel={() => (dragging = false)}
>
  <g transform="scale({fitted})">
    <rect class="area" width={board.width} height={board.height} />
    {#each board.modules as m (m.key)}
      <rect class="mod" x={m.x} y={m.y} width={m.w} height={m.h} />
    {/each}
    <rect
      class="view"
      x={Math.max(0, vp.x)}
      y={Math.max(0, vp.y)}
      width={Math.min(board.width, vp.w)}
      height={Math.min(board.height, vp.h)}
    />
  </g>
</svg>

<style>
  .minimap {
    position: absolute;
    bottom: 0.75rem;
    left: 0.75rem;
    z-index: 2;
    border: 1px solid var(--foreground);
    background: var(--background);
    cursor: crosshair;
    touch-action: none;
  }

  .area {
    fill: var(--background);
  }

  .mod {
    fill: var(--muted-foreground);
    opacity: 0.45;
  }

  .view {
    fill: color-mix(in srgb, var(--primary) 18%, transparent);
    stroke: var(--primary);
    stroke-width: 3px;
    vector-effect: non-scaling-stroke;
  }
</style>
