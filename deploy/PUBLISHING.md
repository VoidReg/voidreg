# Publishing deployment

Build `voidreg-web` and `voidreg-admin` with `pnpm install --frozen-lockfile` and
`pnpm build` before starting compose. nginx mounts their static `build` directories
read-only at `/srv/web` and `/srv/admin`. Existing API routes retain `/api/v1`.
The admin app is available at `/admin/`, dynamic article shells at `/blog/*`, and
the live sitemap at `/sitemap-blogs.xml`. Static hashed assets cache immutably;
HTML revalidates and admin HTML uses no-store. gzip is enabled for text formats.

Run the API migration before the upgraded service starts. Use the same public
origin for the reader, admin, API proxy, and OAuth callbacks. Configure
`PUBLIC_BASE_URL` accordingly. The production nginx server names include
voidreg.xyz, www.voidreg.xyz, and api.voidreg.xyz; the installed certificate must
cover the names you actually serve. Provisioning DNS and certificates is separate
from these local configuration changes.

For local development, compose.override.yaml exposes nginx only on
127.0.0.1:8080. The API remains internal. nginx overwrites X-Forwarded-For;
never expose the API directly to untrusted clients when using forwarded-IP limits.
The API permits 7 MiB JSON requests and nginx matches that upload limit.

No live deployment or remote database migration was performed during implementation.
OAuth callbacks still require Google/GitHub application credentials and an external
provider smoke test. Multiple API replicas do not share in-memory rate limits.
