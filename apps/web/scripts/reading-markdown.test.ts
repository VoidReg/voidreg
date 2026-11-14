import assert from 'node:assert/strict';
import test from 'node:test';
import { toMarkdown } from '@publisle/markdown';
import { readingDocument } from '@voidreg/publishing-ui/references';
import type { Document } from '@publisle/schema';

test('reading markdown keeps the schematic explanation and leaves out its payload and schema version', () => {
  const document = {
    schemaVersion: 1,
    metadata: {
      title: 'Circuit',
      language: 'en',
      extensions: { schematicVersion: 9, blob: 'y'.repeat(500) }
    },
    blocks: [
      {
        id: '018fabc0-0000-4000-8000-000000000010',
        type: 'voidreg:schematic',
        schemaVersion: 3,
        data: {
          activation: 'visible',
          payload: { width: 10, height: 10, parts: [{ id: 'R1', value: '330' }], nets: [{ pins: ['R1.a'] }] },
          accessibility: { label: 'LED circuit with a series resistor' },
          content: {
            fallback: [
              {
                type: 'paragraph',
                content: [{ type: 'text', value: 'With the switch closed about 20 milliamps flow.' }]
              }
            ]
          }
        }
      }
    ]
  } as unknown as Document;
  const result = toMarkdown(readingDocument(document), { policy: 'standard' });
  const markdown = result.markdown ?? '';
  assert.match(markdown, /LED circuit with a series resistor/);
  assert.match(markdown, /20 milliamps/);
  assert.doesNotMatch(markdown, /schemaVersion|publisle-payload|R1\.a|schematicVersion/);
  assert.doesNotMatch(markdown, /yyy/);
});
