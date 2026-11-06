import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSchematic, pinPoint, solve, wires, type Schematic, SchematicError } from './model';
import { sampleSchematic } from './sample';

const near = (actual: number, expected: number, tolerance = 1e-3) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
const bad = (mutate: (s: Schematic) => unknown, pattern: RegExp) =>
  assert.throws(() => parseSchematic(mutate(sampleSchematic())), (e) => e instanceof SchematicError && pattern.test(e.message));

test('the sample parses and round trips', () => {
  const parsed = parseSchematic(sampleSchematic());
  assert.equal(parsed.parts.length, 5);
  assert.deepEqual(parseSchematic(JSON.parse(JSON.stringify(parsed))), parsed);
});

test('parser rejects unknown keys, duplicates and dangling pins', () => {
  bad((s) => ({ ...s, source: './x.json' }), /payload\.source is not supported/);
  bad((s) => ({ ...s, parts: [...s.parts, { ...s.parts[0] }] }), /Duplicate part id/);
  bad((s) => ({ ...s, nets: [{ id: 'n1', label: '', pins: ['B1.p'] }] }), /at least two pins/);
  bad((s) => ({ ...s, nets: [{ id: 'n1', label: '', pins: ['B1.p', 'X9.a'] }] }), /does not name a part pin/);
  bad((s) => ({ ...s, nets: [{ id: 'n1', label: '', pins: ['B1.p', 'S1.z'] }] }), /no pin z/);
  bad((s) => ({ ...s, nets: [...s.nets, { id: 'n9', label: '', pins: ['B1.p', 'S1.b'] }] }), /already in net/);
  bad((s) => ({ ...s, width: 5 }), /width must be/);
  bad((s) => ({ ...s, parts: [{ ...s.parts[0], value: -1 }, ...s.parts.slice(1)] }), /positive number/);
  bad((s) => ({ ...s, parts: [{ ...s.parts[0], rotation: 45 }, ...s.parts.slice(1)] }), /rotation/);
  bad((s) => ({ ...s, parts: [{ ...s.parts[0], x: 9999 }, ...s.parts.slice(1)] }), /outside the drawing/);
  bad((s) => ({ ...s, parts: [{ ...s.parts[0], extra: 1 }, ...s.parts.slice(1)] }), /not supported/);
  bad(() => ({ width: 300, height: 200, parts: [], nets: [] }), /at least one part/);
});

test('rotation puts battery positive on top and LED anode on top', () => {
  const s = sampleSchematic();
  assert.deepEqual(pinPoint(s.parts[0], 'p'), { x: 80, y: 80 });
  assert.deepEqual(pinPoint(s.parts[0], 'n'), { x: 80, y: 160 });
  assert.deepEqual(pinPoint(s.parts[3], 'a'), { x: 400, y: 80 });
  assert.deepEqual(pinPoint(s.parts[3], 'b'), { x: 400, y: 160 });
});

test('an open switch carries no current and the LED stays dark', () => {
  const solution = solve(sampleSchematic());
  near(solution.currents.R1, 0, 1e-6);
  assert.equal(solution.lit.D1, false);
  near(solution.voltages.n1, 9, 1e-2);
  near(solution.voltages.n3, 0, 1e-2);
});

test('closing the switch drives the LED at the expected current', () => {
  const solution = solve(sampleSchematic(), { switches: { S1: true } });
  const expected = (9 - 2) / (330 + 20 + 0.1 + 0.01);
  near(solution.currents.R1, expected, 1e-4);
  near(solution.currents.D1, expected, 1e-4);
  near(solution.currents.B1, expected, 1e-4);
  assert.equal(solution.lit.D1, true);
  near(solution.voltages.n3, 2 + expected * 20, 0.02);
  near(solution.voltages.gnd, 0, 1e-6);
});

test('a battery that cannot reach the LED forward drop leaves it off', () => {
  const solution = solve(sampleSchematic(), { switches: { S1: true }, values: { B1: 1.5 } });
  assert.equal(solution.lit.D1, false);
  near(solution.currents.R1, 0, 1e-4);
});

test('a reversed LED blocks current', () => {
  const s = sampleSchematic();
  s.nets[2].pins = ['R1.b', 'D1.b'];
  s.nets[3].pins = ['B1.n', 'D1.a', 'G1.a'];
  const solution = solve(s, { switches: { S1: true } });
  assert.equal(solution.lit.D1, false);
  near(solution.currents.R1, 0, 1e-4);
});

test('a resistor divider splits the supply', () => {
  const s: Schematic = {
    width: 400,
    height: 240,
    parts: [
      { id: 'B1', kind: 'battery', x: 60, y: 120, rotation: 270, label: '', value: 10 },
      { id: 'R1', kind: 'resistor', x: 200, y: 60, rotation: 0, label: '', value: 1000 },
      { id: 'R2', kind: 'resistor', x: 280, y: 120, rotation: 90, label: '', value: 3000 },
      { id: 'G1', kind: 'ground', x: 200, y: 200, rotation: 0, label: '' }
    ],
    nets: [
      { id: 'in', label: '', pins: ['B1.p', 'R1.a'] },
      { id: 'mid', label: '', pins: ['R1.b', 'R2.a'] },
      { id: 'gnd', label: '', pins: ['B1.n', 'R2.b', 'G1.a'] }
    ]
  };
  const solution = solve(parseSchematic(s));
  near(solution.voltages.mid, 7.5, 0.02);
  near(solution.currents.R1, 0.0025, 1e-5);
});

test('circuits without ground and shorted batteries stay finite', () => {
  const floating = sampleSchematic();
  floating.parts = floating.parts.filter((p) => p.kind !== 'ground');
  floating.nets[3].pins = ['B1.n', 'D1.b'];
  const a = solve(floating, { switches: { S1: true } });
  assert.equal(a.hasGround, false);
  for (const v of Object.values(a.voltages)) assert.ok(Number.isFinite(v));
  const short: Schematic = {
    width: 300,
    height: 200,
    parts: [
      { id: 'B1', kind: 'battery', x: 100, y: 100, rotation: 0, label: '', value: 12 },
      { id: 'G1', kind: 'ground', x: 200, y: 100, rotation: 0, label: '' }
    ],
    nets: [
      { id: 'p', label: '', pins: ['B1.p', 'G1.a'] },
      { id: 'n', label: '', pins: ['B1.n', 'G1.a'] }
    ]
  };
  assert.throws(() => parseSchematic(short), SchematicError);
});

test('wires route along the root row and mark junctions', () => {
  const { wires: w, junctions } = wires(sampleSchematic());
  const gnd = w.filter((x) => x.net === 'gnd');
  assert.equal(gnd.length, 2);
  assert.deepEqual(gnd[1].points, [
    { x: 80, y: 160 },
    { x: 240, y: 160 },
    { x: 240, y: 200 }
  ]);
  assert.ok(junctions.some((p) => p.x === 240 && p.y === 160), 'T junction under the ground symbol');
});
