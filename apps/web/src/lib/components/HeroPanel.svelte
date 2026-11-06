<script lang="ts">
  import BrandMark from './BrandMark.svelte';
  import CircuitTraces from './CircuitTraces.svelte';
</script>

<div class="hero-panel" aria-hidden="true">
  <CircuitTraces />
  <span class="tick" data-pos="tl"></span>
  <span class="tick" data-pos="tr"></span>
  <span class="tick" data-pos="bl"></span>
  <span class="tick" data-pos="br"></span>
  <span class="hero-panel-label" data-pos="tl">VOID.REG</span>
  <span class="hero-panel-label" data-pos="br">REV 2026</span>
  <div class="hero-panel-mark"><BrandMark fluid extruded /></div>
</div>
