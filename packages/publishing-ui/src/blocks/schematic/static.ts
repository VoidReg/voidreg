import type { RenderNode } from '@publisle/adapter-core';
import {
  PINS,
  labelPlacement,
  parseSchematic,
  partTransform,
  symbol,
  wires,
  type Prim,
  type Schematic
} from './model';

type Attr = Record<string, string | number | boolean>;
const el = (tag: string, attributes: Attr, children: RenderNode[] = []): RenderNode => ({
  kind: 'element',
  tag,
  attributes,
  children
});
const txt = (value: string): RenderNode => ({ kind: 'text', value });

function prim(p: Prim): RenderNode {
  const cls: Attr = p.cls ? { class: `schematic-${p.cls}` } : {};
  switch (p.t) {
    case 'line':
      return el('line', { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, ...cls });
    case 'circle':
      return el('circle', { cx: p.cx, cy: p.cy, r: p.r, ...cls });
    case 'poly':
      return el(p.closed ? 'polygon' : 'polyline', { points: p.points, ...cls });
    default:
      return el('text', { x: p.x, y: p.y, ...cls }, [txt(p.text)]);
  }
}

export function describeSchematic(s: Schematic): string {
  const names = s.parts.filter((p) => p.kind !== 'label' && p.kind !== 'junction' && p.kind !== 'ground');
  return `Schematic with ${names.length} parts: ${names.map((p) => p.label || p.id).join(', ')}.`;
}

/** Static SVG for the compiled artifact: print, no JavaScript, and the pre-hydration frame. */
export function schematicNodes(s: Schematic, label: string): RenderNode[] {
  const { wires: runs, junctions } = wires(s);
  const children: RenderNode[] = [
    el('title', {}, [txt(label)]),
    ...runs.map((w) =>
      el('polyline', {
        class: 'schematic-wire',
        points: w.points.map((p) => `${p.x},${p.y}`).join(' ')
      })
    ),
    ...junctions.map((p) => el('circle', { class: 'schematic-dot', cx: p.x, cy: p.y, r: 3.5 })),
    ...s.parts.map((part) => {
      const place = labelPlacement(part);
      const text = part.label;
      return el('g', { class: `schematic-part schematic-${part.kind}` }, [
        el('g', { transform: partTransform(part) }, symbol(part).map(prim)),
        ...(text
          ? [
              el(
                'text',
                {
                  class: 'schematic-text',
                  x: place.x,
                  y: place.y,
                  'text-anchor': place.anchor
                },
                [txt(text)]
              )
            ]
          : [])
      ]);
    })
  ];
  return [
    el(
      'svg',
      {
        class: 'schematic-figure',
        viewBox: `0 0 ${s.width} ${s.height}`,
        width: s.width,
        height: s.height,
        role: 'img',
        'aria-label': label,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      },
      children
    )
  ];
}

export function lowerSchematic(input: {
  payload: unknown;
  accessibility?: { label?: string };
}): RenderNode[] {
  try {
    const schematic = parseSchematic(input.payload);
    return schematicNodes(schematic, input.accessibility?.label || describeSchematic(schematic));
  } catch {
    return [];
  }
}

export const schematicPinCount = (s: Schematic) => s.parts.reduce((n, p) => n + PINS[p.kind].length, 0);
