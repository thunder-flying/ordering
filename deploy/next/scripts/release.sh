#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_IMAGE="${1:-}"
TOOLING_IMAGE="${2:-}"
REGISTRY_USER="${3:-}"
ROOT="${ORDERING_ROOT:-/opt/ordering}"
ENV_FILE="${ORDERING_ENV_FILE:-/etc/ordering/production.env}"
COMPOSE_FILE="$ROOT/deploy/next/compose.yaml"
BACKUP_SCRIPT="$ROOT/deploy/next/scripts/backup.sh"
ENV_VALIDATOR="$ROOT/deploy/next/scripts/validate_env.py"
HEALTH_URL="${ORDERING_HEALTH_URL:-https://ordering.guziyi.cn/api/v1/health}"

fail() { printf 'ordering-release: %s\n' "$1" >&2; exit 1; }

[[ "$APP_IMAGE" =~ ^ghcr\.io/([a-z0-9][a-z0-9._-]*)/ordering-server:([0-9a-f]{40})$ ]] \
  || fail "application image must use a full Git SHA tag"
APP_OWNER="${BASH_REMATCH[1]}"
[ "$APP_OWNER" = thunder-flying ] || fail "untrusted image registry owner"
APP_SHA="${BASH_REMATCH[2]}"
[[ "$TOOLING_IMAGE" =~ ^ghcr\.io/([a-z0-9][a-z0-9._-]*)/ordering-tooling:([0-9a-f]{40})$ ]] \
  || fail "tooling image must use a full Git SHA tag"
[ "${BASH_REMATCH[1]}" = "$APP_OWNER" ] || fail "application and tooling registry owners differ"
[ "${BASH_REMATCH[2]}" = "$APP_SHA" ] || fail "application and tooling SHA differ"
[[ "$REGISTRY_USER" =~ ^[A-Za-z0-9_-]+$ ]] || fail "invalid registry user"
[ -r "$ENV_FILE" ] || fail "production environment is missing"
[ -r "$COMPOSE_FILE" ] || fail "production Compose file is missing"
[ -r "$ENV_VALIDATOR" ] || fail "production environment validator is missing"
command -v docker >/dev/null || fail "Docker is missing"
command -v curl >/dev/null || fail "curl is missing"
command -v python3 >/dev/null || fail "Python 3 is missing"

file_mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE")"
[ "$file_mode" = 600 ] || fail "production environment must have mode 600"
python3 "$ENV_VALIDATOR" "$ENV_FILE" || fail "production environment validation failed"

DOCKER_CONFIG="$(mktemp -d)"
export DOCKER_CONFIG
CANDIDATE_ENV="$(mktemp "$ENV_FILE.candidate.XXXXXX")"
ROLLBACK_ENV=""
cleanup() {
  rm -f -- "$CANDIDATE_ENV"
  if [ -n "$ROLLBACK_ENV" ]; then rm -f -- "$ROLLBACK_ENV"; fi
  rm -rf -- "$DOCKER_CONFIG"
}
trap cleanup EXIT

make_env() {
  local output="$1" app="$2" tooling="$3"
  sed -E '/^(APP_IMAGE|TOOLING_IMAGE)=/d' "$ENV_FILE" > "$output"
  printf 'APP_IMAGE=%s\nTOOLING_IMAGE=%s\n' "$app" "$tooling" >> "$output"
  chmod 0600 "$output"
}

make_env "$CANDIDATE_ENV" "$APP_IMAGE" "$TOOLING_IMAGE"
candidate=(docker compose --env-file "$CANDIDATE_ENV" -f "$COMPOSE_FILE")
"${candidate[@]}" config --quiet || fail "candidate Compose configuration is invalid"

old_container="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q server 2>/dev/null || true)"
previous_app=""
previous_tooling="$(sed -n 's/^TOOLING_IMAGE=//p' "$ENV_FILE" | tail -n 1)"
if [ -n "$old_container" ]; then
  previous_app="$(docker inspect --format '{{.Config.Image}}' "$old_container")"
fi

rollback() {
  if [ -z "$previous_app" ]; then
    printf 'ordering-release: no previous application image; manual recovery required\n' >&2
    return
  fi
  ROLLBACK_ENV="$(mktemp "$ENV_FILE.rollback.XXXXXX")"
  make_env "$ROLLBACK_ENV" "$previous_app" "${previous_tooling:-$TOOLING_IMAGE}"
  printf 'ordering-release: attempting rollback to %s\n' "$previous_app" >&2
  docker compose --env-file "$ROLLBACK_ENV" -f "$COMPOSE_FILE" up -d --no-build --no-deps server \
    && docker compose --env-file "$ROLLBACK_ENV" -f "$COMPOSE_FILE" up -d --no-build --force-recreate nginx \
    || printf 'ordering-release: rollback failed; inspect containers manually\n' >&2
}

printf 'ordering-release: fetching SHA %s\n' "$APP_SHA"
docker login ghcr.io -u "$REGISTRY_USER" --password-stdin >/dev/null \
  || fail "registry login failed"
docker pull "$APP_IMAGE" || fail "application image pull failed"
docker pull "$TOOLING_IMAGE" || fail "tooling image pull failed"

"${candidate[@]}" up -d mysql || fail "MySQL did not start"
if [ -n "$old_container" ]; then
  [ -r "$BACKUP_SCRIPT" ] || fail "backup script is missing"
  ORDERING_ROOT="$ROOT" ORDERING_ENV_FILE="$ENV_FILE" bash "$BACKUP_SCRIPT" \
    || fail "pre-deploy backup failed"
fi

"${candidate[@]}" --profile tools run --rm tooling pnpm --filter @ordering/server prisma:migrate \
  || fail "database migration failed; application was not replaced"

if ! "${candidate[@]}" up -d --no-build --no-deps server; then
  rollback
  fail "application update failed; migration was not reversed"
fi
if ! "${candidate[@]}" up -d --no-build --force-recreate nginx; then
  rollback
  fail "project proxy update failed; migration was not reversed"
fi
if ! curl --fail --silent --show-error --max-time 15 --retry 3 --retry-delay 2 "$HEALTH_URL" >/dev/null; then
  rollback
  fail "HTTPS health check failed; migration was not reversed"
fi

mv -- "$CANDIDATE_ENV" "$ENV_FILE"
install -d -m 0750 "$ROOT/var/releases"
record="$ROOT/var/releases/$(date -u +%Y%m%dT%H%M%SZ)-$APP_SHA.record"
printf 'result=success\nsha=%s\napp_image=%s\ntooling_image=%s\nprevious_app_image=%s\n' \
  "$APP_SHA" "$APP_IMAGE" "$TOOLING_IMAGE" "$previous_app" > "$record"
chmod 0600 "$record"
printf 'ordering-release: published %s\n' "$APP_SHA"
