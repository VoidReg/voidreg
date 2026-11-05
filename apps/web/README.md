# voidreg-blog

Personal Blog

## Server-rendered projects and blog

From the repository root run `pnpm install --frozen-lockfile`, `pnpm --filter voidreg-web check`, and `pnpm --filter voidreg-web build`. The output
is a SvelteKit Node server; start it with `node build` or build the supplied
Dockerfile. Set `VOIDREG_API_URL` to the server-only API origin and `ORIGIN` to
the public site origin. The site no longer deploys to GitHub Pages.

Home previews, project and blog indexes, and detail pages load database-backed
published snapshots on the server. Titles, canonical URLs, social metadata,
structured data, and article bodies are in the initial HTML. Publishing needs
no rebuild. Missing content returns 404; upstream failures return 503.

`/projects/[slug]` displays project details and paginated linked posts. Article
pages link to associated published projects and provide a Markdown source view,
readable download, and complete archival download. Source routes are noindex
and never expose working drafts. Old slugs redirect permanently.

`/sitemap.xml` is generated at request time from published projects/articles
and static public routes. Submit its canonical www URL to Search Console.
The manual workflow builds a Node artifact instead of deploying static Pages.

Development proxies `/api` to localhost:8080. `VOIDREG_API_PROXY` overrides that
target. Public reads use bounded memory caching and ETag revalidation; errors can
be retried. Comments render plain text and remain hidden until approved.
Configured OAuth providers are discovered from `/api/v1/auth/providers`.

PublisleArticle renders sanitized artifacts and activates only local host-approved
islands from `packages/publishing-ui/src/renderers.ts`. Unknown implementations keep the
static alternative. Raw HTML scripts, iframe embeds, forms, and styles are removed
by the host sanitizer. Approved remote embeds should be added through an explicit
provider policy rather than generic iframe passthrough.

Publisle packages come from the public npm registry; versions are declared once in
the `catalog:` section of the root `pnpm-workspace.yaml`. `PublisleArticle`, the
sanitizer and the renderer allowlist live in `packages/publishing-ui` and are shared
with the admin preview, so there is no copy to keep in sync.

## Live blog and discussions

The home page and blog index share API-backed article previews with working
reader links, publication dates, and reading times. Unpublished placeholders
are removed. Empty and error states reflect the live API.

Discussion threads have inline reply composers, replies to replies, separate
reply pagination and parent context. Logical reply
ancestry stays intact while replies use a compact visual indent on phones.
Drafts survive submission errors, and cancelling restores the reply button's
focus. Anonymous replies await moderation. Removed ancestors keep a content-free
placeholder when needed by approved descendants. OAuth returns to the article.
