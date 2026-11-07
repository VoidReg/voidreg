<script lang="ts">
  import Schematic from './View.svelte';
  import Select from '../../ui/Select.svelte';
  import Combobox from '../../ui/Combobox.svelte';
  import {
    LIMITS,
    PART_KINDS,
    PINS,
    SchematicError,
    parseSchematic,
    type Net,
    type Part,
    type PartKind
  } from './model';

  interface Draft {
    width: number;
    height: number;
    parts: Part[];
    nets: Net[];
  }
  let { value, onchange }: { value: Record<string, unknown>; onchange: (next: Draft) => void } =
    $props();

  const draft = $derived<Draft>({
    width: Number(value.width) || 480,
    height: Number(value.height) || 240,
    parts: Array.isArray(value.parts) ? (value.parts as Part[]) : [],
    nets: Array.isArray(value.nets) ? (value.nets as Net[]) : []
  });
  const problem = $derived.by(() => {
    try {
      parseSchematic(value);
      return '';
    } catch (error) {
      return error instanceof SchematicError ? error.message : 'The schematic is not valid.';
    }
  });
  const pinOptions = $derived(
    draft.parts.flatMap((part) => (PINS[part.kind] ?? []).map((pin) => `${part.id}.${pin}`))
  );
  const rotationOptions = [0, 90, 180, 270].map((degrees) => ({
    value: String(degrees),
    label: `${degrees}\u00b0`
  }));
  const PREFIX: Record<PartKind, string> = {
    battery: 'B',
    switch: 'S',
    resistor: 'R',
    capacitor: 'C',
    led: 'D',
    ground: 'G',
    junction: 'J',
    label: 'L'
  };
  const DEFAULT_VALUE: Partial<Record<PartKind, number>> = { battery: 9, resistor: 330 };
  const KIND_NAME: Record<PartKind, string> = {
    battery: 'Battery',
    switch: 'Switch',
    resistor: 'Resistor',
    capacitor: 'Capacitor',
    led: 'LED',
    ground: 'Ground',
    junction: 'Junction',
    label: 'Label'
  };
  const kindOptions = PART_KINDS.map((kind) => ({ value: kind, label: KIND_NAME[kind] }));
  let newKind = $state<PartKind>('resistor');
  let showJson = $state(false);
  let jsonError = $state('');

  const emit = (next: Partial<Draft>) => onchange({ ...draft, ...next });
  const setPart = (id: string, patch: Partial<Part>) =>
    emit({ parts: draft.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const setNet = (index: number, patch: Partial<Net>) =>
    emit({ nets: draft.nets.map((n, i) => (i === index ? { ...n, ...patch } : n)) });
  const num = (event: Event, fallback: number) => {
    const n = (event.currentTarget as HTMLInputElement).valueAsNumber;
    return Number.isFinite(n) ? n : fallback;
  };

  function nextId(kind: PartKind) {
    let n = 1;
    while (draft.parts.some((p) => p.id === `${PREFIX[kind]}${n}`)) n += 1;
    return `${PREFIX[kind]}${n}`;
  }
  function addPart() {
    if (draft.parts.length >= LIMITS.maxParts) return;
    const id = nextId(newKind);
    const part: Part = {
      id,
      kind: newKind,
      x: Math.round(draft.width / 2 / 20) * 20,
      y: Math.round(draft.height / 2 / 20) * 20,
      rotation: 0,
      label: ['ground', 'junction'].includes(newKind) ? '' : id
    };
    if (DEFAULT_VALUE[newKind] !== undefined) part.value = DEFAULT_VALUE[newKind];
    if (newKind === 'switch') part.closed = false;
    emit({ parts: [...draft.parts, part] });
  }
  function removePart(id: string) {
    emit({
      parts: draft.parts.filter((p) => p.id !== id),
      nets: draft.nets.map((n) => ({ ...n, pins: n.pins.filter((p) => !p.startsWith(id + '.')) }))
    });
  }
  function renamePart(part: Part, raw: string) {
    const id = raw.trim();
    if (!id || id === part.id || draft.parts.some((p) => p.id === id)) return;
    emit({
      parts: draft.parts.map((p) => (p.id === part.id ? { ...p, id } : p)),
      nets: draft.nets.map((n) => ({
        ...n,
        pins: n.pins.map((pin) =>
          pin.startsWith(part.id + '.') ? id + pin.slice(part.id.length) : pin
        )
      }))
    });
  }
  function addNet() {
    if (draft.nets.length >= LIMITS.maxNets) return;
    let n = 1;
    while (draft.nets.some((net) => net.id === `n${n}`)) n += 1;
    emit({ nets: [...draft.nets, { id: `n${n}`, label: '', pins: [] }] });
  }
  const parsePins = (raw: string) =>
    raw
      .split(/[\s,]+/)
      .map((pin) => pin.trim())
      .filter(Boolean);
  function applyJson(raw: string) {
    try {
      const parsed = JSON.parse(raw);
      jsonError = '';
      onchange(parsed);
    } catch {
      jsonError = 'Enter valid JSON.';
    }
  }
</script>

<fieldset class="schematic-editor">
  <legend>Schematic</legend>
  <p class="editor-help">
    Place parts on the grid, then join pins with nets. Wires route automatically. Pin names look
    like <code>R1.a</code>.
  </p>

  <div class="schematic-editor-size">
    <label class="editor-field"
      >Width<input
        type="number"
        min={LIMITS.minWidth}
        max={LIMITS.maxWidth}
        step="20"
        value={draft.width}
        oninput={(event) => emit({ width: num(event, draft.width) })}
      /></label
    >
    <label class="editor-field"
      >Height<input
        type="number"
        min={LIMITS.minHeight}
        max={LIMITS.maxHeight}
        step="20"
        value={draft.height}
        oninput={(event) => emit({ height: num(event, draft.height) })}
      /></label
    >
  </div>

  <h3 class="schematic-editor-heading">Parts ({draft.parts.length})</h3>
  <div class="schematic-editor-scroll">
    <table class="schematic-editor-table">
      <caption class="sr-only">Parts</caption>
      <thead>
        <tr>
          <th scope="col">ID</th><th scope="col">Type</th><th scope="col">Label</th>
          <th scope="col">X</th><th scope="col">Y</th><th scope="col">Turn</th>
          <th scope="col">Value or state</th><th scope="col"><span class="sr-only">Remove</span></th
          >
        </tr>
      </thead>
      <tbody>
        {#each draft.parts as part (part.id)}
          <tr>
            <td
              ><input
                aria-label={`ID of ${part.id}`}
                value={part.id}
                maxlength="16"
                onchange={(event) => {
                  renamePart(part, event.currentTarget.value);
                  event.currentTarget.value = part.id;
                }}
              /></td
            >
            <td
              ><Select
                label={`Type of ${part.id}`}
                value={part.kind}
                options={kindOptions}
                onchange={(value) => {
                  const kind = value as PartKind;
                  setPart(part.id, {
                    kind,
                    value: DEFAULT_VALUE[kind] ?? (kind === 'capacitor' ? 10 : undefined),
                    closed: kind === 'switch' ? false : undefined
                  });
                }}
              /></td
            >
            <td
              ><input
                aria-label={`Label of ${part.id}`}
                value={part.label}
                maxlength={LIMITS.maxLabel}
                oninput={(event) => setPart(part.id, { label: event.currentTarget.value })}
              /></td
            >
            <td
              ><input
                type="number"
                step="10"
                aria-label={`X of ${part.id}`}
                value={part.x}
                oninput={(event) => setPart(part.id, { x: num(event, part.x) })}
              /></td
            >
            <td
              ><input
                type="number"
                step="10"
                aria-label={`Y of ${part.id}`}
                value={part.y}
                oninput={(event) => setPart(part.id, { y: num(event, part.y) })}
              /></td
            >
            <td
              ><Select
                label={`Rotation of ${part.id}`}
                value={String(part.rotation)}
                options={rotationOptions}
                onchange={(value) =>
                  setPart(part.id, { rotation: Number(value) as Part['rotation'] })}
              /></td
            >
            <td>
              {#if part.kind === 'switch'}
                <label class="schematic-editor-check"
                  ><input
                    type="checkbox"
                    checked={part.closed ?? false}
                    onchange={(event) => setPart(part.id, { closed: event.currentTarget.checked })}
                  />Closed at load</label
                >
              {:else if part.kind === 'battery' || part.kind === 'resistor' || part.kind === 'capacitor'}
                <input
                  type="number"
                  min="0"
                  step="any"
                  aria-label={`${part.kind === 'battery' ? 'Volts' : part.kind === 'resistor' ? 'Ohms' : 'Microfarads'} of ${part.id}`}
                  value={part.value ?? 0}
                  oninput={(event) => setPart(part.id, { value: num(event, part.value ?? 0) })}
                />
              {:else}<span class="editor-help">None</span>{/if}
            </td>
            <td
              ><button
                type="button"
                class="editor-button danger"
                aria-label={`Remove ${part.id}`}
                onclick={() => removePart(part.id)}>Remove</button
              ></td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="schematic-editor-add">
    <label class="editor-field"
      >New part<Select label="New part" bind:value={newKind} options={kindOptions} /></label
    >
    <button
      type="button"
      class="editor-button secondary"
      disabled={draft.parts.length >= LIMITS.maxParts}
      onclick={addPart}>Add part</button
    >
  </div>

  <h3 class="schematic-editor-heading">Nets ({draft.nets.length})</h3>
  <div class="schematic-editor-scroll">
    <table class="schematic-editor-table">
      <caption class="sr-only">Nets</caption>
      <thead>
        <tr>
          <th scope="col">ID</th><th scope="col">Label</th><th scope="col"
            >Pins (comma separated)</th
          >
          <th scope="col"><span class="sr-only">Remove</span></th>
        </tr>
      </thead>
      <tbody>
        {#each draft.nets as net, index (index)}
          <tr>
            <td
              ><input
                aria-label={`ID of net ${index + 1}`}
                value={net.id}
                maxlength="16"
                onchange={(event) => setNet(index, { id: event.currentTarget.value.trim() })}
              /></td
            >
            <td
              ><input
                aria-label={`Label of net ${net.id}`}
                value={net.label}
                maxlength={LIMITS.maxLabel}
                oninput={(event) => setNet(index, { label: event.currentTarget.value })}
              /></td
            >
            <td
              ><Combobox
                label={`Pins of net ${net.id}`}
                value={net.pins.join(', ')}
                options={pinOptions.map((pin) => ({ value: pin, label: pin }))}
                separator=","
                onchange={(value) => setNet(index, { pins: parsePins(value) })}
              /></td
            >
            <td
              ><button
                type="button"
                class="editor-button danger"
                aria-label={`Remove net ${net.id}`}
                onclick={() => emit({ nets: draft.nets.filter((_, i) => i !== index) })}
                >Remove</button
              ></td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <button
    type="button"
    class="editor-button secondary"
    disabled={draft.nets.length >= LIMITS.maxNets}
    onclick={addNet}>Add net</button
  >

  {#if problem}<p class="block-validation-error" role="alert">{problem}</p>{/if}

  <h3 class="schematic-editor-heading">Preview</h3>
  <div class="schematic-editor-preview"><Schematic payload={value} /></div>

  <details class="inspector-details" bind:open={showJson}>
    <summary>Edit as JSON</summary>
    <label class="editor-field"
      >Schematic JSON<textarea
        rows="12"
        value={JSON.stringify(value, null, 2)}
        onchange={(event) => applyJson(event.currentTarget.value)}></textarea></label
    >
    {#if jsonError}<p class="block-validation-error" role="alert">{jsonError}</p>{/if}
  </details>
</fieldset>

<style>
  .schematic-editor {
    display: grid;
    gap: 0.75rem;
    margin: 1rem 0 0;
    border: 1px solid var(--border);
    padding: 1rem;
    min-width: 0;
  }
  .schematic-editor legend {
    padding-inline: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
  }
  .schematic-editor-heading {
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
    font-weight: 600;
  }
  .schematic-editor-size {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 12rem));
    gap: 0.75rem;
  }
  .schematic-editor-scroll {
    overflow-x: auto;
  }
  .schematic-editor-table {
    border-collapse: collapse;
    width: 100%;
    min-width: 46rem;
    font-size: 0.8125rem;
  }
  .schematic-editor-table th {
    padding: 0.25rem 0.375rem;
    text-align: start;
    font-weight: 600;
    color: var(--muted-foreground);
  }
  .schematic-editor-table td {
    border-top: 1px solid var(--border);
    padding: 0.25rem;
    vertical-align: middle;
  }
  .schematic-editor-table td {
    --ui-control-size: 0.875rem;
  }
  .schematic-editor-table td :global(:is(.ui-select, .ui-combobox)) {
    min-width: 7rem;
  }
  .schematic-editor-table :where(input:not([type='checkbox'])) {
    border: 1px solid var(--input);
    border-radius: var(--radius);
    background: var(--background);
    color: var(--foreground);
    padding: 0.5rem;
    width: 100%;
    min-width: 3.5rem;
    min-height: 2.75rem;
    font: inherit;
  }
  .schematic-editor-check {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 2.75rem;
  }
  .schematic-editor-add {
    display: flex;
    gap: 0.75rem;
    align-items: end;
  }
  .schematic-editor-preview {
    border-top: 1px solid var(--border);
    padding-top: 0.5rem;
  }
</style>
