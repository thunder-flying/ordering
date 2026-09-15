#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ENV=/etc/kaifanla/source.env.upload
OUTPUT_ENV=/etc/kaifanla/production.env

if [ "$(id -u)" -ne 0 ]; then
  echo "create-production-env must run as root" >&2
  exit 1
fi
test -f "$SOURCE_ENV"
test "$(stat -c '%a' "$SOURCE_ENV")" = "600"
test ! -e "$OUTPUT_ENV"

read_key() {
  local key="$1"
  local line
  line="$(grep -m 1 -E "^${key}=" "$SOURCE_ENV" || true)"
  if [ -z "$line" ]; then
    echo "missing source key: $key" >&2
    exit 1
  fi
  printf '%s' "${line#*=}"
}

random_secret() {
  openssl rand -hex 32
}

wechat_app_id="$(read_key WECHAT_APP_ID)"
wechat_app_secret="$(read_key WECHAT_APP_SECRET)"
admin_username="$(read_key ADMIN_USERNAME)"
acme_email="$(read_key ACME_EMAIL)"
admin_password_hash="$(read_key ADMIN_PASSWORD_HASH | tr -d '\\')"

test -n "$wechat_app_secret"
test "$wechat_app_id" = "wx0006792d6129b164"
test -n "$admin_username"
test -n "$acme_email"
case "$admin_password_hash" in
  '$argon2id$'*) ;;
  *) echo "ADMIN_PASSWORD_HASH is not Argon2id" >&2; exit 1 ;;
esac
if [ "${#admin_password_hash}" -lt 80 ]; then
  echo "ADMIN_PASSWORD_HASH is too short" >&2
  exit 1
fi

temp_env="$(mktemp /etc/kaifanla/.production.env.XXXXXX)"
trap 'rm -f -- "$temp_env"' EXIT
chmod 0600 "$temp_env"

{
  printf 'ACME_EMAIL=%s\n' "$acme_email"
  printf '%s\n' \
    'APP_DOMAIN=api.guziyi.cn' \
    'APP_IMAGE=kaifanla-server:local' \
    'TOOLING_IMAGE=kaifanla-tooling:local' \
    'MYSQL_DATABASE=ordering' \
    'MYSQL_USER=ordering_app'
  printf 'MYSQL_PASSWORD=%s\n' "$(random_secret)"
  printf 'MYSQL_ROOT_PASSWORD=%s\n' "$(random_secret)"
  printf 'OPENID_HMAC_SECRET=%s\n' "$(random_secret)"
  printf 'WECHAT_APP_ID=%s\n' "$wechat_app_id"
  printf 'WECHAT_APP_SECRET=%s\n' "$wechat_app_secret"
  printf 'USER_SESSION_PEPPER=%s\n' "$(random_secret)"
  printf 'ADMIN_USERNAME=%s\n' "$admin_username"
  printf "ADMIN_PASSWORD_HASH='%s'\n" "$admin_password_hash"
  printf 'ADMIN_SESSION_SECRET=%s\n' "$(random_secret)"
  printf '%s\n' \
    'UPLOAD_ROOT=/var/lib/kaifanla/uploads' \
    'BACKUP_LOCAL_ROOT=/var/backups/kaifanla' \
    'OSS_PREFIX=kaifanla' \
    'HEALTH_URL=https://api.guziyi.cn/api/v1/health'
  printf 'RESTIC_PASSWORD=%s\n' "$(random_secret)"
} > "$temp_env"

chown root:root "$temp_env"
chmod 0600 "$temp_env"
mv -- "$temp_env" "$OUTPUT_ENV"
temp_env=""
rm -f -- "$SOURCE_ENV"

for key in MYSQL_PASSWORD MYSQL_ROOT_PASSWORD OPENID_HMAC_SECRET WECHAT_APP_SECRET USER_SESSION_PEPPER ADMIN_PASSWORD_HASH ADMIN_SESSION_SECRET RESTIC_PASSWORD ACME_EMAIL; do
  if grep -q "^${key}=." "$OUTPUT_ENV"; then
    echo "${key}=configured"
  else
    echo "${key}=missing" >&2
    exit 1
  fi
done
