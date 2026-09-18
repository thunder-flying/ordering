#!/usr/bin/env bash
set -euo pipefail

umask 077

HEALTH_URL="${HEALTH_URL:-https://api.guziyi.cn/api/v1/health}"
APP_ROOT="${APP_ROOT:-/opt/kaifanla}"
ENV_FILE="${ENV_FILE:-/etc/kaifanla/production.env}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_ROOT}/deploy/docker-compose.prod.yml}"
MIN_CERT_DAYS="${MIN_CERT_DAYS:-21}"
MAX_DISK_PERCENT="${MAX_DISK_PERCENT:-80}"
NGINX_CONTAINER="${NGINX_CONTAINER:-kaifanla-nginx-1}"

fail() {
  printf 'kaifanla-health: %s\n' "$1" >&2
  exit 1
}

test -r "$ENV_FILE" || fail "production environment is missing"
test -r "$COMPOSE_FILE" || fail "production compose file is missing"
command -v curl >/dev/null 2>&1 || fail "curl is missing"
command -v docker >/dev/null 2>&1 || fail "docker is missing"

curl --fail --silent --show-error --max-time 15 --retry 2 --retry-delay 1 "$HEALTH_URL" >/dev/null \
  || fail "https health endpoint failed"

for service in mysql server nginx; do
  container_id="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q "$service")"
  test -n "$container_id" || fail "container is missing: $service"

  state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
  test "$state" = running || fail "container is not running: $service"

  case "$service" in
    mysql|server)
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
      test "$health" = healthy || fail "container is not healthy: $service"
      ;;
  esac
done

for path in / /var/lib/kaifanla; do
  used_percent="$(df --output=pcent "$path" | tail -n 1 | tr -dc '0-9')"
  test -n "$used_percent" || fail "unable to read disk usage: $path"
  test "$used_percent" -lt "$MAX_DISK_PERCENT" || fail "disk usage is ${used_percent}%: $path"
done

if ss -lnt 2>/dev/null | awk '{print $4}' | grep -Eq '(^|:)(3000|3306)$'; then
  fail "private service port is exposed"
fi

docker exec "$NGINX_CONTAINER" openssl x509 \
  -checkend "$((MIN_CERT_DAYS * 86400))" \
  -noout \
  -in /etc/letsencrypt/live/api.guziyi.cn/fullchain.pem >/dev/null \
  || fail "certificate expires within ${MIN_CERT_DAYS} days or is invalid"

printf 'kaifanla-health: ok\n'
