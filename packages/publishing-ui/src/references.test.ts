import assert from 'node:assert/strict';
import test from 'node:test';
import type { Document } from '@publisle/schema';
import {
  formatCitation,
  formatReference,
  leanMetadata,
  readingDocument,
  referenceNumbers,
  referenceRender
} from './references.ts';

const cited = {
  schemaVersion: 1,
  metadata: {
    title: 'A note',
    language: 'en',
    description: 'Short',
    identifiers: { doi: '10.0000/hidden' },
    extensions: { payload: { huge: true } }
  },
  blocks: [
    {
      id: '018fabc0-0000-4000-8000-000000000001',
      type: 'publisle:paragraph',
      schemaVersion: 1,
      data: {
        content: [
          { type: 'text', value: 'See ' },
          { type: 'citationReference', items: [{ id: 'nova' }] },
          { type: 'text', value: '.' }
        ]
      }
    },
    {
      id: '018fabc0-0000-4000-8000-000000000002',
      type: 'publisle:bibliography',
      schemaVersion: 1,
      data: {
        entries: [
          {
            id: 'nova',
            authors: ['xevrion'],
            issued: '2026',
            title: 'Nova',
            url: 'https://github.com/xevrion/nova'
          },
          { id: 'later', title: 'Unread' }
        ]
      }
    }
  ]
} as unknown as Document;

test('citations are numbered in first-appearance order and the rest of the list follows', () => {
  const numbers = referenceNumbers(cited);
  assert.equal(numbers.get('nova'), 1);
  assert.equal(numbers.get('later'), 2);
  assert.equal(formatCitation([{ id: 'nova' }, { id: 'later', locator: 'p. 2' }], numbers), '[1; 2, p. 2]');
  assert.match(formatReference({ id: 'nova', authors: ['xevrion'], title: 'Nova', url: 'https://github.com/xevrion/nova' }, 1), /^1\. xevrion\. Nova\. https:\/\/github.com\/xevrion\/nova$/);
});

test('the compiler receives bracketed citations and readable reference lines', () => {
  const rendered = referenceRender(cited);
  assert.equal(Object.values(rendered.citations ?? {})[0], '[1]');
  assert.equal(rendered.bibliography?.[0].id, 'nova');
  assert.match(rendered.bibliography?.[0].text ?? '', /xevrion/);
  assert.match(rendered.bibliography?.[1].text ?? '', /^2\. Unread\./);
});

test('the reading document keeps prose and drops extension metadata and citation machinery', () => {
  const schematic = {
    schemaVersion: 1,
    metadata: cited.metadata,
    blocks: [
      {
        id: '018fabc0-0000-4000-8000-000000000003',
        type: 'voidreg:schematic',
        schemaVersion: 4,
        data: {
          activation: 'visible',
          payload: { parts: [{ id: 'R1', kind: 'resistor', secret: 'x'.repeat(200) }], nets: [] },
          accessibility: { label: 'Series resistor and LED' },
          content: {
            fallback: [{ type: 'paragraph', content: [{ type: 'text', value: 'About 20 milliamps flow.' }] }]
          }
        }
      }
    ]
  } as unknown as Document;
  const reading = readingDocument(schematic);
  assert.equal(reading.metadata?.extensions, undefined);
  assert.equal(reading.metadata?.identifiers, undefined);
  assert.equal(reading.metadata?.title, 'A note');
  assert.equal(leanMetadata(schematic.metadata)?.language, 'en');
  const prose = readingDocument(cited);
  assert.equal(prose.blocks.some((block) => block.type === 'publisle:bibliography'), false);
  assert.match(JSON.stringify(prose.blocks[0]), /\[1\]/);
  assert.doesNotMatch(JSON.stringify(prose.blocks), /citationReference/);
  const exported = JSON.stringify(reading.blocks);
  assert.match(exported, /About 20 milliamps flow/);
  assert.match(exported, /Series resistor and LED/);
});
