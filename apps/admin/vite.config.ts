import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
export default defineConfig({
  // Packed playground dist/BlockEditor.svelte still imports ./index.ts.
  resolve: {
    alias: {
      '@publisle/playground/BlockEditor.svelte': fileURLToPath(
        new URL('./node_modules/@publisle/playground/src/BlockEditor.svelte', import.meta.url)
      )
    }
  },
  server: { proxy: { '/api': process.env.VOIDREG_API_PROXY ?? 'http://127.0.0.1:8080' } },
  plugins: [
    tailwindcss(),
    sveltekit({ adapter: adapter({ fallback: 'index.html' }), paths: { base: '/admin' } })
  ]
});
