import { lowerSchematic } from './schematic/static';

// Only host-reviewed local components can activate. Stored module URLs are never imported.
export const implementations = {
  'voidreg:counter': () => import('./Counter.svelte'),
  'voidreg:schematic': () => import('./Schematic.svelte')
};
export const rendererRegistry = {
  'voidreg:counter': { module: 'voidreg:counter' },
  'voidreg:schematic': {
    interactive: { module: 'voidreg:schematic' },
    static: { module: 'voidreg:schematic-static', lower: lowerSchematic }
  }
};
