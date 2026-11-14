import assert from 'node:assert/strict';
import test from 'node:test';
import { headingSlug, nestHeadings, outlineFromReadings, tocCount } from './article-toc.ts';

test('a heading slug keeps words and drops punctuation', () => {
  assert.equal(headingSlug('What I wanted to know'), 'what-i-wanted-to-know');
  assert.equal(headingSlug("What's the API?"), 'whats-the-api');
  assert.equal(headingSlug('   '), 'section');
});

test('duplicate headings get a numeric suffix and existing ids stay reserved', () => {
  const { outline, assigned } = outlineFromReadings([
    { level: 2, text: 'Frame', id: 'frame' },
    { level: 2, text: 'Frame', id: '' },
    { level: 2, text: 'Frame', id: '' }
  ]);
  assert.deepEqual(assigned, ['frame', 'frame-2', 'frame-3']);
  assert.deepEqual(
    outline.map((entry) => entry.id),
    ['frame', 'frame-2', 'frame-3']
  );
});

test('deeper headings nest under the previous shallower one', () => {
  const { outline } = outlineFromReadings([
    { level: 2, text: 'One frame', id: '' },
    { level: 3, text: 'The barrier', id: '' },
    { level: 4, text: 'The source stage', id: '' },
    { level: 3, text: 'The graph', id: '' },
    { level: 2, text: 'The experiment', id: '' }
  ]);
  assert.equal(tocCount(outline), 5);
  assert.deepEqual(
    outline.map((entry) => entry.text),
    ['One frame', 'The experiment']
  );
  assert.deepEqual(
    outline[0].children.map((entry) => entry.text),
    ['The barrier', 'The graph']
  );
  assert.deepEqual(
    outline[0].children[0].children.map((entry) => entry.text),
    ['The source stage']
  );
});

test('a heading before any section stays at the top level', () => {
  const { outline } = outlineFromReadings([
    { level: 3, text: 'Earlier note', id: '' },
    { level: 2, text: 'Section', id: '' }
  ]);
  assert.equal(outline.length, 2);
  assert.equal(outline[0].level, 3);
  assert.deepEqual(outline[1].children, []);
});

test('the page title, blank headings, and headings inside skipped levels are left out', () => {
  const { assigned } = outlineFromReadings([
    { level: 1, text: 'Title', id: '' },
    { level: 2, text: '   ', id: '' },
    { level: 5, text: 'Too deep', id: '' },
    { level: 2, text: 'Kept', id: 'kept' }
  ]);
  assert.deepEqual(assigned, [null, null, null, 'kept']);
});

test('nesting does not attach a heading to a later sibling', () => {
  const outline = nestHeadings([
    { level: 2, text: 'A', id: 'a' },
    { level: 2, text: 'B', id: 'b' },
    { level: 3, text: 'B1', id: 'b1' }
  ]);
  assert.deepEqual(outline[0].children, []);
  assert.equal(outline[1].children[0].id, 'b1');
});
