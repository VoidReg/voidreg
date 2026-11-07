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

## Search and LLM access

- Every page renders through `src/lib/Seo.svelte`, which owns the canonical URL (always the
  `www` host), Open Graph and Twitter tags, `robots`, and one JSON-LD graph built with
  `src/lib/seo.ts`. Filtered and search variants of list pages are `noindex,follow`.
- `/blog/<slug>.md` and `/projects/<slug>.md` serve clean Markdown with front matter. They send
  `Link: <html page>; rel="canonical"` so search engines index the HTML page only. Sending
  `Accept: text/markdown` to the normal URL returns the same Markdown (`src/hooks.server.ts`).
- `/llms.txt` is a map of the site: every project, then posts shared out between projects by a
  fair-share rule (`src/lib/server/llm-map.ts`), so one busy project cannot crowd out the rest.
  `/llms/<project>.txt` lists every post in a project and `/llms/<project>-full.txt` holds their
  text. `/llms-full.txt` is the text of the site in one document, the newest post of every
  project before the second newest of any, capped at about 1 MB. `/rss.xml` lists the latest 50
  posts. These and `/sitemap.xml` read only the API pages they need, are shared for five minutes
  (an expired copy is served while one refresh runs), and answer `If-None-Match` with 304. The
  text of a post is kept until its content hash changes, so a rebuild reads only edited posts.
- `/admin/`, `/preview/`, `/api/` and `/mcp` stay out of `robots.txt` crawling and carry
  `noindex` headers at nginx. The `.md` download at `/blog/<slug>/source.md` is unchanged.
- The apex and `api.` hosts redirect page requests to `www` in `deploy/nginx/default.conf`.
- Anonymous MCP access is documented in `apps/mcp/README.md`.

Development proxies `/api` to localhost:8080. `VOIDREG_API_PROXY` overrides that
target. Public reads use bounded memory caching and ETag revalidation; errors can
be retried. Comments render plain text and remain hidden until approved.
Configured OAuth providers arrive with `/api/v1/auth/session`.

## Commenter accounts

Signing in with GitHub or Google is optional; guests can still comment and wait for review.
One person is one profile (`profiles` and `identity_profiles` in `apps/api/src/db/profile.rs`):
a verified email shared by two providers joins them, and `/account` can connect or disconnect
providers explicitly. The profile owns the public display name and the show/hide photo choice.
Photos reach readers only through `/api/v1/avatars/<profile id>`, which fetches from GitHub or
Google server side (`AVATAR_HOSTS` adds test hosts), so providers never see who reads a post.

`src/lib/session.svelte.ts` holds the shared browser-only session used by the header
`AccountMenu`, the discussion and the `/account` page. `/account` is `noindex` and disallowed
in `robots.txt`. It offers display name, photo, connected accounts, sign out everywhere, a JSON
export and account deletion (comments become "Deleted user", or are removed on request).
Accounts under an active moderation block, and owner accounts, cannot delete or disconnect
themselves, so those actions cannot launder a block.

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
