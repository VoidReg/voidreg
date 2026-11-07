import { defineInteractiveBlock } from '@publisle/block-sdk';
import { parseFlowNodes, parseInlineNodes } from '@publisle/blocks-core';
import { SchemaParseError, type JsonValue } from '@publisle/schema';
import { defineBlock, text } from '../kit';
import { SchematicError, parseSchematic, type Schematic } from './model';
import { sampleSchematic } from './sample';

const definition = defineInteractiveBlock({
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

export default defineBlock({
  definition,
  extension: {
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
});
