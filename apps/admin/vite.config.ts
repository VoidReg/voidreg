import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

// @publisle/playground publishes dist/*.svelte files that import sibling "./x.ts"
// modules, but dist only contains the compiled "./x.js". Resolve those imports to the
// built output so the registry package works unmodified.
function publislePlaygroundDistImports(): Plugin {
  return {
    name: 'publisle-playground-dist-imports',
    enforce: 'pre',
    resolveId(source, importer, options) {
      if (!importer || !/\/playground\/dist\/[^/]+\.svelte$/.test(importer.split('?')[0]))
        return null;
      if (!/^\.\/[\w-]+\.ts$/.test(source)) return null;
      return this.resolve(source.replace(/\.ts$/, '.js'), importer, { ...options, skipSelf: true });
    }
  };
}
export default defineConfig({
  server: {
    proxy: {
      '/api': process.env.VOIDREG_API_PROXY ?? 'http://127.0.0.1:8080',
      '/media': process.env.VOIDREG_API_PROXY ?? 'http://127.0.0.1:8080'
    }
  },
  plugins: [
    publislePlaygroundDistImports(),
    tailwindcss(),
    sveltekit({
      alias: { $lib: 'src/lib' },
      adapter: adapter({ fallback: 'index.html' }),
      paths: { base: '/admin' }
    })
  ]
});
