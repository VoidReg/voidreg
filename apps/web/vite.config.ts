import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { writeFile } from 'node:fs/promises';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const site = 'https://www.voidreg.xyz';
const output = 'build';
const staticAdapter = adapter({
  pages: output,
  assets: output,
  fallback: '404.html',
  strict: true
});

export default defineConfig({
  build: {
    sourcemap: false,
    reportCompressedSize: false
  },
  plugins: [
    tailwindcss(),
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true
      },
      adapter: {
        ...staticAdapter,
        async adapt(builder) {
          await staticAdapter.adapt(builder);

          const urls = [...builder.prerendered.pages.keys()].sort().map((pathname) => {
            const url = new URL(pathname, site);
            if (url.origin !== site) throw new Error(`Unexpected sitemap origin: ${url.href}`);
            const location = url.href.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
            return `  <url><loc>${location}</loc></url>`;
          });
          if (urls.length === 0) throw new Error('Cannot generate an empty sitemap');

          await writeFile(
            `${output}/sitemap.xml`,
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
              urls.join('\n') +
              '\n</urlset>\n'
          );
          builder.log(`Generated sitemap.xml with ${urls.length} pages`);
        }
      }
    })
  ]
});
