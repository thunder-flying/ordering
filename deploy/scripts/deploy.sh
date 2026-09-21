#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_ROOT=/opt/kaifanla
ENV_FILE=/etc/kaifanla/production.env
RELEASE_DIR=
APP_IMAGE=
TOOLING_IMAGE=
HEALTH_URL=

usage() {
  cat >&2 <<'EOF'
Usage: deploy.sh --release-dir DIR --app-root DIR --env-file FILE \
  --app-image IMAGE --tooling-image IMAGE [--health-url URL]
EOF
}

fail() {
  printf 'kaifanla-deploy: %s\n' "$1" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --release-dir)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      RELEASE_DIR="$2"
      shift 2
      ;;
    --app-root)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      APP_ROOT="$2"
      shift 2
      ;;
    --env-file)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      ENV_FILE="$2"
      shift 2
      ;;
    --app-image)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      APP_IMAGE="$2"
      shift 2
      ;;
    --tooling-image)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      TOOLING_IMAGE="$2"
      shift 2
      ;;
    --health-url)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      HEALTH_URL="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

[ "$(id -u)" -eq 0 ] || fail "deploy.sh must run as root"
[ -n "$RELEASE_DIR" ] || fail "release directory is required"
[ -n "$APP_IMAGE" ] || fail "application image is required"
[ -n "$TOOLING_IMAGE" ] || fail "tooling image is required"
[ -f "$ENV_FILE" ] || fail "production environment is missing: $ENV_FILE"
[ "$(stat -c '%a' "$ENV_FILE")" = "600" ] || fail "production environment must have mode 600"
[ -f "$RELEASE_DIR/images.tar.gz" ] || fail "image archive is missing"
[ -f "$RELEASE_DIR/docker-compose.prod.yml" ] || fail "production Compose file is missing"
[ -f "$RELEASE_DIR/deploy.sh" ] || fail "release deploy script is missing"
[ -f "$RELEASE_DIR/health-check.sh" ] || fail "release health check is missing"

[[ "$APP_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "application root must be a simple absolute path"
[[ "$APP_ROOT" != *..* ]] || fail "application root contains a parent traversal"
case "$RELEASE_DIR" in
  "$APP_ROOT"/incoming/*) ;;
  *) fail "release directory must be inside the application incoming directory" ;;
esac
case "$RELEASE_DIR" in
  *..*) fail "release directory contains a parent traversal" ;;
esac
[[ "$APP_IMAGE" =~ ^[a-zA-Z0-9._/-]+:[a-zA-Z0-9._-]+$ ]] || fail "application image contains unsupported characters"
[[ "$TOOLING_IMAGE" =~ ^[a-zA-Z0-9._/-]+:[a-zA-Z0-9._-]+$ ]] || fail "tooling image contains unsupported characters"

command -v docker >/dev/null 2>&1 || fail "docker is missing"
docker compose version >/dev/null 2>&1 || fail "docker compose is missing"
command -v gzip >/dev/null 2>&1 || fail "gzip is missing"

COMPOSE_FILE="$APP_ROOT/deploy/docker-compose.prod.yml"
RECORD_DIR=/var/lib/kaifanla/deployments
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RECORD_FILE="$RECORD_DIR/${STAMP}-${RELEASE_DIR##*/}.record"
COMPOSE_ENV="$(mktemp /run/kaifanla-compose.env.XXXXXX)"
PREVIOUS_APP_IMAGE=

cleanup() {
  rm -f -- "$COMPOSE_ENV"
}
trap cleanup EXIT

write_record() {
  local result="$1"
  local reason="${2:-}"
  local temp_record
  install -d -m 0750 "$RECORD_DIR"
  temp_record="$(mktemp "$RECORD_DIR/.record.XXXXXX")"
  chmod 0600 "$temp_record"
  {
    printf 'result=%s\n' "$result"
    printf 'release=%s\n' "${RELEASE_DIR##*/}"
    printf 'app_image=%s\n' "$APP_IMAGE"
    printf 'tooling_image=%s\n' "$TOOLING_IMAGE"
    printf 'previous_app_image=%s\n' "$PREVIOUS_APP_IMAGE"
    printf 'timestamp=%s\n' "$STAMP"
    if [ -n "$reason" ]; then
      printf 'reason=%s\n' "$reason"
    fi
  } > "$temp_record"
  mv -- "$temp_record" "$RECORD_FILE"
}

make_compose_env() {
  local app_image="$1"
  local tooling_image="$2"
  local output_file="$3"
  sed -E '/^(APP_IMAGE|TOOLING_IMAGE)=/d' "$ENV_FILE" > "$output_file"
  printf 'APP_IMAGE=%s\nTOOLING_IMAGE=%s\n' "$app_image" "$tooling_image" >> "$output_file"
  chmod 0600 "$output_file"
}

rollback_application() {
  if [ -n "$PREVIOUS_APP_IMAGE" ] && docker image inspect "$PREVIOUS_APP_IMAGE" >/dev/null 2>&1; then
    local rollback_env
    rollback_env="$(mktemp /run/kaifanla-rollback.env.XXXXXX)"
    make_compose_env "$PREVIOUS_APP_IMAGE" "$TOOLING_IMAGE" "$rollback_env"
    local rollback_compose=(docker compose --profile tls --env-file "$rollback_env" -f "$COMPOSE_FILE")
    "${rollback_compose[@]}" up -d --no-build server nginx >/dev/null 2>&1 || true
    rm -f -- "$rollback_env"
  fi
}

make_compose_env "$APP_IMAGE" "$TOOLING_IMAGE" "$COMPOSE_ENV"

CURRENT_COMPOSE_FILE="$APP_ROOT/deploy/docker-compose.prod.yml"
if [ -f "$CURRENT_COMPOSE_FILE" ]; then
  current_server_id="$(docker compose --env-file "$ENV_FILE" -f "$CURRENT_COMPOSE_FILE" ps -q server 2>/dev/null || true)"
  if [ -n "$current_server_id" ]; then
    PREVIOUS_APP_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$current_server_id" 2>/dev/null || true)"
  fi
fi

candidate_compose=(docker compose --profile '*' --env-file "$COMPOSE_ENV" -f "$RELEASE_DIR/docker-compose.prod.yml")
"${candidate_compose[@]}" config >/dev/null || {
  write_record failed "compose-config"
  fail "candidate Compose configuration is invalid"
}

gzip -dc "$RELEASE_DIR/images.tar.gz" | docker load >/dev/null || {
  write_record failed "image-load"
  fail "image archive could not be loaded"
}
docker image inspect "$APP_IMAGE" >/dev/null 2>&1 || {
  write_record failed "application-image-missing"
  fail "application image is not available after load"
}
docker image inspect "$TOOLING_IMAGE" >/dev/null 2>&1 || {
  write_record failed "tooling-image-missing"
  fail "tooling image is not available after load"
}

tools_compose=(docker compose --profile tools --env-file "$COMPOSE_ENV" -f "$RELEASE_DIR/docker-compose.prod.yml")
"${tools_compose[@]}" run --rm tooling pnpm --filter @ordering/server prisma:migrate || {
  write_record failed "migration"
  fail "database migration failed; running application was not replaced"
}

install -d -m 0755 "$APP_ROOT/deploy/scripts" "$APP_ROOT/deploy/nginx/templates" "$APP_ROOT/deploy/nginx/snippets"
install -m 0644 "$RELEASE_DIR/docker-compose.prod.yml" "$APP_ROOT/deploy/docker-compose.prod.yml"
install -m 0755 "$RELEASE_DIR/health-check.sh" "$APP_ROOT/deploy/scripts/health-check.sh"
install -m 0755 "$RELEASE_DIR/deploy.sh" "$APP_ROOT/deploy/scripts/deploy.sh"
for nginx_file in "$RELEASE_DIR"/nginx/templates/*; do
  [ -f "$nginx_file" ] || continue
  install -m 0644 "$nginx_file" "$APP_ROOT/deploy/nginx/templates/"
done
for nginx_file in "$RELEASE_DIR"/nginx/snippets/*; do
  [ -f "$nginx_file" ] || continue
  install -m 0644 "$nginx_file" "$APP_ROOT/deploy/nginx/snippets/"
done

runtime_compose=(docker compose --profile tls --env-file "$COMPOSE_ENV" -f "$COMPOSE_FILE")
if ! "${runtime_compose[@]}" up -d --no-build --remove-orphans mysql server nginx; then
  rollback_application
  write_record failed "service-update"
  fail "service update failed; application rollback was attempted without reversing migrations"
fi

nginx_container="$("${runtime_compose[@]}" ps -q nginx)"
[ -n "$nginx_container" ] || {
  rollback_application
  write_record failed "nginx-missing"
  fail "nginx container is missing after update"
}

health_environment=(
  "APP_ROOT=$APP_ROOT"
  "ENV_FILE=$ENV_FILE"
  "COMPOSE_FILE=$COMPOSE_FILE"
  "NGINX_CONTAINER=$nginx_container"
)
if [ -n "$HEALTH_URL" ]; then
  health_environment+=("HEALTH_URL=$HEALTH_URL")
fi
if ! env "${health_environment[@]}" bash "$APP_ROOT/deploy/scripts/health-check.sh"; then
  rollback_application
  write_record failed "health-check"
  fail "health check failed; application rollback was attempted without reversing migrations"
fi

write_record success
rm -rf -- "$RELEASE_DIR"
printf 'kaifanla-deploy: success (%s)\n' "$APP_IMAGE"
