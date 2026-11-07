#!/usr/bin/env node
// Scaffolds an interactive block: pnpm new:block <name> [--editor]
//
// Creates src/blocks/<name>/ with a working definition, renderer and view, then regenerates the
// registries. The block appears in the admin insert menu and renders for readers immediately.
// Pass --editor to also create an Editor.svelte; without it the admin builds a form from the schema.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './generate-blocks.mjs';

const args = process.argv.slice(2);
const name = args.find((arg) => !arg.startsWith('--'));
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('Usage: pnpm new:block <name> [--editor]   (lower-case letters, digits, hyphens)');
  process.exit(2);
}
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'blocks', name);
if (existsSync(dir)) {
  console.error(`src/blocks/${name} already exists.`);
  process.exit(1);
}
const type = `voidreg:${name}`;
const label = name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
mkdirSync(dir, { recursive: true });
const write = (file, content) => writeFileSync(join(dir, file), content);

write(
  'block.ts',
  `import { defineInteractiveBlock } from '@publisle/block-sdk';
import { parseFlowNodes, parseInlineNodes } from '@publisle/blocks-core';
import { SchemaParseError, type JsonValue } from '@publisle/schema';
import { defineBlock, text } from '../kit';

// The payload is the data your View.svelte receives. Describe it in payloadSchema (the admin
// builds a form from it) and validate it in parse().
interface Payload {
  title: string;
}

const definition = defineInteractiveBlock({
  type: '${type}',
  schemaVersion: 1,
  descriptor: {
    displayName: '${label}',
    description: 'Describe what readers can do with this block.',
    payloadSchema: {
      type: 'object',
      description: '${label} settings',
      properties: {
        title: { type: 'string', description: 'Heading shown above the block' }
      },
      required: ['title']
    },
    capabilities: { staticRendering: false, networkAccess: false, hostServices: [] }
  },
  schema: {
    parse(value): Payload {
      const input = value as Record<string, unknown>;
      if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.title !== 'string')
        throw new SchemaParseError('invalid-block-data', '${label} needs a text title.');
      return { title: input.title };
    }
  },
  content: {
    parseTitle: (value) => parseInlineNodes(value) as readonly JsonValue[],
    parseFlow: (value) => parseFlowNodes(value) as readonly JsonValue[]
  }
});

export default defineBlock({
  definition,
  extension: {
    type: '${type}',
    label: '${label}',
    defaultData: () => ({
      activation: 'interaction',
      payload: { title: '${label}' },
      content: {
        title: text('${label}'),
        purpose: [{ type: 'paragraph', content: text('Say what this block shows.') }],
        instructions: [{ type: 'paragraph', content: text('Say how to use it.') }],
        fallback: [{ type: 'paragraph', content: text('Describe the result for readers without scripts.') }]
      }
    }),
    fieldSpecs: [
      { key: 'payload', label: '${label} settings', kind: 'json' },
      { key: 'content', label: 'Explanation and fallback', kind: 'json' },
      { key: 'activation', label: 'Activation', kind: 'text' }
    ]
  }
});
`
);
write(
  'render.ts',
  `import { defineRenderer } from '../kit';

export default defineRenderer({
  type: '${type}',
  module: '${type}',
  entry: { module: '${type}' }
});
`
);
write(
  'View.svelte',
  `<script lang="ts">
  let { payload }: { payload: { title: string } } = $props();
  let presses = $state(0);
</script>

<div class="section-stack" aria-label={payload.title}>
  <p role="status">{payload.title}: pressed {presses} times</p>
  <button class="button" onclick={() => (presses += 1)}>Press</button>
</div>
`
);
if (args.includes('--editor'))
  write(
    'Editor.svelte',
    `<script lang="ts">
  import type { EditorProps } from '../kit';
  let { value, onchange }: EditorProps = $props();
</script>

<fieldset class="publishing-form">
  <legend>${label} settings</legend>
  <label
    >Title<input
      value={String(value.title ?? '')}
      oninput={(event) => onchange({ ...value, title: event.currentTarget.value })}
    /></label
  >
</fieldset>
`
  );
generate();
console.log(
  `Created src/blocks/${name}. Edit block.ts, render.ts and View.svelte, then run the tests.`
);
