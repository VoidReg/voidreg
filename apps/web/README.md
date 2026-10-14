# voidreg-blog

Personal Blog

## Sitemap

`pnpm build` generates `build/sitemap.xml` from SvelteKit's prerendered pages.
New pages are included automatically; redirects and the generated 404 fallback
are excluded. Pages with route parameters must provide prerender entries so
SvelteKit can build their concrete URLs.

The GitHub Pages workflow builds and uploads the site, including the sitemap
and `robots.txt`, on every push to `main`.

Submit `https://www.voidreg.xyz/sitemap.xml` to Google Search Console after
deployment. The hostname matches the site's existing redirect to `www`.
