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
- Always last: recreates nginx so upstream addresses refresh, tests its configuration and
  reloads it.

The API image is published by CI to `ghcr.io/voidreg/voidreg-site-api`. New GHCR packages
start private: either make the package public in its settings, or run `docker login ghcr.io`
once on the server with a token that has `read:packages`.

Server-only files are never touched by the sync: `deploy/.env`, `deploy/certs/`,
`deploy/certbot/`, `deploy/backups/`, `apps/api/.env` and `apps/admin/build/`.

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
