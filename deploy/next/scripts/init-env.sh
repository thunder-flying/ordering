#!/usr/bin/env bash
set -euo pipefail
umask 077
dir=/etc/ordering
install -d -m 0700 "$dir"
[[ ! -e "$dir/production.env" && ! -e "$dir/edge.env" ]] || { echo 'Environment already exists'; exit 1; }
command -v argon2 >/dev/null || { echo 'Install the Ubuntu argon2 package first'; exit 1; }
read -rsp 'WeChat AppSecret: ' wechat
printf '\n'
read -rsp 'Admin password (at least 16 characters): ' password
printf '\n'
read -rp 'ACME contact email: ' email
[[ "$wechat" =~ ^[a-zA-Z0-9]{16,}$ && ${#password} -ge 16 && "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]] || { echo 'Invalid input'; exit 1; }
hash=$(printf '%s' "$password" | argon2 "$(openssl rand -hex 16)" -id -t 3 -m 16 -p 1 -e)
tmp=$(mktemp "$dir/.production.XXXXXX")
trap 'rm -f -- "$tmp"' EXIT
{
  printf '%s\n' 'APP_IMAGE=ordering-server:local-test' 'TOOLING_IMAGE=ordering-tooling:local-test' 'MYSQL_DATABASE=ordering' 'MYSQL_USER=ordering_app' 'WECHAT_APP_ID=wx0006792d6129b164' 'ADMIN_USERNAME=admin'
  for key in MYSQL_PASSWORD MYSQL_ROOT_PASSWORD OPENID_HMAC_SECRET USER_SESSION_PEPPER ADMIN_SESSION_SECRET; do
    printf '%s=%s\n' "$key" "$(openssl rand -hex 32)"
  done
  printf "WECHAT_APP_SECRET=%s\nADMIN_PASSWORD_HASH='%s'\n" "$wechat" "$hash"
} > "$tmp"
python3 "$(dirname "$0")/validate_env.py" "$tmp"
mv -- "$tmp" "$dir/production.env"
printf 'ACME_EMAIL=%s\n' "$email" > "$dir/edge.env"
