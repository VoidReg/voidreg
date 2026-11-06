import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileDocument } from './authoring';
import { extensions } from './blocks';

const defaults = () =>
  (extensions.blocks ?? []).find((b) => b.type === 'voidreg:schematic')!.defaultData() as Record<
    string,
    unknown
  >;
const doc = (data: unknown) => ({
  schemaVersion: 1,
  metadata: { language: 'en' },
  blocks: [{ id: '018fabc0-0000-4000-8000-000000000042', type: 'voidreg:schematic', schemaVersion: 1, data }]
});

test('the default schematic compiles to an island with a static SVG frame', () => {
  const result = compileDocument(doc(defaults()), 'Schematic');
  assert.deepEqual(result.diagnostics.filter((d) => d.level === 'error'), []);
  const artifact = result.artifact!;
  assert.equal(artifact.islands.length, 1);
  assert.equal(artifact.islands[0].implementation, 'voidreg:schematic');
  assert.deepEqual(artifact.modules, [{ id: 'voidreg:schematic' }]);
  assert.match(artifact.html, /<svg[^>]+class="schematic-figure"/);
  assert.match(artifact.html, /schematic-wire/);
  assert.match(artifact.html, /aria-label="LED circuit with a switch/);
  assert.ok(!/<script/i.test(artifact.html));
});

test('a dangling pin is a validation error that blocks the artifact', () => {
  const data = defaults();
  const payload = structuredClone(data.payload) as { nets: { pins: string[] }[] };
  payload.nets[0].pins = ['B1.p', 'Z9.a'];
  const result = compileDocument(doc({ ...data, payload }), 'Schematic');
  assert.equal(result.artifact, undefined);
  assert.ok(result.diagnostics.some((d) => d.level === 'error' && /Z9\.a/.test(d.message)));
});

test('unknown payload keys are refused so a source URL can never be smuggled in', () => {
  const data = defaults();
  const result = compileDocument(
    doc({ ...data, payload: { ...(data.payload as object), source: 'https://example.com/x.json' } }),
    'Schematic'
  );
  assert.equal(result.artifact, undefined);
});

test('without readable fallback prose the publication profile rejects the block', () => {
  const data = defaults();
  const content = { ...(data.content as Record<string, unknown>) };
  delete content.fallback;
  const result = compileDocument(doc({ ...data, content }), 'Schematic');
  assert.equal(result.artifact, undefined);
  assert.ok(result.diagnostics.some((d) => d.level === 'error'));
});
