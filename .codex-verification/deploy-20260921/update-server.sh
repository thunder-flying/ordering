#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /opt/kaifanla/deploy
new_image=kaifanla-server:deploy-20260921
old_image=$(docker inspect kaifanla-server-1 --format '{{.Image}}')
record=/opt/kaifanla/deployments/20260921-update
mkdir -p "$record"
printf '%s\n' "$old_image" > "$record/previous-image.txt"
docker tag "$old_image" kaifanla-server:rollback-20260921
docker load -i /opt/kaifanla/images/server-deploy-20260921-full.tar
compose() { docker compose --env-file /etc/kaifanla/production.env -f docker-compose.prod.yml -f docker-compose.offline.yml "$@"; }
export APP_IMAGE="$new_image"
compose config --quiet
compose run -d --no-deps --name kaifanla-candidate-20260921 server
trap 'docker rm -f kaifanla-candidate-20260921 >/dev/null 2>&1 || true' EXIT
for attempt in $(seq 1 30); do
  if docker exec kaifanla-candidate-20260921 node -e 'fetch("http://127.0.0.1:3000/api/v1/health").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'; then break; fi
  if [ "$attempt" = 30 ]; then exit 1; fi
  sleep 2
done
docker exec kaifanla-candidate-20260921 node -e 'Promise.all([fetch("http://127.0.0.1:3000/admin/login").then(r=>{console.log("admin",r.status);if(r.status!==200)process.exit(1)}),fetch("http://127.0.0.1:3000/api/v1/dishes").then(r=>{console.log("dishes",r.status);if(![200,401].includes(r.status))process.exit(1)})]).catch(()=>process.exit(1))'
docker rm -f kaifanla-candidate-20260921 >/dev/null
trap - EXIT
docker exec kaifanla-mysql-1 sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --no-tablespaces "$MYSQL_DATABASE"' | gzip > "$record/database.sql.gz"
test -s "$record/database.sql.gz"
cp /etc/kaifanla/production.env "$record/production.env.previous"
rollback() {
  trap - ERR
  export APP_IMAGE="$old_image"
  compose up -d --no-deps --wait --wait-timeout 120 server
  docker exec kaifanla-nginx-1 nginx -s reload
  printf 'Update failed; restored previous application image\n' >&2
  exit 1
}
trap rollback ERR
compose up -d --no-deps --wait --wait-timeout 120 server
docker exec kaifanla-nginx-1 nginx -t
docker exec kaifanla-nginx-1 nginx -s reload
curl --fail --silent --show-error --retry 3 --retry-delay 2 --max-time 15 https://api.guziyi.cn/api/v1/health
curl --fail --silent --show-error --max-time 15 -o /dev/null -w 'admin HTTP %{http_code}\n' https://api.guziyi.cn/admin/login
/opt/kaifanla/deploy/scripts/health-check.sh
sed -i 's|^APP_IMAGE=.*|APP_IMAGE=kaifanla-server:deploy-20260921|' /etc/kaifanla/production.env
trap - ERR
docker inspect kaifanla-server-1 --format '{{.Image}} {{.State.Health.Status}}' > "$record/deployed-image.txt"
cat "$record/deployed-image.txt"
printf 'Deployment successful\n'
