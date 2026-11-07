import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentToken,
  edge,
  filterChoices,
  replaceToken,
  sections,
  step,
  typeahead,
  type Choice
} from './listbox.ts';

const c = (label: string, extra: Partial<Choice> = {}): Choice => ({
  value: label,
  label,
  ...extra
});
const list = [c('Apple'), c('Avocado', { disabled: true }), c('Banana'), c('Apricot')];

test('step skips disabled options and only wraps when asked', () => {
  assert.equal(step(list, 0, 1), 2);
  assert.equal(step(list, 3, 1), 3);
  assert.equal(step(list, 3, 1, true), 0);
  assert.equal(step(list, 0, -1), 0);
  assert.equal(step(list, 0, -1, true), 3);
  assert.equal(step([], 0, 1), -1);
  assert.equal(step([c('x', { disabled: true })], -1, 1), -1);
});

test('edge finds the first and last enabled option', () => {
  assert.equal(edge(list, 'first'), 0);
  assert.equal(edge(list, 'last'), 3);
  assert.equal(edge([c('a', { disabled: true })], 'first'), -1);
});

test('typeahead matches prefixes and cycles on a repeated letter', () => {
  assert.equal(typeahead(list, 'b', 0), 2);
  assert.equal(typeahead(list, 'ap', 0), 0);
  assert.equal(typeahead(list, 'ap', 1), 3);
  assert.equal(typeahead(list, 'a', 0), 3);
  assert.equal(typeahead(list, 'a', 3), 0);
  assert.equal(typeahead(list, 'aa', 0), 3);
  assert.equal(typeahead(list, 'z', 0), -1);
  assert.equal(typeahead(list, '', 0), -1);
});

test('sections group consecutive options and keep absolute indexes', () => {
  const grouped = sections([c('a'), c('b', { group: 'G' }), c('c', { group: 'G' }), c('d')]);
  assert.deepEqual(
    grouped.map((s) => [s.label, s.items.map((i) => i.index)]),
    [
      ['', [0]],
      ['G', [1, 2]],
      ['', [3]]
    ]
  );
});

test('separator mode edits only the last token', () => {
  assert.equal(currentToken('r1, r2, led', ','), 'led');
  assert.equal(currentToken('led', ','), 'led');
  assert.equal(currentToken('led', undefined), 'led');
  assert.equal(replaceToken('r1, r2, le', 'led.a', ','), 'r1, r2, led.a');
  assert.equal(replaceToken('le', 'led.a', ','), 'led.a');
  assert.equal(replaceToken('anything', 'picked'), 'picked');
});

test('filter matches label, value and hint and is bounded', () => {
  const rows = [c('Alpha', { hint: 'first' }), { value: 'b-slug', label: 'Beta' }];
  assert.deepEqual(
    filterChoices(rows, 'FIRST').map((r) => r.label),
    ['Alpha']
  );
  assert.deepEqual(
    filterChoices(rows, 'b-sl').map((r) => r.label),
    ['Beta']
  );
  assert.equal(filterChoices(rows, '').length, 2);
  assert.equal(filterChoices(rows, '', 1).length, 1);
});
