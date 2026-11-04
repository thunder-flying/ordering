#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="${ORDERING_ROOT:-/opt/ordering}"
ENV_FILE="${ORDERING_ENV_FILE:-/etc/ordering/production.env}"
BACKUP_ROOT="${ORDERING_BACKUP_ROOT:-/var/backups/ordering}"
COMPOSE_FILE="$ROOT/deploy/next/compose.yaml"

fail() { printf 'ordering-backup: %s\n' "$1" >&2; exit 1; }
[ -r "$ENV_FILE" ] || fail "production environment is missing"
[ -r "$COMPOSE_FILE" ] || fail "production Compose file is missing"
command -v docker >/dev/null || fail "Docker is missing"
command -v gzip >/dev/null || fail "gzip is missing"
command -v tar >/dev/null || fail "tar is missing"
docker volume inspect ordering_uploads >/dev/null 2>&1 || fail "uploads volume is missing"

install -d -m 0700 "$BACKUP_ROOT"
TEMP="$(mktemp -d "$BACKUP_ROOT/.pending.XXXXXX")"
cleanup() { if [ -n "$TEMP" ]; then rm -rf -- "$TEMP"; fi; }
trap cleanup EXIT

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${compose[@]}" exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --quick --routines --triggers "$MYSQL_DATABASE"' \
  | gzip -c > "$TEMP/database.sql.gz" || fail "database dump failed"
[ -s "$TEMP/database.sql.gz" ] || fail "database dump is empty"
gzip -t "$TEMP/database.sql.gz" || fail "database dump is corrupt"

"${compose[@]}" run --rm --no-deps --entrypoint tar \
  -v ordering_uploads:/uploads:ro \
  -v "$TEMP:/backup" \
  nginx -czf /backup/uploads.tar.gz -C /uploads . \
  || fail "uploads archive failed"
[ -s "$TEMP/uploads.tar.gz" ] || fail "uploads archive is empty"
tar -tzf "$TEMP/uploads.tar.gz" >/dev/null || fail "uploads archive is corrupt"

if command -v sha256sum >/dev/null; then
  (cd "$TEMP" && sha256sum database.sql.gz uploads.tar.gz > SHA256SUMS)
else
  (cd "$TEMP" && shasum -a 256 database.sql.gz uploads.tar.gz > SHA256SUMS)
fi
chmod 0600 "$TEMP"/*
snapshot="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
mv -- "$TEMP" "$snapshot"
TEMP=""
printf 'ordering-backup: created %s\n' "$snapshot"
