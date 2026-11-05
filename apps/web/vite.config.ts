import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': process.env.VOIDREG_API_PROXY ?? 'http://127.0.0.1:8080',
      '/media': process.env.VOIDREG_API_PROXY ?? 'http://127.0.0.1:8080'
    }
  },
  // Keep jsdom-backed DOMPurify out of the server bundle; it needs its own node_modules.
  ssr: { external: ['isomorphic-dompurify'] },
  build: { sourcemap: false, reportCompressedSize: false },
  plugins: [
    tailwindcss(),
    sveltekit({
      alias: { $lib: 'src/lib' },
      compilerOptions: {
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true
      },
      adapter: adapter()
    })
  ]
});
