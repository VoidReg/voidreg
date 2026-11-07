import type { Schematic } from './model';

/** A battery, switch, resistor and LED loop. Used as the editor default and in tests. */
export const sampleSchematic = (): Schematic => ({
  width: 480,
  height: 240,
  parts: [
    { id: 'B1', kind: 'battery', x: 80, y: 120, rotation: 270, label: 'B1', value: 9 },
    { id: 'S1', kind: 'switch', x: 200, y: 80, rotation: 0, label: 'S1', closed: false },
    { id: 'R1', kind: 'resistor', x: 320, y: 80, rotation: 0, label: 'R1', value: 330 },
    { id: 'D1', kind: 'led', x: 400, y: 120, rotation: 90, label: 'D1' },
    { id: 'G1', kind: 'ground', x: 240, y: 200, rotation: 0, label: '' }
  ],
  nets: [
    { id: 'n1', label: 'Supply', pins: ['B1.p', 'S1.a'] },
    { id: 'n2', label: 'Switched', pins: ['S1.b', 'R1.a'] },
    { id: 'n3', label: 'LED anode', pins: ['R1.b', 'D1.a'] },
    { id: 'gnd', label: 'Ground', pins: ['B1.n', 'D1.b', 'G1.a'] }
  ]
});
