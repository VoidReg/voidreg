import assert from 'node:assert/strict';
import test from 'node:test';
import { compileDocument } from '../src/lib/authoring';
const block = (type: string, data: unknown) => ({
  id: '018fabc0-0000-4000-8000-000000000001',
  type: 'publisle:' + type,
  schemaVersion: 1,
  data
});
const doc = <T>(item: T) => ({ schemaVersion: 1, metadata: { language: 'en' }, blocks: [item] });
for (const engine of ['mermaid', 'graphviz', 'plantuml', 'wavedrom'])
  test(engine + ' keeps source without a reader engine or missing-renderer warning', () => {
    const result = compileDocument(
      doc(block('diagram', { engine, source: 'source', alt: 'A diagram' })),
      'Diagram'
    );
    assert.ok(result.artifact);
    assert.equal(result.artifact.islands.length, 0);
    assert.ok(!result.diagnostics.some((d) => d.code === 'missing-diagram-renderer'));
    assert.match(result.artifact.html, /source/);
  });
test('invalid block LaTeX is an error but its canonical draft remains available', () => {
  const input = doc(block('math', { value: '\\frac{1}{', display: true }));
  const result = compileDocument(input, 'Math');
  assert.ok(result.document);
  assert.equal(result.artifact, undefined);
  assert.ok(
    result.diagnostics.some(
      (d) => d.level === 'error' && d.code === 'invalid-math' && d.blockId === input.blocks[0].id
    )
  );
});
test('invalid inline LaTeX is rejected with its paragraph block ID', () => {
  const result = compileDocument(
    doc(block('paragraph', { content: [{ type: 'inlineMath', value: '\\invalidcommand' }] })),
    'Math'
  );
  assert.ok(result.document);
  assert.ok(result.diagnostics.some((d) => d.level === 'error' && d.code === 'invalid-math'));
});
test('valid fractions, radicals and aligned mathematics compile', () => {
  const result = compileDocument(
    doc(
      block('math', {
        value: '\\begin{aligned}x&=\\frac{1}{2}\\\\y&=\\sqrt{4}\\end{aligned}',
        display: true
      })
    ),
    'Math'
  );
  assert.ok(result.artifact);
  assert.ok(!result.diagnostics.some((d) => d.level === 'error'));
});
