# Publishing deployment

Build the admin static assets with `pnpm install --frozen-lockfile` and
`pnpm build`. Build the reader using `docker compose build web`; it is now a
Node SSR service, not a static nginx mount. nginx routes `/admin/` to static
admin assets, `/api/` and `/media/` to the API, and public pages to the reader.
The combined sitemap is `/sitemap.xml`; `/sitemap-blogs.xml` remains compatible.
Follow `CONTENT-MANAGEMENT.md` for database/media backups, coordinated rollout,
health checks, and rollback. The media-data volume must persist across updates.

The API container entrypoint runs the idempotent migration before starting the
service. Back up the database and configuration before replacing its image.
Use the same public
origin for the reader, admin, API proxy, and OAuth callbacks. Configure
`PUBLIC_BASE_URL` accordingly. The production nginx server names include
voidreg.xyz, www.voidreg.xyz, and api.voidreg.xyz; the installed certificate must
cover the names you actually serve. Provisioning DNS and certificates is separate
from these local configuration changes.

For local development, compose.override.yaml exposes nginx only on
127.0.0.1:8080. The API remains internal. nginx overwrites X-Forwarded-For;
never expose the API directly to untrusted clients when using forwarded-IP limits.
The API permits 7 MiB JSON requests and nginx matches that upload limit.

Production uses the API repository workflow to build and deploy a SHA-pinned
image. Deploy admin static assets and build the Node reader image alongside this
repository before recreating nginx. Reload nginx after replacing the API container so its upstream
address refreshes. Keep production backups under the ignored `backups/` directory.

OAuth callbacks still require Google/GitHub application credentials and an external
provider smoke test. Multiple API replicas do not share in-memory rate limits.

## MCP publishing service

`https://www.voidreg.xyz/mcp` serves Streamable HTTP for clients configured with
an Authorization bearer header. Both current and 2025-era clients are supported.
The Rust bridge under `/api/v1/mcp` is denied by public nginx routing; only the
MCP container calls it. Never expose the API container port publicly.

Sign in to admin with GitHub, open **MCP connections**, and create a named token.
Copy it once into the client's private configuration. Tokens expire after 30 days;
revocation and administrator allowlist changes take effect on subsequent requests.
Only hashes are stored. Article reading and draft writes are the fixed scopes.
Hosted OAuth connector setup is outside this version.

Build the MCP image on the server with `docker compose -f compose.yaml build mcp`,
then deploy it with `docker compose -f compose.yaml up -d --no-deps --wait mcp`.
Use `MCP_IMAGE_TAG` to identify the admin source commit used to build the image.
Reload nginx after the service is healthy. The container has CPU and memory limits,
no database mount, and runs as an unprivileged user with a read-only filesystem.
For local compose, its public origin is `http://localhost:8080`.

Article detail/card responses now include an integer `revision`. Admin updates,
publish, unpublish, and delete requests must include `expected_revision` in their
JSON body. A stale or missing revision returns 409. Deploy the API and rebuilt
admin together; cached old admin tabs must reload. On conflict the editor preserves
local content, pauses autosave, and offers JSON export and reload.

Back up the database before the additive `mcp_tokens` table and article revision
migration. Keep the previous image and static build for rollback; the added columns
can remain. Monitor service health, HTTP error counts, and 409 conflicts, without
logging bearer tokens or draft bodies. After deployment verify public bridge denial,
unauthenticated MCP 401 responses, token issuance/revocation, and a temporary draft
created and edited through an MCP client. Remove test drafts and revoke test tokens.

## Persistent production data

Production volumes are external and explicitly named: `voidreg_api-data`,
`voidreg_media-data`, and `voidreg_publishing-data`. Provision missing volumes
once with `docker volume create NAME`, separately from deployment. Never replace
an existing volume. Compose must fail if a production volume is missing rather
than silently start with an empty database. Local overrides use separate
`voidreg-local_*` volumes.

Deploy with `docker compose -f compose.yaml pull api` followed by
`docker compose -f compose.yaml up -d --no-deps --wait api`. This replaces the
container while preserving its data mounts. Do not run volume removal, volume
pruning, database resets, restore commands, or sample seeding during deployment.
External volumes survive Compose teardown, including `down --volumes`.
Keep `.env`, certificates, uploads, and backups outside build output cleanup.
Back up database and media together before schema changes; restore is a separate
operator action. API startup applies additive, idempotent migrations only.
Release builds reject `migrate --seed` before connecting to the database.
