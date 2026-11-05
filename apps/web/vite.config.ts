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
  build: { sourcemap: false, reportCompressedSize: false },
  plugins: [
    tailwindcss(),
    sveltekit({
      compilerOptions: {
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true
      },
      adapter: adapter()
    })
  ]
});
