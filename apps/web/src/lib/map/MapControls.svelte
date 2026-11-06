<script lang="ts">
  let {
    zoom,
    onin,
    onout,
    onfit
  }: { zoom: number; onin: () => void; onout: () => void; onfit: () => void } = $props();
</script>

<div class="controls" role="group" aria-label="Map zoom">
  <button type="button" onclick={onin} aria-label="Zoom in">+</button>
  <button type="button" onclick={onout} aria-label="Zoom out">&minus;</button>
  <button type="button" class="fit" onclick={onfit} aria-label="Fit the whole board">Fit</button>
  <output class="level" aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
</div>

<style>
  .controls {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    z-index: 2;
    display: flex;
    align-items: stretch;
    border: 1px solid var(--foreground);
    background: var(--background);
  }

  button {
    display: grid;
    place-content: center;
    border: 0;
    border-right: 1px solid var(--border);
    background: transparent;
    min-width: 2.75rem;
    min-height: 2.75rem;
    color: var(--foreground);
    font-family: var(--font-code);
    font-size: 1.125rem;
    line-height: 1;
    cursor: pointer;
  }

  button:hover {
    background: var(--foreground);
    color: var(--background);
  }

  button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -4px;
  }

  .fit {
    padding-inline: 0.75rem;
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  .level {
    display: grid;
    place-content: center;
    min-width: 3.5rem;
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.75rem;
  }
</style>
