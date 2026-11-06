// Schematic model, geometry and DC solver. Framework free so the compiler, the reader,
// the admin editor and tests share one definition.
export const PART_KINDS = [
  'battery',
  'switch',
  'resistor',
  'capacitor',
  'led',
  'ground',
  'junction',
  'label'
] as const;
export type PartKind = (typeof PART_KINDS)[number];
export type Rotation = 0 | 90 | 180 | 270;

export interface Part {
  id: string;
  kind: PartKind;
  x: number;
  y: number;
  rotation: Rotation;
  label: string;
  /** Volts for a battery, ohms for a resistor, microfarads for a capacitor. */
  value?: number;
  /** Switch state at load. */
  closed?: boolean;
}
export interface Net {
  id: string;
  label: string;
  /** Pin references such as `R1.a`. */
  pins: string[];
}
export interface Schematic {
  width: number;
  height: number;
  parts: Part[];
  nets: Net[];
}
export interface Point {
  x: number;
  y: number;
}

export const PINS: Record<PartKind, readonly string[]> = {
  battery: ['p', 'n'],
  switch: ['a', 'b'],
  resistor: ['a', 'b'],
  capacitor: ['a', 'b'],
  led: ['a', 'b'],
  ground: ['a'],
  junction: ['a'],
  label: ['a']
};
export const LIMITS = {
  minWidth: 160,
  maxWidth: 1200,
  minHeight: 100,
  maxHeight: 800,
  maxParts: 60,
  maxNets: 60,
  maxPinsPerNet: 12,
  maxLabel: 40,
  maxValue: 1e9
} as const;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,15}$/;
const HALF = 40;
const EDITABLE: PartKind[] = ['battery', 'resistor'];
export const isEditable = (part: Part) => EDITABLE.includes(part.kind);

export class SchematicError extends Error {}
const fail = (message: string): never => {
  throw new SchematicError(message);
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const ALLOWED_TOP = new Set(['width', 'height', 'parts', 'nets']);
const ALLOWED_PART = new Set(['id', 'kind', 'x', 'y', 'rotation', 'label', 'value', 'closed']);
const ALLOWED_NET = new Set(['id', 'label', 'pins']);

/** Strict parser. Unknown keys and dangling references are errors, never ignored. */
export function parseSchematic(input: unknown): Schematic {
  if (!isRecord(input)) return fail('Schematic payload must be an object.');
  for (const key of Object.keys(input))
    if (!ALLOWED_TOP.has(key)) fail(`Schematic payload.${key} is not supported.`);
  const { width, height } = input;
  if (!finite(width) || width < LIMITS.minWidth || width > LIMITS.maxWidth)
    fail(`Schematic width must be between ${LIMITS.minWidth} and ${LIMITS.maxWidth}.`);
  if (!finite(height) || height < LIMITS.minHeight || height > LIMITS.maxHeight)
    fail(`Schematic height must be between ${LIMITS.minHeight} and ${LIMITS.maxHeight}.`);
  if (!Array.isArray(input.parts) || input.parts.length === 0)
    fail('Schematic needs at least one part.');
  if (!Array.isArray(input.nets)) fail('Schematic nets must be a list.');
  const rawParts = input.parts as unknown[];
  const rawNets = input.nets as unknown[];
  if (rawParts.length > LIMITS.maxParts) fail(`Schematic allows at most ${LIMITS.maxParts} parts.`);
  if (rawNets.length > LIMITS.maxNets) fail(`Schematic allows at most ${LIMITS.maxNets} nets.`);

  const parts: Part[] = [];
  const seen = new Set<string>();
  for (const raw of rawParts) {
    if (!isRecord(raw)) fail('Every part must be an object.');
    const part = raw as Record<string, unknown>;
    for (const key of Object.keys(part)) if (!ALLOWED_PART.has(key)) fail(`Part ${String(part.id)}: ${key} is not supported.`);
    const id = part.id;
    if (typeof id !== 'string' || !ID.test(id))
      fail('Part ids start with a letter and use letters, digits, - or _ (16 characters at most).');
    if (seen.has(id as string)) fail(`Duplicate part id ${id}.`);
    seen.add(id as string);
    if (!PART_KINDS.includes(part.kind as PartKind)) fail(`Part ${id} has an unknown kind.`);
    if (!finite(part.x) || !finite(part.y)) fail(`Part ${id} needs numeric x and y.`);
    const x = part.x as number;
    const y = part.y as number;
    if (x < 0 || y < 0 || x > (width as number) || y > (height as number))
      fail(`Part ${id} lies outside the drawing.`);
    const rotation = (part.rotation ?? 0) as number;
    if (![0, 90, 180, 270].includes(rotation)) fail(`Part ${id} rotation must be 0, 90, 180 or 270.`);
    const label = part.label ?? '';
    if (typeof label !== 'string' || label.length > LIMITS.maxLabel)
      fail(`Part ${id} label must be text of ${LIMITS.maxLabel} characters at most.`);
    const kind = part.kind as PartKind;
    let value: number | undefined;
    if (part.value !== undefined) {
      if (!finite(part.value) || part.value <= 0 || part.value > LIMITS.maxValue)
        fail(`Part ${id} value must be a positive number.`);
      value = part.value as number;
    }
    if ((kind === 'battery' || kind === 'resistor') && value === undefined)
      fail(`Part ${id} needs a value.`);
    if (part.closed !== undefined && typeof part.closed !== 'boolean')
      fail(`Part ${id} closed must be true or false.`);
    parts.push({
      id: id as string,
      kind,
      x,
      y,
      rotation: rotation as Rotation,
      label: label as string,
      ...(value === undefined ? {} : { value }),
      ...(kind === 'switch' ? { closed: part.closed === true } : {})
    });
  }

  const nets: Net[] = [];
  const netIds = new Set<string>();
  const used = new Map<string, string>();
  for (const raw of rawNets) {
    if (!isRecord(raw)) fail('Every net must be an object.');
    const net = raw as Record<string, unknown>;
    for (const key of Object.keys(net)) if (!ALLOWED_NET.has(key)) fail(`Net ${String(net.id)}: ${key} is not supported.`);
    if (typeof net.id !== 'string' || !ID.test(net.id)) fail('Net ids use the same rules as part ids.');
    const id = net.id as string;
    if (netIds.has(id)) fail(`Duplicate net id ${id}.`);
    netIds.add(id);
    const label = net.label ?? '';
    if (typeof label !== 'string' || label.length > LIMITS.maxLabel)
      fail(`Net ${id} label must be text of ${LIMITS.maxLabel} characters at most.`);
    if (!Array.isArray(net.pins) || net.pins.length < 2)
      fail(`Net ${id} must connect at least two pins.`);
    const pins = net.pins as unknown[];
    if (pins.length > LIMITS.maxPinsPerNet)
      fail(`Net ${id} connects too many pins (${LIMITS.maxPinsPerNet} at most).`);
    for (const pin of pins) {
      if (typeof pin !== 'string') fail(`Net ${id} pins must be text such as R1.a.`);
      const ref = pin as string;
      const [partId, pinName, ...rest] = ref.split('.');
      const part = parts.find((p) => p.id === partId);
      if (!part || !pinName || rest.length) fail(`Net ${id}: ${ref} does not name a part pin.`);
      if (!PINS[part!.kind].includes(pinName)) fail(`Net ${id}: ${part!.kind} ${partId} has no pin ${pinName}.`);
      if (used.has(ref)) fail(`Pin ${ref} is already in net ${used.get(ref)}.`);
      used.set(ref, id);
    }
    nets.push({ id, label: label as string, pins: pins as string[] });
  }
  return { width: width as number, height: height as number, parts, nets };
}

// ---- geometry -------------------------------------------------------------------------

const LOCAL_PINS: Record<PartKind, Record<string, Point>> = {
  battery: { n: { x: -HALF, y: 0 }, p: { x: HALF, y: 0 } },
  switch: { a: { x: -HALF, y: 0 }, b: { x: HALF, y: 0 } },
  resistor: { a: { x: -HALF, y: 0 }, b: { x: HALF, y: 0 } },
  capacitor: { a: { x: -HALF, y: 0 }, b: { x: HALF, y: 0 } },
  led: { a: { x: -HALF, y: 0 }, b: { x: HALF, y: 0 } },
  ground: { a: { x: 0, y: 0 } },
  junction: { a: { x: 0, y: 0 } },
  label: { a: { x: 0, y: 0 } }
};

export function rotate(point: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 90:
      return { x: -point.y || 0, y: point.x };
    case 180:
      return { x: -point.x || 0, y: -point.y || 0 };
    case 270:
      return { x: point.y, y: -point.x || 0 };
    default:
      return { x: point.x, y: point.y };
  }
}
export function pinPoint(part: Part, pin: string): Point {
  const local = LOCAL_PINS[part.kind][pin];
  const r = rotate(local, part.rotation);
  return { x: part.x + r.x, y: part.y + r.y };
}
export function partOf(schematic: Schematic, pinRef: string): Part | undefined {
  return schematic.parts.find((p) => p.id === pinRef.split('.')[0]);
}
export function pointOf(schematic: Schematic, pinRef: string): Point {
  const [id, pin] = pinRef.split('.');
  const part = schematic.parts.find((p) => p.id === id);
  return part ? pinPoint(part, pin) : { x: 0, y: 0 };
}

export interface Wire {
  net: string;
  points: Point[];
}
/** Manhattan wires: every pin runs along the first pin's row, then turns to its own pin. */
export function wires(schematic: Schematic): { wires: Wire[]; junctions: Point[] } {
  const result: Wire[] = [];
  const segments: [Point, Point][] = [];
  for (const net of schematic.nets) {
    const [rootRef, ...others] = net.pins;
    const root = pointOf(schematic, rootRef);
    for (const ref of others) {
      const to = pointOf(schematic, ref);
      const points: Point[] = [root];
      if (to.x !== root.x && to.y !== root.y) points.push({ x: to.x, y: root.y });
      points.push(to);
      result.push({ net: net.id, points });
      for (let i = 1; i < points.length; i++) segments.push([points[i - 1], points[i]]);
    }
  }
  const touches = (p: Point, [a, b]: [Point, Point]) =>
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y);
  const junctions: Point[] = [];
  const key = (p: Point) => p.x + ',' + p.y;
  const seen = new Set<string>();
  for (const [a, b] of segments)
    for (const p of [a, b]) {
      if (seen.has(key(p))) continue;
      seen.add(key(p));
      const count = segments.filter((s) => touches(p, s)).length;
      if (count >= 3) junctions.push(p);
    }
  return { wires: result, junctions };
}

export type Prim =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; cls?: string }
  | { t: 'poly'; points: string; closed?: boolean; cls?: string }
  | { t: 'circle'; cx: number; cy: number; r: number; cls?: string }
  | { t: 'text'; x: number; y: number; text: string; cls?: string };

const line = (x1: number, y1: number, x2: number, y2: number, cls?: string): Prim => ({
  t: 'line',
  x1,
  y1,
  x2,
  y2,
  cls
});

export interface PartState {
  closed?: boolean;
  lit?: boolean;
}
/** Symbol drawing in the part's local frame (pins at +-40 for two-terminal parts). */
export function symbol(part: Part, state: PartState = {}): Prim[] {
  switch (part.kind) {
    case 'resistor':
      return [
        line(-40, 0, -20, 0),
        { t: 'poly', points: '-20,0 -15,-8 -5,8 5,-8 15,8 20,0' },
        line(20, 0, 40, 0)
      ];
    case 'capacitor':
      return [line(-40, 0, -6, 0), line(6, 0, 40, 0), line(-6, -12, -6, 12), line(6, -12, 6, 12)];
    case 'battery':
      return [
        line(-40, 0, -6, 0),
        line(6, 0, 40, 0),
        line(-6, -7, -6, 7),
        line(6, -14, 6, 14),
        line(16, -12, 24, -12),
        line(20, -16, 20, -8)
      ];
    case 'switch': {
      const closed = state.closed ?? part.closed ?? false;
      return [
        line(-40, 0, -14, 0),
        line(14, 0, 40, 0),
        { t: 'circle', cx: -14, cy: 0, r: 2.5, cls: 'dot' },
        { t: 'circle', cx: 14, cy: 0, r: 2.5, cls: 'dot' },
        closed ? line(-14, 0, 14, 0, 'blade') : line(-14, 0, 10, -16, 'blade')
      ];
    }
    case 'led':
      return [
        line(-40, 0, -12, 0),
        line(12, 0, 40, 0),
        { t: 'poly', points: '-12,-12 -12,12 12,0', closed: true, cls: state.lit ? 'lit' : 'body' },
        line(12, -12, 12, 12),
        line(0, -16, 8, -26, 'ray'),
        line(8, -12, 16, -22, 'ray')
      ];
    case 'ground':
      return [line(0, 0, 0, 10), line(-14, 10, 14, 10), line(-9, 15, 9, 15), line(-4, 20, 4, 20)];
    case 'junction':
      return [{ t: 'circle', cx: 0, cy: 0, r: 3.5, cls: 'dot' }];
    default:
      return [];
  }
}
/** Where a part's label sits, in drawing coordinates, and its text anchor. */
export function labelPlacement(part: Part): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  if (part.kind === 'label') return { x: part.x, y: part.y, anchor: 'start' };
  if (part.kind === 'ground') return { x: part.x + 20, y: part.y + 18, anchor: 'start' };
  if (part.kind === 'junction') return { x: part.x + 6, y: part.y - 6, anchor: 'start' };
  if (part.rotation === 90 || part.rotation === 270) return { x: part.x + 22, y: part.y + 4, anchor: 'start' };
  return { x: part.x, y: part.y - 20, anchor: 'middle' };
}
export const partTransform = (part: Part) =>
  `translate(${part.x} ${part.y})${part.rotation ? ` rotate(${part.rotation})` : ''}`;

// ---- DC solver ------------------------------------------------------------------------

export const LED_DROP = 2;
const LED_R = 20;
const BATTERY_R = 0.1;
const SWITCH_R = 0.01;
const GMIN = 1e-9;
export const LIT_CURRENT = 0.001;

export interface Controls {
  /** Switch state by part id. */
  switches?: Record<string, boolean>;
  /** Value override by part id (volts or ohms). */
  values?: Record<string, number>;
}
export interface Solution {
  /** Voltage of every net by net id, relative to ground. */
  voltages: Record<string, number>;
  /** Current through each part by id, in amperes (battery: delivered through p). */
  currents: Record<string, number>;
  lit: Record<string, boolean>;
  hasGround: boolean;
}

function solveLinear(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-18) continue;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row, i) => (Math.abs(row[i]) < 1e-18 ? 0 : row[n] / row[i]));
}

export function solve(schematic: Schematic, controls: Controls = {}): Solution {
  // Union pins into nodes; every ground pin joins node 0.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) as string;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const pinsOf = (part: Part) => PINS[part.kind].map((pin) => `${part.id}.${pin}`);
  for (const part of schematic.parts) for (const pin of pinsOf(part)) parent.set(pin, pin);
  for (const net of schematic.nets) for (const pin of net.pins.slice(1)) union(net.pins[0], pin);
  const grounds = schematic.parts.filter((p) => p.kind === 'ground').map((p) => `${p.id}.a`);
  for (const pin of grounds.slice(1)) union(grounds[0], pin);
  const groundRoot = grounds.length ? find(grounds[0]) : '';

  const index = new Map<string, number>();
  for (const part of schematic.parts)
    for (const pin of pinsOf(part)) {
      const root = find(pin);
      if (root === groundRoot) continue;
      if (!index.has(root)) index.set(root, index.size);
    }
  const n = index.size;
  const node = (pin: string) => (find(pin) === groundRoot ? -1 : (index.get(find(pin)) as number));

  const value = (part: Part) => controls.values?.[part.id] ?? part.value ?? 1;
  const closed = (part: Part) => controls.switches?.[part.id] ?? part.closed ?? false;
  const leds = schematic.parts.filter((p) => p.kind === 'led');
  const on = new Map<string, boolean>(leds.map((p) => [p.id, false]));

  const run = () => {
    const g = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const rhs = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) g[i][i] += GMIN;
    const conduct = (a: number, b: number, c: number) => {
      if (a >= 0) g[a][a] += c;
      if (b >= 0) g[b][b] += c;
      if (a >= 0 && b >= 0) {
        g[a][b] -= c;
        g[b][a] -= c;
      }
    };
    // Current leaving `a` is c*(Va-Vb) + k, so the constant moves to the right side.
    const offset = (a: number, b: number, k: number) => {
      if (a >= 0) rhs[a] -= k;
      if (b >= 0) rhs[b] += k;
    };
    for (const part of schematic.parts) {
      const [p, q] = PINS[part.kind].map((pin) => node(`${part.id}.${pin}`));
      if (part.kind === 'resistor') conduct(p, q, 1 / value(part));
      else if (part.kind === 'switch' && closed(part)) conduct(p, q, 1 / SWITCH_R);
      else if (part.kind === 'battery') {
        conduct(p, q, 1 / BATTERY_R);
        offset(p, q, (-value(part)) / BATTERY_R);
      } else if (part.kind === 'led' && on.get(part.id)) {
        conduct(p, q, 1 / LED_R);
        offset(p, q, -LED_DROP / LED_R);
      }
    }
    return n ? solveLinear(g, rhs) : [];
  };

  let v = run();
  const volt = (pin: string) => {
    const i = node(pin);
    return i < 0 ? 0 : v[i];
  };
  for (let step = 0; step < 24; step++) {
    let changed = false;
    for (const led of leds) {
      const vab = volt(`${led.id}.a`) - volt(`${led.id}.b`);
      const isOn = on.get(led.id) as boolean;
      if (!isOn && vab > LED_DROP + 1e-9) {
        on.set(led.id, true);
        changed = true;
      } else if (isOn && (vab - LED_DROP) / LED_R < 0) {
        on.set(led.id, false);
        changed = true;
      }
    }
    if (!changed) break;
    v = run();
  }

  const currents: Record<string, number> = {};
  const lit: Record<string, boolean> = {};
  for (const part of schematic.parts) {
    const [a, b] = PINS[part.kind].map((pin) => `${part.id}.${pin}`);
    const vab = volt(a) - volt(b ?? a);
    if (part.kind === 'resistor') currents[part.id] = vab / value(part);
    else if (part.kind === 'switch') currents[part.id] = closed(part) ? vab / SWITCH_R : 0;
    else if (part.kind === 'battery') currents[part.id] = (value(part) - vab) / BATTERY_R;
    else if (part.kind === 'led') {
      currents[part.id] = on.get(part.id) ? (vab - LED_DROP) / LED_R : 0;
      lit[part.id] = currents[part.id] >= LIT_CURRENT;
    } else if (part.kind === 'capacitor') currents[part.id] = 0;
  }
  const voltages: Record<string, number> = {};
  for (const net of schematic.nets) voltages[net.id] = volt(net.pins[0]);
  return { voltages, currents, lit, hasGround: grounds.length > 0 };
}

export function formatVolts(v: number): string {
  const abs = Math.abs(v);
  return `${abs < 0.005 ? '0' : v.toFixed(abs < 10 ? 2 : 1)} V`;
}
export function formatAmps(i: number): string {
  const abs = Math.abs(i);
  if (abs < 1e-6) return '0 A';
  if (abs < 1) return `${(i * 1000).toFixed(abs < 0.01 ? 2 : 1)} mA`;
  return `${i.toFixed(2)} A`;
}
export function formatValue(part: Part, v: number): string {
  if (part.kind === 'battery') return `${+v.toFixed(2)} V`;
  if (part.kind === 'capacitor') return `${+v.toFixed(2)} \u00b5F`;
  if (v >= 1e6) return `${+(v / 1e6).toFixed(2)} M\u03a9`;
  if (v >= 1e3) return `${+(v / 1e3).toFixed(2)} k\u03a9`;
  return `${+v.toFixed(2)} \u03a9`;
}
