import type { Config } from 'prettier';
import type { PluginOptions } from 'prettier-plugin-tailwindcss';

const config: Config & PluginOptions = {
  useTabs: false,
  singleQuote: true,
  trailingComma: 'none',
  printWidth: 100,
  plugins: ['prettier-plugin-svelte', 'prettier-plugin-tailwindcss'],
  overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }],
  tailwindStylesheet: './src/app.css'
};

export default config;
