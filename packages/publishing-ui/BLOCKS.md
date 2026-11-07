# Interactive blocks

An interactive block is one folder in `src/blocks/<name>/`. Adding the folder is the only step:
the admin insert menu, the editor, the compiler and the reader all pick it up.

```sh
pnpm new:block my-widget            # scaffold with a generated settings form
pnpm new:block my-widget --editor   # also scaffold a custom Editor.svelte
pnpm blocks:generate                # rebuild the registries after adding or removing a folder
```

| File | Purpose |
| --- | --- |
| `block.ts` | Block definition (`payloadSchema`, validation) and the editor defaults. |
| `render.ts` | Registry entry for the compiler, with an optional static lowering. |
| `View.svelte` | The interactive component. It receives `payload`. |
| `Editor.svelte` | Optional. Without it the admin builds a form from `payloadSchema`. |
| `style.css` | Optional. Also loaded for server-rendered output. |

`authoring.ts`, `reader.ts`, `editors.ts` and `styles.css` in `src/blocks/` are generated; do not
edit them. `pnpm test` fails if they are out of date, if a block's types disagree, or if a block's
default data does not compile.

Stored data never names a module to import. Only components from these folders can activate, so a
payload cannot load code from a URL. Keep `networkAccess: false` unless a block truly needs more.
