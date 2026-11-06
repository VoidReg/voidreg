import { defineInteractiveBlock } from '@publisle/block-sdk';
import { parseFlowNodes, parseInlineNodes } from '@publisle/blocks-core';
import { interactiveSchematicDefinition } from '@publisle/blocks-technical';
import { createPlaygroundRegistry, type PlaygroundExtensions } from '@publisle/playground';
import { SchemaParseError, type JsonValue } from '@publisle/schema';
import { SchematicError, parseSchematic, type Schematic } from '@voidreg/publishing-ui/schematic';
import { sampleSchematic } from '@voidreg/publishing-ui/schematic/sample';
export const counterDefinition = defineInteractiveBlock({
  type: 'voidreg:counter',
  schemaVersion: 1,
  descriptor: {
    displayName: 'Counter',
    description: 'A simple state and reset demonstration.',
    payloadSchema: {
      type: 'object',
      description: 'Counter configuration',
      properties: {
        initial: { type: 'number', description: 'Starting value' },
        step: { type: 'number', description: 'Amount added per action' }
      },
      required: ['initial', 'step']
    },
    capabilities: { staticRendering: false, networkAccess: false, hostServices: [] }
  },
  schema: {
    parse(value): { initial: number; step: number } {
      const input = value as Record<string, unknown>;
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        typeof input.initial !== 'number' ||
        typeof input.step !== 'number' ||
        !Number.isFinite(input.initial) ||
        !Number.isFinite(input.step)
      )
        throw new SchemaParseError(
          'invalid-block-data',
          'Counter initial and step must be finite numbers.'
        );
      return { initial: input.initial, step: input.step };
    }
  },
  content: {
    parseTitle: (value) => parseInlineNodes(value) as readonly JsonValue[],
    parseFlow: (value) => parseFlowNodes(value) as readonly JsonValue[]
  }
});
export const schematicDefinition = defineInteractiveBlock({
  type: 'voidreg:schematic',
  schemaVersion: 1,
  descriptor: {
    displayName: 'Interactive schematic',
    description:
      'A small circuit drawing with a live DC solver: switches toggle, values change, nets report voltage.',
    payloadSchema: {
      type: 'object',
      description: 'Drawing size, parts with positions and pin connections as nets.',
      properties: {
        width: { type: 'number', description: 'Drawing width in units (160 to 1200)' },
        height: { type: 'number', description: 'Drawing height in units (100 to 800)' },
        parts: {
          type: 'array',
          description:
            'Parts: battery, switch, resistor, capacitor, led, ground, junction or label, each with id, x, y and rotation'
        },
        nets: {
          type: 'array',
          description: 'Nets: id, label and the pins they join, such as R1.a and B1.p'
        }
      },
      required: ['width', 'height', 'parts', 'nets']
    },
    capabilities: { staticRendering: true, networkAccess: false, hostServices: [] }
  },
  schema: {
    parse(value): Schematic {
      try {
        return parseSchematic(value);
      } catch (error) {
        if (error instanceof SchematicError)
          throw new SchemaParseError('invalid-block-data', error.message);
        throw error;
      }
    }
  },
  content: {
    parseTitle: (value) => parseInlineNodes(value) as readonly JsonValue[],
    parseFlow: (value) => parseFlowNodes(value) as readonly JsonValue[]
  }
});
const text = (value: string) => [{ type: 'text', value }];
export const extensions: PlaygroundExtensions = {
  blocks: [
    {
      type: 'publisle:footnote',
      label: 'Footnote',
      defaultData: () => ({
        identifier: 'note-1',
        children: [{ type: 'paragraph', content: text('Footnote text.') }]
      }),
      fieldSpecs: [
        { key: 'identifier', label: 'Identifier', kind: 'text' },
        { key: 'children', label: 'Text', kind: 'flow' }
      ]
    },
    {
      type: 'voidreg:counter',
      label: 'Counter',
      defaultData: () => ({
        activation: 'interaction',
        payload: { initial: 0, step: 1 },
        content: {
          title: text('Counter demonstration'),
          purpose: [{ type: 'paragraph', content: text('Explore how an action changes state.') }],
          instructions: [
            {
              type: 'paragraph',
              content: text('Use Add to increase the count, or Reset to restore it.')
            }
          ],
          fallback: [
            {
              type: 'paragraph',
              content: text(
                'The counter begins at zero and advances by one each time Add is pressed.'
              )
            }
          ]
        }
      }),
      fieldSpecs: [
        { key: 'payload', label: 'Counter payload', kind: 'json' },
        { key: 'content', label: 'Explanation and fallback', kind: 'json' },
        { key: 'activation', label: 'Activation', kind: 'text' }
      ]
    },
    {
      type: 'voidreg:schematic',
      label: 'Interactive schematic',
      defaultData: () => ({
        activation: 'visible',
        payload: sampleSchematic() as unknown as JsonValue,
        accessibility: { label: 'LED circuit with a switch, resistor and battery' },
        content: {
          title: text('LED circuit'),
          purpose: [
            {
              type: 'paragraph',
              content: text('See how a series resistor sets the current through an LED.')
            }
          ],
          instructions: [
            {
              type: 'paragraph',
              content: text('Close the switch, then change the battery or resistor value.')
            }
          ],
          fallback: [
            {
              type: 'paragraph',
              content: text(
                'A 9 volt battery feeds a switch, a 330 ohm resistor and an LED in series. With the switch closed about 20 milliamps flow and the LED lights.'
              )
            }
          ]
        }
      }),
      fieldSpecs: [
        { key: 'payload', label: 'Schematic', kind: 'json' },
        { key: 'content', label: 'Explanation and fallback', kind: 'json' },
        { key: 'activation', label: 'Activation', kind: 'text' }
      ]
    }
  ]
};
export const registry = createPlaygroundRegistry([
  interactiveSchematicDefinition,
  counterDefinition,
  schematicDefinition
]);
