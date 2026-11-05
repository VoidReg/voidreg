# Project and blog management

Projects and articles now have database-owned working copies and published
snapshots. The dashboard manages projects, articles, associations, metadata,
images, featured placement, ordering, and publication without site rebuilds.

## Storage and compatibility

The API uses `content_entries` for working/published JSON snapshots and revision
checks, `content_aliases` for permanently reserved URLs, and `media_assets` for
image metadata. Relationships reference immutable content IDs. Existing
`projects` and `articles` tables are retained as migration inputs for rollback;
they stop being the source of truth after migration. Repeated migrations never
overwrite managed entries or resurrect deleted content.

Existing project sections become Publisle documents. Existing public project
cards remain published. Existing article publication state and comment threads
are preserved. Comment storage keeps its immutable original discussion key,
which resolves through the article ID and aliases when the public URL changes.

Startup applies migrations but never seeds sample content. Seeding is an
explicit bootstrap command (`cargo migrate --seed`).

Autosave only updates a working copy. Publish/Update atomically replaces the
public snapshot, including metadata and project associations. Unpublish and
archive remove the snapshot from public reads. Restore returns an archived
entry to draft. Deleted URLs remain reserved. A project referenced by an
article cannot be permanently deleted until its associations are removed from
both working and published article versions.

## Hosting

`apps/web` now runs a SvelteKit Node server behind nginx. `VOIDREG_API_URL`
is its server-only API origin (Docker default: `http://api:8080`). The admin
remains a static application. The old GitHub Pages publishing workflow is
replaced by an explicitly triggered server-artifact build.

Compose stores uploaded PNG/JPEG files in the persistent `media-data` volume.
`MEDIA_PATH=/media` configures the API path. Image uploads are limited to 4 MiB
and dimensions of 1-16000 pixels. Metadata remains in Turso. Deleting referenced
media is blocked, including references from drafts and archived content.

The main sitemap is generated at `/sitemap.xml` from public content. The old
`/sitemap-blogs.xml` endpoint remains compatible. Raw Markdown and source views
are `noindex`; only published content is available. Readable Markdown may use
rich directives. The complete archival download retains block IDs, metadata,
dependencies, and custom payloads using Publisle's existing archival grammar.

## Local validation

From the individual repositories:

```sh
# API
cargo test
cargo clippy --all-targets --all-features -- -D warnings
# Reader
pnpm install --frozen-lockfile
pnpm lint
pnpm check
pnpm build
# Dashboard
pnpm install --frozen-lockfile
pnpm check
pnpm --filter voidreg-mcp check
pnpm --filter voidreg-mcp test
pnpm build
# Compose
 docker compose config --quiet
 docker compose build web
```

Local compose uses `http://localhost:8080`. Production uses the existing
`https://www.voidreg.xyz` origin. Credentials remain in the existing environment;
no new public credentials or OAuth providers are required.

## Production cutover and rollback

1. Enter a short maintenance window and stop publishing writes.
2. Back up the Turso database using the existing database backup procedure.
   Back up the API local database volume and the media volume together. Verify
   that the backup can be restored to an isolated database.
3. Build the API, dashboard, and Node reader from reviewed revisions. Run the
   migration twice against an isolated backup copy and compare existing content,
   publication state, and comment counts.
4. Deploy the API migration and new frontend services together. Update static
   admin assets, rebuild the web container, and reload nginx only after its
   configuration passes `nginx -t`.
5. Check `/healthz`, `/readyz`, a published article and project with JavaScript
   disabled, source downloads, sitemap URLs, sign-in, draft isolation, and
   Publish/Update behavior. Watch API/Node error logs and container health.
6. Resume publishing after the checks pass.

To roll back, stop writes, preserve a fresh copy of the current managed database
and images, restore the paired pre-cutover database/media backups, restore the
previous API/frontend images and nginx configuration, then repeat health checks.
Do not point the old API at the new managed database and assume it can read
post-migration edits: the retained legacy tables are intentionally unchanged.
Any content authored after cutover must be exported/reconciled before restoring
an older backup.

Scheduling and a revision-history browser are outside this version. Production
rollout is a separate operation; local implementation does not deploy services.
