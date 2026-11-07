import { defineInteractiveBlock } from '@publisle/block-sdk';
import { parseFlowNodes, parseInlineNodes } from '@publisle/blocks-core';
import { SchemaParseError, type JsonValue } from '@publisle/schema';
import { defineBlock, text } from '../kit';

const definition = defineInteractiveBlock({
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

export default defineBlock({
  definition,
  extension: {
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
  }
});
