// Helpers for the interactive block kit. A block is one folder in this directory:
//
//   <name>/block.ts     the block definition and its editor defaults (authoring side)
//   <name>/render.ts    how the compiler renders it (reader side, no editor code)
//   <name>/View.svelte  the interactive component readers see
//   <name>/Editor.svelte  optional editor for the payload (otherwise a form is built from the schema)
//   <name>/style.css      optional styles, also loaded for server-rendered output
//
// `pnpm new:block <name>` creates the folder and `pnpm blocks:generate` rebuilds the registries
// (authoring.ts, reader.ts, editors.ts, styles.css). Nothing else needs editing.
import type { defineInteractiveBlock } from '@publisle/block-sdk';

export type BlockDefinition = ReturnType<typeof defineInteractiveBlock>;

export interface FieldSpec {
  key: string;
  label: string;
  kind: 'text' | 'flow' | 'json';
}

/** What the document editor needs to offer the block in its insert menu and to create it. */
export interface BlockExtension {
  type: string;
  label: string;
  defaultData: () => Record<string, unknown>;
  fieldSpecs: FieldSpec[];
}

export function defineBlock<
  const T extends { definition: BlockDefinition; extension: BlockExtension }
>(block: T): T {
  if (block.definition.type !== block.extension.type)
    throw new Error(
      `Block definition "${block.definition.type}" and editor entry "${block.extension.type}" must use the same type.`
    );
  return block;
}

// The registry entry the publication compiler expects: one module, or an interactive module
// plus a static lowering for output that is rendered on the server.
export interface BlockRenderer {
  type: string;
  /** Key of the lazily loaded View.svelte implementation. */
  module: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entry:
    | { module: string }
    | { interactive: { module: string }; static: { module: string; lower: any } };
}

export function defineRenderer<const T extends BlockRenderer>(renderer: T): T {
  return renderer;
}

/** Props every Editor.svelte receives. `value` is the block payload. */
export interface EditorProps {
  value: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onchange: (next: any) => void;
}

export const text = (value: string) => [{ type: 'text', value }];
