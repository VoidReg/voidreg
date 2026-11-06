<script lang="ts">
  // Decorative PCB routing for the hero panel. Geometry uses a 400x400 viewBox that matches
  // the square panel. Traces leave the edges of the chip mark (drawn on top, so the start
  // points are hidden), use only straight and 45 degree segments, and end in a pad or via.
  type Trace = {
    d: string;
    end: [number, number];
    kind: 'pad' | 'via';
    // Seconds. Traces without a pulse stay static.
    pulse?: { duration: number; delay: number };
  };

  const traces: Trace[] = [
    // Left side
    { d: 'M90 112H64L44 92V62', end: [44, 56], kind: 'pad', pulse: { duration: 7, delay: 0 } },
    { d: 'M90 144H54', end: [48, 144], kind: 'via' },
    { d: 'M90 200H70L52 218H40', end: [34, 218], kind: 'pad', pulse: { duration: 9, delay: 2.4 } },
    { d: 'M90 256H62L42 276V306', end: [42, 312], kind: 'via' },
    { d: 'M90 288H72L56 304V344', end: [56, 350], kind: 'pad', pulse: { duration: 8, delay: 5 } },
    // Right side
    {
      d: 'M310 112H340L360 92V62',
      end: [360, 56],
      kind: 'via',
      pulse: { duration: 8, delay: 1.2 }
    },
    { d: 'M310 144H350', end: [356, 144], kind: 'pad' },
    {
      d: 'M310 200H334L350 216H362',
      end: [368, 216],
      kind: 'via',
      pulse: { duration: 9, delay: 3.6 }
    },
    { d: 'M310 256H338L356 274V306', end: [356, 312], kind: 'pad' },
    {
      d: 'M310 288H328L344 304V344',
      end: [344, 350],
      kind: 'via',
      pulse: { duration: 7, delay: 6 }
    },
    // Top
    { d: 'M130 90V70L150 50H170', end: [176, 50], kind: 'pad', pulse: { duration: 6, delay: 3 } },
    { d: 'M200 90V50', end: [200, 44], kind: 'via' },
    { d: 'M270 90V70L250 50H230', end: [224, 50], kind: 'pad', pulse: { duration: 7, delay: 0.8 } },
    // Bottom
    {
      d: 'M130 310V330L150 350H170',
      end: [176, 350],
      kind: 'via',
      pulse: { duration: 7, delay: 4.2 }
    },
    { d: 'M200 310V350', end: [200, 356], kind: 'pad' },
    {
      d: 'M270 310V330L250 350H230',
      end: [224, 350],
      kind: 'pad',
      pulse: { duration: 6, delay: 1.8 }
    }
  ];
</script>

<svg
  class="circuit-traces"
  viewBox="0 0 400 400"
  xmlns="http://www.w3.org/2000/svg"
  focusable="false"
>
  <defs>
    <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="currentColor" stroke-width="1" />
    </pattern>
  </defs>
  <rect class="circuit-grid" width="400" height="400" fill="url(#hero-grid)" />
  <g class="circuit-lines">
    {#each traces as trace (trace.d)}
      <path class="trace" d={trace.d} />
      {#if trace.kind === 'pad'}
        <rect class="pad" x={trace.end[0] - 5} y={trace.end[1] - 5} width="10" height="10" />
      {:else}
        <circle class="via" cx={trace.end[0]} cy={trace.end[1]} r="5" />
        <circle class="via-dot" cx={trace.end[0]} cy={trace.end[1]} r="1.5" />
      {/if}
    {/each}
  </g>
  <g class="circuit-pulses">
    {#each traces as trace (trace.d)}
      {#if trace.pulse}
        <path
          class="pulse"
          d={trace.d}
          pathLength="100"
          style:animation-duration="{trace.pulse.duration}s"
          style:animation-delay="{trace.pulse.delay}s"
        />
      {/if}
    {/each}
  </g>
</svg>
