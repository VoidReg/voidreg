# Deploying to production

Deployment is a local, manual operation. No CI workflow holds SSH credentials, and the
server's address, user and paths are not stored in this repository.

## One-time setup on your machine

Add the server to `~/.ssh/config` under an alias, then create the untracked file
`deploy/.env.deploy` (it matches the ignored `.env.*` pattern):

```sh
DEPLOY_HOST=<ssh alias>
DEPLOY_PATH=<absolute path of the checkout on the server>
```

The server needs Docker with Compose and `rsync` (`apt install rsync`).
The deploy user must be in the `docker` group.

## Deploy

Commit your work, then run from anywhere in the repository:

```sh
deploy/deploy.sh --dry-run          # print the plan, connect to nothing
deploy/deploy.sh                    # api web mcp publishing admin
deploy/deploy.sh web admin          # only some services
API_IMAGE_TAG=<commit sha> deploy/deploy.sh api   # pin the API image
```

The script refuses to run with uncommitted tracked changes. It exports the committed
`HEAD` with `git archive`, syncs it to `DEPLOY_PATH` with `rsync --delete`, and then on
the server:

- `api`: pulls `ghcr.io/voidreg/voidreg-site-api:$API_IMAGE_TAG` (CI publishes `latest` and a
  commit-SHA tag) and recreates the container.
- `web`, `mcp`, `publishing`: builds the image from the synced source and recreates the
  container, waiting for its health check.
- `admin`: builds the static files into `apps/admin/build`, which nginx serves at `/admin/`.
- Always last: recreates nginx (a reload would keep serving the old config, because the sync
  replaces the bind-mounted file) and tests its configuration.

The API image is published by CI to `ghcr.io/voidreg/voidreg-site-api`. New GHCR packages
start private: either make the package public in its settings, or run `docker login ghcr.io`
once on the server with a token that has `read:packages`.

## Server secrets (`deploy/.env`)

`deploy/.env` holds the production secrets. It is ignored by git, and the deploy sync never
touches it, so the server's copy is the source of truth. Keep a local copy in step with
`deploy/sync-env.sh`:

```sh
deploy/sync-env.sh status    # compare key names and values, prints no values
deploy/sync-env.sh pull      # server -> local
deploy/sync-env.sh push      # local -> server, after a timestamped backup on the server
```

Push does not restart anything. New values reach the containers on the next `deploy/deploy.sh`.
Server backups (`.env.bak-*`) are removed by the next deploy sync, so copy one aside first if
you need it.

## Data safety on every deploy

A redeploy never changes stored content:

- The database and uploads live in external Docker volumes (`voidreg_api-data`,
  `voidreg_media-data`), so `docker compose down` and image rebuilds cannot remove them. Never
  run `docker compose down -v` or `docker volume rm` on them.
- On start the API container runs `migrate`, which only creates missing tables and indexes and
  adds missing columns. It never drops, rewrites or reseeds rows. `api/tests/redeploy.rs` checks
  this by restarting and migrating a populated database repeatedly.
- Sample content is compiled only into debug builds. A release binary (the one in the image)
  refuses `migrate --seed`, so development data cannot reach production. The authoring scripts
  `seed:test-blog`, `seed:scale` and `stress:publishing` also refuse any non-local origin, and
  always refuse `voidreg.xyz`.
- `deploy.sh` with the `api` service runs `deploy/backup.sh` first and stops if the backup
  fails. It writes `backups/voidreg-<time>-data.tar.gz` and `-media.tar.gz` (newest 14 kept, set
  `BACKUP_KEEP` to change), then checks `/healthz` after the rollout and prints the previous API
  image id so a rollback is `API_IMAGE_TAG=<older sha> deploy/deploy.sh api`.

Server-only files are never touched by the sync: `deploy/.env`, `deploy/certs/`,
`deploy/certbot/`, `deploy/backups/`, `apps/api/.env` and `apps/admin/build/`.

## Contact form

Visitors write to you through the form on the About page. The destination address
(`CONTACT_TO_EMAIL`) exists only in the API environment, and nothing public can call the API's
contact routes: nginx answers 404 for `/api/v1/contact`, and the API itself returns 404 unless the
request carries `CONTACT_FORWARD_TOKEN`, which only the web container holds.

To enable it, set in `deploy/.env`:

- `RESEND_API_KEY`, `RESEND_DOMAIN` (a domain verified in Resend), `RESEND_FROM_USER`, and
  `CONTACT_TO_EMAIL`.
- `CONTACT_FORM_SECRET` and `CONTACT_FORWARD_TOKEN`, each from `openssl rand -hex 32`. With either
  empty the form shows as closed.

Spam protection is self-hosted: a signed form token that must be 3 seconds to 2 hours old, a
hidden honeypot field, validation (no header injection, at most two links), a limit of 3 messages
per hour and 8 per day per visitor and 100 per day site-wide, and silent dedupe of repeated
messages. Visitor addresses are stored only as salted hashes. Every accepted message is stored
before the email is sent, so a Resend outage loses nothing; `contact_attempts.outcome` records
`delivered`, `skipped` or `failed` for each. Replying to the email goes to the visitor.

## One-time migration from the four-repository layout

Compose lives in `deploy/` of the monorepo checkout now, so the server directory must be
the repository root. Before the first deploy, on the server:

1. Create the new directory (or reuse the old one after emptying it), and move the old
   solution repo's `.env`, `certs/`, `certbot/` and `backups/` into its `deploy/`.
2. Keep the external volumes (`voidreg_api-data`, `voidreg_media-data`,
   `voidreg_publishing-data`) as they are; compose references them by name.
3. Back up the database and publishing volume first (see [PUBLISHING.md](PUBLISHING.md)).
4. Stop the old stack only after `deploy/deploy.sh --dry-run` looks right, because both
   stacks use the same project name and published ports.
5. Add `COMPILER_TOKEN` (`openssl rand -hex 32`) to `deploy/.env`, create the
   `voidreg_media-data` and `voidreg_publishing-data` volumes, and expect a short outage:
   the backend network moves to a pinned subnet, so use `docker compose down` in the old
   directory, then `docker compose up -d --wait` in the new one (not per-service updates).
6. nginx also mounts `/etc/publisle-nginx` read-only for the `api.publisle.xyz` block.
   Publisle's own host sync owns that directory; do not edit it from this repo.
