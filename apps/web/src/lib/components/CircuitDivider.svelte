<script lang="ts">
  // Decorative trace used as a section divider. Two variants:
  //   route: pad, long trace, a 45 degree jog over the grid gap, trace, via. Lines up with
  //          the 17rem + 3rem split used by .section-split. Below 64rem it is one straight run.
  //   bus:   three parallel traces of different lengths ending in solid pads.
  // The signal pulse is split across the route segments and sequenced with keyframes so it
  // appears to travel through the jog.
  let { variant = 'route', delay = 0 }: { variant?: 'route' | 'bus'; delay?: number } = $props();
</script>

{#if variant === 'route'}
  <div class="circuit-divider" data-variant="route" aria-hidden="true" style:--delay="{delay}s">
    <svg class="cd-upper cd-pad" width="12" height="28" focusable="false">
      <rect class="pad" x="1" y="1" width="10" height="10" />
    </svg>
    <svg class="cd-upper cd-seg1" height="28" focusable="false">
      <line class="trace" x1="0" y1="6" x2="100%" y2="6" />
      <line class="pulse" data-seg="a" x1="0" y1="6" x2="100%" y2="6" pathLength="100" />
    </svg>
    <svg class="cd-upper cd-jog" width="48" height="28" focusable="false">
      <path class="trace" d="M0 6H16L32 22H48" />
      <path class="pulse" data-seg="b" d="M0 6H16L32 22H48" pathLength="100" />
    </svg>
    <svg class="cd-lower cd-pad" width="12" height="28" focusable="false">
      <rect class="pad" x="1" y="17" width="10" height="10" />
    </svg>
    <svg class="cd-lower cd-seg2" height="28" focusable="false">
      <line class="trace" x1="0" y1="22" x2="100%" y2="22" />
      <line class="pulse" data-seg="c" x1="0" y1="22" x2="100%" y2="22" pathLength="100" />
    </svg>
    <svg class="cd-lower cd-via" width="12" height="28" focusable="false">
      <circle class="via" cx="6" cy="22" r="5" />
      <circle class="via-dot" cx="6" cy="22" r="1.5" />
    </svg>
  </div>
{:else}
  <div class="circuit-divider" data-variant="bus" aria-hidden="true" style:--delay="{delay}s">
    {#each [0, 1, 2] as row (row)}
      <div class="cd-bus-row" style:--len="{100 - row * 14}%" style:--row={row}>
        <svg class="cd-bus-svg" height="10" focusable="false">
          <rect class="pad pad-solid" x="0" y="1" width="8" height="8" />
          <line class="trace" x1="8" y1="5" x2="100%" y2="5" />
          <line class="pulse" data-seg="bus" x1="8" y1="5" x2="100%" y2="5" pathLength="100" />
          <svg x="100%" y="0" overflow="visible">
            <rect class="pad pad-solid" x="-8" y="1" width="8" height="8" />
          </svg>
        </svg>
      </div>
    {/each}
  </div>
{/if}
