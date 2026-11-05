// Only host-reviewed local components can activate. Stored module URLs are never imported.
export const implementations = {
  'voidreg:counter': () => import('./Counter.svelte')
};
export const rendererRegistry = {
  'voidreg:counter': { module: 'voidreg:counter' }
};
