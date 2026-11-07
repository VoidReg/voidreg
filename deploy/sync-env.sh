#!/usr/bin/env bash
# Keep the local deploy/.env in step with the server's. The file holds secrets and is never in
# git; deploy.sh never syncs it. The server copy is the source of truth.
#
#   deploy/sync-env.sh status   compare key names and values, print no values
#   deploy/sync-env.sh pull     replace the local copy with the server's
#   deploy/sync-env.sh push     replace the server's copy with the local one (backs it up first)
#
# DEPLOY_HOST and DEPLOY_PATH come from deploy/.env.deploy, as for deploy.sh. Push does not
# restart anything: new values reach the containers on the next deploy.
set -euo pipefail

root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$root"
[ -f deploy/.env.deploy ] && . deploy/.env.deploy
: "${DEPLOY_HOST:?Set DEPLOY_HOST in deploy/.env.deploy}"
: "${DEPLOY_PATH:?Set DEPLOY_PATH in deploy/.env.deploy}"
remote="$DEPLOY_PATH/deploy/.env"
umask 077

keys() { sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' | sort; }

case "${1:-status}" in
  status)
    server="$(mktemp)"; trap 'rm -f "$server"' EXIT
    scp -q "$DEPLOY_HOST:$remote" "$server"
    if [ ! -f deploy/.env ]; then echo "No local deploy/.env. Run: deploy/sync-env.sh pull"; exit 1; fi
    if cmp -s deploy/.env "$server"; then echo "In sync ($(keys < deploy/.env | wc -l) keys)."; exit 0; fi
    echo "Keys only on the server:"; comm -13 <(keys < deploy/.env) <(keys < "$server") | sed 's/^/  /'
    echo "Keys only here:";          comm -23 <(keys < deploy/.env) <(keys < "$server") | sed 's/^/  /'
    echo "Keys with different values or order:"
    comm -3 <(sort deploy/.env) <(sort "$server") | sed -n 's/^[[:space:]]*\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' | sort -u | sed 's/^/  /'
    exit 1 ;;
  pull)
    scp -q "$DEPLOY_HOST:$remote" deploy/.env
    chmod 600 deploy/.env
    echo "Pulled $(keys < deploy/.env | wc -l) keys into deploy/.env." ;;
  push)
    [ -f deploy/.env ] || { echo "No local deploy/.env." >&2; exit 1; }
    stamp="$(date +%Y%m%d-%H%M%S)"
    ssh "$DEPLOY_HOST" "cp -p $(printf %q "$remote") $(printf %q "$remote.bak-$stamp") && chmod 600 $(printf %q "$remote.bak-$stamp")"
    scp -q deploy/.env "$DEPLOY_HOST:$remote"
    ssh "$DEPLOY_HOST" "chmod 600 $(printf %q "$remote")"
    echo "Pushed. Server backup: $remote.bak-$stamp. Run deploy/deploy.sh for the containers to pick it up." ;;
  *) echo "Usage: deploy/sync-env.sh [status|pull|push]" >&2; exit 2 ;;
esac
