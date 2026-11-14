import assert from 'node:assert/strict';
import test from 'node:test';
import type { Document } from '@publisle/schema';
import { archivalMarkdown, readingMarkdown } from './authoring.ts';

const secret = 'schematic-payload-token-9f3c';

const document = {
  schemaVersion: 1,
  metadata: {
    title: 'Circuit',
    language: 'en',
    extensions: { schematicVersion: 9 }
  },
  blocks: [
    {
      id: '018fabc0-0000-4000-8000-000000000010',
      type: 'voidreg:schematic',
      schemaVersion: 3,
      data: {
        activation: 'visible',
        payload: { width: 10, height: 10, parts: [{ id: 'R1', value: secret }], nets: [] },
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

test('the editor Markdown export describes a schematic and leaves out its payload', () => {
  const reading = readingMarkdown(document);
  const markdown = reading.markdown ?? '';
  assert.deepEqual(
    reading.diagnostics.filter((item) => item.level === 'error'),
    []
  );
  assert.match(markdown, /LED circuit with a series resistor/);
  assert.match(markdown, /20 milliamps/);
  assert.doesNotMatch(markdown, new RegExp(secret));
  assert.doesNotMatch(markdown, /schemaVersion|schematicVersion/);
  const archival = archivalMarkdown(document).markdown ?? '';
  assert.match(archival, new RegExp(secret));
  assert.match(archival, /schemaVersion/);
});
