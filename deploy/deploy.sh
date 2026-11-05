#!/usr/bin/env bash
# Deploy the committed HEAD to the production server over SSH, from this machine.
#
# Deployment is deliberately local: no CI job holds SSH access, and the host,
# user and paths never appear in this repository. Configure them in your own
# SSH config and in the untracked file deploy/.env.deploy:
#
#   DEPLOY_HOST=<ssh alias or user@host>
#   DEPLOY_PATH=<absolute path of the checkout on the server>
#
# Usage:
#   deploy/deploy.sh [--dry-run] [service ...]
#   services: api web mcp publishing admin   (default: all)
#
# API_IMAGE_TAG pins the API image from GHCR (default: latest), for example
#   API_IMAGE_TAG=<commit sha> deploy/deploy.sh api
set -euo pipefail

root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$root"
[ -f deploy/.env.deploy ] && . deploy/.env.deploy

dry_run=0
services=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    api|web|mcp|publishing|admin) services+=("$arg") ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done
[ ${#services[@]} -gt 0 ] || services=(api web mcp publishing admin)

: "${DEPLOY_HOST:?Set DEPLOY_HOST (ssh alias) in deploy/.env.deploy or the environment}"
: "${DEPLOY_PATH:?Set DEPLOY_PATH (remote checkout directory) in deploy/.env.deploy or the environment}"
api_tag="${API_IMAGE_TAG:-latest}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to deploy: tracked files have uncommitted changes. Commit first." >&2
  exit 1
fi
commit="$(git rev-parse --short HEAD)"

# Paths that exist only on the server and must survive a sync.
excludes=(
  --exclude=/deploy/.env
  --exclude=/deploy/certs/
  --exclude=/deploy/certbot/
  --exclude=/deploy/backups/
  --exclude=/apps/api/.env
  --exclude=/apps/admin/build/
  --exclude=node_modules/
)

# Remote steps, assembled from the requested services.
remote=$'set -euo pipefail\ncd '"$(printf %q "$DEPLOY_PATH")"$'/deploy\n'
remote+="export API_IMAGE_TAG=$(printf %q "$api_tag") MCP_IMAGE_TAG=$commit PUBLISHING_IMAGE_TAG=$commit WEB_IMAGE_TAG=$commit"$'\n'
for service in "${services[@]}"; do
  case "$service" in
    api)
      remote+=$'docker compose -f compose.yaml pull api\n'
      remote+=$'docker compose -f compose.yaml up -d --no-deps --wait api\n' ;;
    web|mcp|publishing)
      remote+="docker compose -f compose.yaml build $service"$'\n'
      remote+="docker compose -f compose.yaml up -d --no-deps --wait $service"$'\n' ;;
    admin)
      remote+=$'(cd .. && rm -rf apps/admin/build && docker build -f apps/admin/Dockerfile --target export --output type=local,dest=apps/admin/build .)\n' ;;
  esac
done
# The API container address can change; nginx must re-resolve upstreams.
remote+=$'docker compose -f compose.yaml up -d --no-deps nginx\n'
remote+=$'docker compose -f compose.yaml exec -T nginx nginx -t\n'
remote+=$'docker compose -f compose.yaml exec -T nginx nginx -s reload\n'
remote+=$'docker compose -f compose.yaml ps\n'

echo "Deploying $commit (${services[*]}) to $DEPLOY_HOST, API image tag: $api_tag"
if [ "$dry_run" -eq 1 ]; then
  echo "--- dry run: would sync the committed tree, then run on the server:"
  printf '%s\n' "$remote"
  exit 0
fi

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
git archive HEAD | tar -x -C "$stage"
rsync -az --delete "${excludes[@]}" "$stage"/ "$DEPLOY_HOST:$DEPLOY_PATH/"
ssh "$DEPLOY_HOST" bash -s <<<"$remote"
echo "Done: $commit"
