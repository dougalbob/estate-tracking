#!/bin/sh
set -eu

# Unraid's Docker template cannot pass --env-file. Keep the file on the
# persistent /data volume and export its assignments before migration/startup.
if [ -f /data/estate.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /data/estate.env
  set +a
fi

: "${DATABASE_PATH:=/data/estate.sqlite}"
: "${DOCUMENTS_PATH:=/data/documents}"
export DATABASE_PATH DOCUMENTS_PATH

mkdir -p "$(dirname "$DATABASE_PATH")" "$DOCUMENTS_PATH"
node /app/scripts/migrate.cjs

# Run Next directly so it remains the container's main process and receives
# stop/restart signals correctly. Port 3000 is the documented Unraid mapping.
exec /app/node_modules/.bin/next start --hostname 0.0.0.0 --port 3000
