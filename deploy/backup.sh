#!/usr/bin/env bash
# Snapshot the database and uploaded media before a rollout. Runs on the server, from deploy/.
#
#   deploy/backup.sh            # write a pair of archives into deploy/backups/
#   BACKUP_KEEP=30 deploy/backup.sh
#
# Archives are plain tar.gz files of the named Docker volumes, so a restore is the reverse:
#   docker run --rm -v voidreg_api-data:/data -v "$PWD/backups":/backup alpine \
#     sh -c 'rm -rf /data/* && tar -xzf /backup/<file>-data.tar.gz -C /data'
# The script exits non-zero if either archive is missing, empty or unreadable, and deploy.sh
# stops the rollout when that happens. It never modifies the volumes it reads.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
keep="${BACKUP_KEEP:-14}"
stamp="$(date -u +%Y%m%d-%H%M%S)"
dir="$PWD/backups"
mkdir -p "$dir"
chmod 700 "$dir"

snapshot() {
  local volume="$1" label="$2" must_contain="$3"
  local file="voidreg-$stamp-$label.tar.gz"
  docker volume inspect "$volume" >/dev/null 2>&1 || {
    echo "backup: volume $volume does not exist; refusing to continue" >&2
    exit 1
  }
  # Read-only mount: the backup cannot change live data.
  # The container runs as root, so hand the archive back to the invoking user afterwards.
  docker run --rm -e OWNER="$(id -u):$(id -g)" -v "$volume":/src:ro -v "$dir":/out alpine:3 \
    sh -c 'tar -czf "/out/$0.partial" -C /src . && chown "$OWNER" "/out/$0.partial"' "$file"
  mv "$dir/$file.partial" "$dir/$file"
  chmod 600 "$dir/$file"
  [ -s "$dir/$file" ] || { echo "backup: $file is empty" >&2; exit 1; }
  tar -tzf "$dir/$file" >/dev/null || { echo "backup: $file is not readable" >&2; exit 1; }
  # List first: grep -q would close the pipe early and trip pipefail on a good archive.
  listing="$(tar -tzf "$dir/$file")"
  if [ -n "$must_contain" ] && ! grep -q "$must_contain" <<<"$listing"; then
    echo "backup: $file does not contain $must_contain" >&2
    exit 1
  fi
  echo "backup: wrote backups/$file ($(du -h "$dir/$file" | cut -f1))"
}

snapshot "${DATA_VOLUME:-voidreg_api-data}" data 'voidreg.db'
snapshot "${MEDIA_VOLUME:-voidreg_media-data}" media ''

# Keep the newest archives of each kind.
for label in data media; do
  ls -1t "$dir"/voidreg-*-"$label".tar.gz 2>/dev/null | tail -n +"$((keep + 1))" | xargs -r rm -f --
done
