<script lang="ts">
  import {
    LED_DROP,
    PINS,
    SchematicError,
    formatAmps,
    formatValue,
    formatVolts,
    isEditable,
    labelPlacement,
    parseSchematic,
    partTransform,
    solve,
    symbol,
    wires,
    type Part,
    type Prim,
    type Schematic
  } from './schematic/model';
  import './schematic/schematic.css';

  let {
    payload,
    accessibility
  }: { payload: unknown; accessibility?: { label?: string } } = $props();

  const parsed = $derived.by<{ schematic?: Schematic; failure: string }>(() => {
    try {
      return { schematic: parseSchematic(payload), failure: '' };
    } catch (error) {
      return {
        failure:
          error instanceof SchematicError ? error.message : 'The schematic could not be read.'
      };
    }
  });
  const schematic = $derived(parsed.schematic);
  const failure = $derived(parsed.failure);

  let switches = $state<Record<string, boolean>>({});
  let values = $state<Record<string, number>>({});
  let pinned = $state('');
  let hovered = $state('');
  const active = $derived(hovered || pinned);

  const isClosed = (part: Part) => switches[part.id] ?? part.closed ?? false;
  const valueOf = (part: Part) => values[part.id] ?? part.value ?? 1;
  const solution = $derived(
    schematic ? solve(schematic, { switches, values }) : undefined
  );
  const drawing = $derived(schematic ? wires(schematic) : undefined);

  /** Resistor sweep: the authored value scaled through a preferred-number ladder. */
  const LADDER = [0.1, 0.22, 0.47, 1, 2.2, 4.7, 10];
  const ladderIndex = (part: Part) => {
    const ratio = valueOf(part) / (part.value ?? 1);
    let best = 0;
    LADDER.forEach((step, i) => {
      if (Math.abs(Math.log(step / ratio)) < Math.abs(Math.log(LADDER[best] / ratio))) best = i;
    });
    return best;
  };

  const netCurrent = (netId: string) => {
    if (!schematic || !solution) return 0;
    const net = schematic.nets.find((n) => n.id === netId);
    if (!net) return 0;
    let max = 0;
    for (const pin of net.pins) {
      const current = solution.currents[pin.split('.')[0]];
      if (current !== undefined) max = Math.max(max, Math.abs(current));
    }
    return max;
  };

  const title = $derived(accessibility?.label || 'Interactive schematic');
  const editable = $derived(schematic?.parts.filter(isEditable) ?? []);
  const toggles = $derived(schematic?.parts.filter((p) => p.kind === 'switch') ?? []);
  const leds = $derived(schematic?.parts.filter((p) => p.kind === 'led') ?? []);
  const summary = $derived(
    !schematic || !solution
      ? ''
      : [
          ...leds.map(
            (led) =>
              `${led.label || led.id} is ${solution.lit[led.id] ? 'on' : 'off'}` +
              (solution.lit[led.id] ? `, ${formatAmps(solution.currents[led.id])}` : '')
          ),
          ...toggles.map((t) => `${t.label || t.id} is ${isClosed(t) ? 'closed' : 'open'}`)
        ].join('. ')
  );
  const toggle = (part: Part) => (switches[part.id] = !isClosed(part));
  const keyToggle = (event: KeyboardEvent, part: Part) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle(part);
    }
  };
  const wireNets = (net: string) => active === net;
  const partNets = (part: Part) =>
    schematic?.nets.filter((n) => n.pins.some((p) => p.startsWith(part.id + '.'))).map((n) => n.id) ?? [];
</script>

{#snippet prims(marks: Prim[])}
  {#each marks as mark, i (i)}
    {#if mark.t === 'line'}<line
        x1={mark.x1}
        y1={mark.y1}
        x2={mark.x2}
        y2={mark.y2}
        class={mark.cls ? 'schematic-' + mark.cls : undefined}
      />{:else if mark.t === 'circle'}<circle
        cx={mark.cx}
        cy={mark.cy}
        r={mark.r}
        class={mark.cls ? 'schematic-' + mark.cls : undefined}
      />{:else if mark.t === 'poly'}
      {#if mark.closed}<polygon
          points={mark.points}
          class={mark.cls ? 'schematic-' + mark.cls : undefined}
        />{:else}<polyline points={mark.points} class={mark.cls ? 'schematic-' + mark.cls : undefined} />{/if}
    {:else}<text
        x={mark.x}
        y={mark.y}
        class={'schematic-text' + (mark.cls ? ' schematic-' + mark.cls : '')}>{mark.text}</text
      >{/if}
  {/each}
{/snippet}

{#if failure}
  <p class="schematic-error" role="alert">{failure}</p>
{:else if schematic && solution && drawing}
  <div class="schematic">
    <svg
      class="schematic-figure"
      viewBox={`0 0 ${schematic.width} ${schematic.height}`}
      width={schematic.width}
      height={schematic.height}
      role="group"
      aria-label={title}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <title>{title}</title>
      {#each drawing.wires as wire, i (i)}
        <polyline
          class="schematic-wire"
          class:live={netCurrent(wire.net) > 1e-4}
          class:focus={wireNets(wire.net)}
          class:dim={active && !wireNets(wire.net)}
          points={wire.points.map((p) => `${p.x},${p.y}`).join(' ')}
        />
      {/each}
      {#each drawing.junctions as point (point.x + ',' + point.y)}
        <circle class="schematic-dot" cx={point.x} cy={point.y} r="3.5" />
      {/each}
      {#each schematic.parts as part (part.id)}
        {@const place = labelPlacement(part)}
        {@const marks = symbol(part, { closed: isClosed(part), lit: solution.lit[part.id] })}
        {@const related = partNets(part)}
        <g
          class={`schematic-part schematic-${part.kind}`}
          class:dim={active && !related.includes(active)}
        >
          {#if part.kind === 'switch'}
            <g
              class="schematic-switch-hit"
              role="button"
              tabindex="0"
              aria-pressed={isClosed(part)}
              aria-label={`${part.label || part.id}, ${isClosed(part) ? 'closed' : 'open'}. Press to toggle.`}
              onclick={() => toggle(part)}
              onkeydown={(event) => keyToggle(event, part)}
            >
              <rect
                class="schematic-hit"
                x={part.x - 44}
                y={part.y - 28}
                width="88"
                height="56"
                transform={part.rotation ? `rotate(${part.rotation} ${part.x} ${part.y})` : undefined}
              />
              <g transform={partTransform(part)}>
                {@render prims(marks)}
              </g>
            </g>
          {:else}
            <g transform={partTransform(part)}>
              {@render prims(marks)}
            </g>
          {/if}
          {#if part.label || isEditable(part)}
            <text class="schematic-text" x={place.x} y={place.y} text-anchor={place.anchor}
              >{part.label}{isEditable(part)
                ? (part.label ? ' ' : '') + formatValue(part, valueOf(part))
                : ''}</text
            >
          {/if}
        </g>
      {/each}
    </svg>

    {#if toggles.length || editable.length}
      <div class="schematic-controls">
        {#each toggles as part (part.id)}
          <button
            type="button"
            class="schematic-toggle"
            aria-pressed={isClosed(part)}
            onclick={() => toggle(part)}
            >{part.label || part.id}: {isClosed(part) ? 'closed' : 'open'}</button
          >
        {/each}
        {#each editable as part (part.id)}
          <label class="schematic-slider">
            <span>{part.label || part.id}</span>
            {#if part.kind === 'battery'}
              <input
                type="range"
                min="1"
                max="24"
                step="0.5"
                value={valueOf(part)}
                oninput={(event) => (values[part.id] = Number(event.currentTarget.value))}
              />
            {:else}
              <input
                type="range"
                min="0"
                max={LADDER.length - 1}
                step="1"
                value={ladderIndex(part)}
                oninput={(event) =>
                  (values[part.id] = (part.value ?? 1) * LADDER[Number(event.currentTarget.value)])}
              />
            {/if}
            <output>{formatValue(part, valueOf(part))}</output>
          </label>
        {/each}
      </div>
    {/if}

    <table class="schematic-readout">
      <caption>Live readout</caption>
      <thead>
        <tr><th scope="col">Net</th><th scope="col">Voltage</th></tr>
      </thead>
      <tbody>
        {#each schematic.nets as net (net.id)}
          <tr class:focus={active === net.id}>
            <th scope="row">
              <button
                type="button"
                class="schematic-net"
                aria-pressed={pinned === net.id}
                onclick={() => (pinned = pinned === net.id ? '' : net.id)}
                onmouseenter={() => (hovered = net.id)}
                onmouseleave={() => (hovered = '')}
                onfocus={() => (hovered = net.id)}
                onblur={() => (hovered = '')}>{net.label || net.id}</button
              >
            </th>
            <td>{formatVolts(solution.voltages[net.id])}</td>
          </tr>
        {/each}
        {#each leds as led (led.id)}
          <tr>
            <th scope="row">{led.label || led.id}</th>
            <td
              >{solution.lit[led.id] ? `on, ${formatAmps(solution.currents[led.id])}` : 'off'}
              {#if !solution.lit[led.id]}<span class="schematic-note"
                  >(needs more than {LED_DROP} V across it)</span
                >{/if}</td
            >
          </tr>
        {/each}
      </tbody>
    </table>
    {#if !solution.hasGround}<p class="schematic-note">
        No ground symbol, so voltages are relative to a floating reference.
      </p>{/if}
    <p class="schematic-sr" role="status" aria-live="polite">{summary}</p>
  </div>
{/if}
