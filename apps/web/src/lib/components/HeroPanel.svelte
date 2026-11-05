<script lang="ts">
  import BrandMark from './BrandMark.svelte';
</script>

<div class="hero-panel" aria-hidden="true">
  <svg class="hero-panel-grid" xmlns="http://www.w3.org/2000/svg" focusable="false">
    <defs>
      <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" fill="none" stroke="currentColor" stroke-width="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#hero-grid)" />
  </svg>
  <span class="tick" data-pos="tl"></span>
  <span class="tick" data-pos="tr"></span>
  <span class="tick" data-pos="bl"></span>
  <span class="tick" data-pos="br"></span>
  <span class="hero-panel-label" data-pos="tl">VOID.REG</span>
  <span class="hero-panel-label" data-pos="br">REV 2026</span>
  <div class="hero-panel-mark"><BrandMark fluid extruded /></div>
</div>
