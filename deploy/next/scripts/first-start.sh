#!/usr/bin/env bash
set -euo pipefail
umask 077
root=/opt/ordering/deploy/next
env_file=/etc/ordering/production.env
python3 "$root/scripts/validate_env.py" "$env_file"
for archive in /opt/ordering/first-release.tar.gz /opt/ordering/base-images.tar.gz; do
  test -s "$archive" || { echo "Image transfer is pending: $archive" >&2; exit 1; }
done
docker load -i /opt/ordering/first-release.tar.gz
docker load -i /opt/ordering/base-images.tar.gz
if ! grep -q '^MYSQL_IMAGE=' "$env_file"; then
  printf '%s\n' 'MYSQL_IMAGE=ordering-mysql:8.4-b3b90af2' 'NGINX_IMAGE=ordering-nginx:stable-1e0bd91d' >> "$env_file"
fi
compose=(docker compose --env-file "$env_file" -f "$root/compose.yaml")
"${compose[@]}" up -d --wait mysql
"${compose[@]}" run --rm --no-deps -w /app/apps/server tooling node node_modules/prisma/build/index.js migrate deploy
"${compose[@]}" run --rm --no-deps --user 0:0 --entrypoint /bin/sh tooling -c 'mkdir -p "$UPLOAD_ROOT/dishes" && chown 10001:10001 "$UPLOAD_ROOT" "$UPLOAD_ROOT/dishes"'
"${compose[@]}" run --rm --no-deps -w /app/apps/server tooling node node_modules/tsx/dist/cli.mjs prisma/seed.ts
"${compose[@]}" up -d --wait server nginx
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:18080/api/v1/health
docker compose --env-file /etc/ordering/edge.env -f "$root/edge/compose.yaml" up -d
