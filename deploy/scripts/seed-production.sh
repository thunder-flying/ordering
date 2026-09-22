#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_ROOT=/opt/kaifanla
ENV_FILE=/etc/kaifanla/production.env
COMPOSE_FILE="$APP_ROOT/deploy/docker-compose.prod.yml"
UPLOAD_VOLUME=kaifanla_uploads

fail() {
  printf 'kaifanla-seed: %s\n' "$1" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail "seed-production.sh must run as root"
[ -f "$ENV_FILE" ] || fail "production environment is missing: $ENV_FILE"
[ "$(stat -c '%a' "$ENV_FILE")" = "600" ] || fail "production environment must have mode 600"
[ -f "$COMPOSE_FILE" ] || fail "production Compose file is missing: $COMPOSE_FILE"
command -v docker >/dev/null 2>&1 || fail "docker is missing"
docker compose version >/dev/null 2>&1 || fail "docker compose is missing"
docker volume inspect "$UPLOAD_VOLUME" >/dev/null 2>&1 || fail "upload volume is missing: $UPLOAD_VOLUME"

compose=(docker compose --profile tools --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${compose[@]}" config >/dev/null || fail "production Compose configuration is invalid"
# Read the resolved service image without printing the environment or credentials.
tooling_image="$("${compose[@]}" config | awk '
  /^  tooling:$/ { tooling = 1; next }
  /^  [^ ]/ { tooling = 0 }
  tooling && /^    image: / { sub(/^    image: /, ""); gsub(/[\042\047]/, ""); print }
')"
[ -n "$tooling_image" ] || fail "cannot resolve tooling image from production Compose configuration"
docker image inspect "$tooling_image" >/dev/null 2>&1 || fail "tooling image is not loaded locally: $tooling_image; load the configured tooling image first"
mysql_container="$("${compose[@]}" ps -q mysql)"
[ -n "$mysql_container" ] || fail "mysql service is not running; start the existing production database first"
mysql_status="$(docker inspect --format '{{.State.Status}}' "$mysql_container")"
[ "$mysql_status" = "running" ] || fail "mysql service is not running: $mysql_status"
mysql_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$mysql_container")"
[ "$mysql_health" = "healthy" ] || fail "mysql service is not healthy: $mysql_health"

printf 'Preparing menu image directory permissions...\n'
"${compose[@]}" run --rm --no-deps \
  --user 0:0 --entrypoint /bin/sh \
  --volume "$UPLOAD_VOLUME:/var/lib/kaifanla/uploads" \
  tooling -c '
    set -eu
    [ "$UPLOAD_ROOT" = /var/lib/kaifanla/uploads ] || { echo "kaifanla-seed: unexpected UPLOAD_ROOT" >&2; exit 1; }
    [ ! -L "$UPLOAD_ROOT" ] && [ ! -L "$UPLOAD_ROOT/dishes" ] || { echo "kaifanla-seed: upload directories must not be symbolic links" >&2; exit 1; }
    mkdir -p "$UPLOAD_ROOT/dishes"
    chown 10001:10001 "$UPLOAD_ROOT" "$UPLOAD_ROOT/dishes"
    chmod 0755 "$UPLOAD_ROOT" "$UPLOAD_ROOT/dishes"
  '

printf 'Seeding production menu database...\n'
"${compose[@]}" run --rm \
  --no-deps \
  --user 10001:10001 \
  --entrypoint /bin/sh \
  --workdir /app/apps/server \
  --volume "$UPLOAD_VOLUME:/var/lib/kaifanla/uploads" \
  tooling \
  -c '
    set -eu
    [ -w "$UPLOAD_ROOT/dishes" ] && [ -x "$UPLOAD_ROOT/dishes" ] || { echo "kaifanla-seed: dishes directory is not writable by user 10001" >&2; exit 1; }
    command -v node >/dev/null 2>&1 || { echo "kaifanla-seed: tooling image is missing Node.js" >&2; exit 1; }
    for required in node_modules/tsx/dist/cli.mjs prisma/seed.ts; do
      [ -r "$required" ] || { echo "kaifanla-seed: tooling image is missing $required; check TOOLING_IMAGE in production.env and load the matching tooling image" >&2; exit 1; }
    done
    exec node node_modules/tsx/dist/cli.mjs prisma/seed.ts
  '

printf 'Production menu seed completed.\n'
