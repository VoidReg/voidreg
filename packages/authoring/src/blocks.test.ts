import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileDocument } from './authoring';
import { blockDefinitions, extensions, registry } from './blocks';

// Every block in the kit must be usable the moment its folder exists: the editor offers it, its
// default data passes the block's own validation, and it compiles to a publication artifact.
for (const definition of blockDefinitions) {
  test(`${definition.type} is registered, insertable and compiles with its default data`, () => {
    const extension = (extensions.blocks ?? []).find((item) => item.type === definition.type);
    assert.ok(extension, 'the editor offers the block');
    assert.ok(registry.get(definition.type), 'the registry knows the block');
    const result = compileDocument(
      {
        schemaVersion: 1,
        metadata: { language: 'en' },
        blocks: [
          {
            id: '018fabc0-0000-4000-8000-000000000077',
            type: definition.type,
            schemaVersion: 1,
            data: extension.defaultData()
          }
        ]
      },
      'Kit check'
    );
    assert.deepEqual(
      result.diagnostics.filter((item) => item.level === 'error'),
      []
    );
    assert.equal(result.artifact?.islands.length, 1);
  });
}
