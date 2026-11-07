import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { discover, generate } from '../../scripts/generate-blocks.mjs';

const dir = dirname(fileURLToPath(import.meta.url));

test('the generated registries match the block folders', () => {
  assert.deepEqual(generate({ check: true }), []);
});

test('every block folder is complete and consistent', async () => {
  const blocks = discover();
  assert.ok(blocks.length >= 2);
  const types = new Set<string>();
  for (const { name, editor } of blocks) {
    const block = (await import(join(dir, name, 'block.ts'))).default;
    const render = (await import(join(dir, name, 'render.ts'))).default;
    assert.match(block.definition.type, /^voidreg:[a-z0-9-]+$/, name);
    assert.equal(
      block.definition.type,
      block.extension.type,
      `${name}: definition and editor type`
    );
    assert.equal(render.type, block.definition.type, `${name}: renderer type`);
    assert.ok(!types.has(render.type), `${name}: duplicate type`);
    types.add(render.type);
    const entryModule =
      'module' in render.entry ? render.entry.module : render.entry.interactive.module;
    assert.equal(entryModule, render.module, `${name}: implementation module`);
    assert.equal(existsSync(join(dir, name, 'Editor.svelte')), editor);
  }
});

test('the reader registry exposes each block without loading its editor', async () => {
  const reader = await import('./reader.ts');
  for (const type of ['voidreg:counter', 'voidreg:schematic']) {
    assert.ok(type in reader.rendererRegistry, type);
    assert.equal(
      typeof reader.implementations[type as keyof typeof reader.implementations],
      'function'
    );
  }
});
