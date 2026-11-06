import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockLabel, diffRevisions, wordDiff, type DocBlock } from './diff';

const para = (id: string, value: string): DocBlock => ({
  id,
  type: 'publisle:paragraph',
  schemaVersion: 1,
  data: { content: [{ type: 'text', value }] }
});
const entry = (blocks: DocBlock[], extra: Record<string, unknown> = {}) => ({
  title: 'T',
  tags: ['a'],
  document: { blocks },
  ...extra
});

test('identical revisions produce an empty diff', () => {
  const doc = [para('1', 'one'), para('2', 'two')];
  const diff = diffRevisions(entry(doc), entry(structuredClone(doc)));
  assert.equal(diff.identical, true);
  assert.equal(diff.unchanged, 2);
});

test('metadata changes list only the fields that differ', () => {
  const diff = diffRevisions(entry([]), entry([], { title: 'New', tags: ['a', 'b'], seo_title: 'S' }));
  assert.deepEqual(
    diff.fields.map((f) => f.field),
    ['title', 'tags', 'seo_title']
  );
  assert.equal(diff.blocks.length, 0);
});

test('added, removed and changed blocks are reported by id', () => {
  const diff = diffRevisions(
    entry([para('1', 'keep'), para('2', 'old text here'), para('3', 'gone')]),
    entry([para('1', 'keep'), para('2', 'new text here'), para('4', 'fresh')])
  );
  const kinds = Object.fromEntries(diff.blocks.map((b) => [b.id, b.kind]));
  assert.deepEqual(kinds, { '3': 'removed', '2': 'changed', '4': 'added' });
  assert.equal(diff.unchanged, 1);
  const changed = diff.blocks.find((b) => b.id === '2')!;
  assert.deepEqual(
    changed.words.map((w) => [w.op, w.text]),
    [
      ['del', 'old'],
      ['add', 'new'],
      ['same', 'text here']
    ]
  );
});

test('moving one block is a single move, not a pile of edits', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const before = ids.map((id) => para(id, id));
  const after = [before[1], before[2], before[3], before[4], before[0]];
  const diff = diffRevisions(entry(before), entry(after));
  assert.equal(diff.blocks.length, 1);
  assert.equal(diff.blocks[0].id, 'a');
  assert.equal(diff.blocks[0].kind, 'moved');
  assert.equal(diff.blocks[0].from, 0);
  assert.equal(diff.blocks[0].to, 4);
  assert.equal(diff.unchanged, 4);
});

test('an edited block that also moved is reported as changed with moved set', () => {
  const diff = diffRevisions(
    entry([para('a', 'first'), para('b', 'second'), para('c', 'third')]),
    entry([para('b', 'second'), para('c', 'third'), para('a', 'first edited')])
  );
  const a = diff.blocks.find((b) => b.id === 'a')!;
  assert.equal(a.kind, 'changed');
  assert.equal(a.moved, true);
});

test('key order does not make blocks look changed', () => {
  const left: DocBlock = { id: '1', type: 'x:y', data: { a: 1, b: { c: 2, d: 3 } } };
  const right: DocBlock = { id: '1', type: 'x:y', data: { b: { d: 3, c: 2 }, a: 1 } };
  assert.equal(diffRevisions(entry([left]), entry([right])).identical, true);
});

test('labels and word diffs stay bounded', () => {
  assert.match(blockLabel(para('1', 'x'.repeat(300))), /\u2026$/);
  const huge = Array.from({ length: 2000 }, (_, i) => 'w' + i).join(' ');
  assert.equal(wordDiff(huge, huge + ' extra').length, 2);
  assert.deepEqual(wordDiff('', ''), []);
});
