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

## API-backed blog

`/blog` is a prerendered shell. `/blog/[slug]` loads published API content in the
browser, so newly published slugs need no rebuild. The static host must serve the
SPA fallback (`404.html`) with status 200 for `/blog/*`. voidreg-solution provides
this routing. Article metadata and JSON-LD update client-side; full server-rendered
SEO is outside the static-shell architecture. robots.txt also points to the live
API blog sitemap.

Development proxies `/api` to localhost:8080. `VOIDREG_API_PROXY` overrides that
target. Public reads use bounded memory caching and ETag revalidation; errors can
be retried. Comments render plain text and remain hidden until approved.
Configured OAuth providers are discovered from `/api/v1/auth/providers`.

PublisleArticle renders sanitized artifacts and activates only local host-approved
islands from `src/lib/publishing/renderers.ts`. Unknown implementations keep the
static alternative. Raw HTML scripts, iframe embeds, forms, and styles are removed
by the host sanitizer. Approved remote embeds should be added through an explicit
provider policy rather than generic iframe passthrough.

Publisle dependencies are packed locally. Build the sibling Publisle repo, run
`python3 scripts/refresh-publisle.py --source ../publisle`, then `pnpm install`,
`pnpm check`, and `pnpm build`. Commit the file dependency pins, tarballs, and
lockfile together. Preview components are shared with the admin via its refresh
script; keep that snapshot current when renderer behavior changes.

## Live blog and discussions

The home page and blog index share API-backed article previews with working
reader links, publication dates, and reading times. Unpublished placeholders
are removed. Loading, empty, and retry states reflect the live API.

Discussion threads have inline reply composers, replies to replies, separate
reply pagination, parent context, and permanent comment links. Logical reply
ancestry stays intact while replies use a compact visual indent on phones.
Drafts survive submission errors, and cancelling restores the reply button's
focus. Anonymous replies await moderation. Removed ancestors keep a content-free
placeholder when needed by approved descendants. OAuth returns to the article.
