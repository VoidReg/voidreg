import { interactiveSchematicDefinition } from '@publisle/blocks-technical';
import { createPlaygroundRegistry, type PlaygroundExtensions } from '@publisle/playground';
import { blockDefinitions, blockExtensions } from '@voidreg/publishing-ui/blocks/authoring';

// Interactive blocks live in packages/publishing-ui/src/blocks/<name>/ and are registered by
// `pnpm blocks:generate`. Only blocks that come from elsewhere are listed here.
const text = (value: string) => [{ type: 'text', value }];
export const extensions: PlaygroundExtensions = {
  blocks: [
    {
      type: 'publisle:footnote',
      label: 'Footnote',
      defaultData: () => ({
        identifier: 'note-1',
        children: [{ type: 'paragraph', content: text('Footnote text.') }]
      }),
      fieldSpecs: [
        { key: 'identifier', label: 'Identifier', kind: 'text' },
        { key: 'children', label: 'Text', kind: 'flow' }
      ]
    },
    ...blockExtensions
  ]
};
export const registry = createPlaygroundRegistry([
  interactiveSchematicDefinition,
  ...blockDefinitions
]);
export { blockDefinitions };
