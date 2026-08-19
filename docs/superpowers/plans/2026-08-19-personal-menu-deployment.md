# Personal Menu Production Deployment and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the verified Next.js/MySQL system to the user’s own mainland-China server and domain, add recoverable backups and monitoring, and release a filed, searchable WeChat Mini Program.

**Architecture:** Docker Compose runs Nginx, one Next.js service, and a private MySQL 8.4 service with explicit persistent volumes. Nginx is the only public application entry, TLS and rate limits terminate there, and encrypted off-server backups protect both database dumps and uploaded files.

**Tech Stack:** Ubuntu LTS server, Docker Engine with Compose v2, Nginx stable, Node.js 24 LTS container, MySQL 8.4, Certbot/ACME or a cloud-issued certificate, Restic with S3-compatible object storage, systemd timers, GitHub Actions for build verification.

**Spec:** `docs/superpowers/specs/2026-08-19-personal-menu-list-design.md`

**Prerequisite Plans:**
- `docs/superpowers/plans/2026-08-19-personal-menu-server.md`
- `docs/superpowers/plans/2026-08-19-personal-menu-miniapp.md`

## Global Constraints

- Do not start production deployment until both prerequisite completion gates pass.
- Use a self-purchased mainland-China server, a self-owned real-name-verified domain, valid HTTPS, ICP filing, and Mini Program filing.
- The initial server baseline is 2 vCPU, 4 GB RAM, and 40–80 GB SSD; increase disk before free space falls below 20%.
- Publicly expose only TCP 80 and 443. MySQL must never publish a host port in production.
- Store MySQL data, dish images, and private avatars outside container writable layers in separate persistent mounts.
- Keep AppSecret, database credentials, HMAC/session secrets, administrator password hash, backup password, and object-storage credentials only in ignored production environment files or the server’s secret facility.
- Daily backups retain 7 daily and 4 weekly restore points and include an encrypted off-server copy.
- Production versions are pinned and upgrades require backup, test migration, deployment, health verification, and a documented rollback.
- Release copy and declared service category must match the personal menu-list functionality; never hide features or select a misleading category.
- The actual current filing, privacy, category, and review requirements shown by the cloud provider and WeChat console take precedence when submission occurs.

---

## File Map

```text
apps/server/Dockerfile                         reproducible non-root Next.js image
apps/server/.dockerignore                      minimal build context
deploy/docker-compose.prod.yml                 Nginx, server, MySQL, backup profile
deploy/env/production.env.example              non-secret keys and documented formats
deploy/nginx/templates/default.conf.template   TLS, proxy, media, limits, security headers
deploy/nginx/snippets/security-headers.conf    shared safe headers
deploy/backup/Dockerfile                       MySQL client + Restic runtime
deploy/backup/backup.sh                        dump, verify, encrypt, upload, retention
deploy/backup/restore.sh                       explicit restore into a named target database/path
deploy/systemd/ordering-backup.service         one-shot backup unit
deploy/systemd/ordering-backup.timer           daily schedule
deploy/systemd/ordering-health.service         health/disk/certificate check
deploy/systemd/ordering-health.timer           five-minute schedule
deploy/systemd/ordering-maintenance.service    expired-upload cleanup
deploy/systemd/ordering-maintenance.timer      daily cleanup schedule
deploy/scripts/deploy.sh                       pull/build/migrate/start/verify sequence
deploy/scripts/rollback.sh                     prior-image rollback without DB reversal
.github/workflows/verify.yml                   clean CI verification
docs/runbooks/production.md                    purchase-to-deploy operations
docs/runbooks/backup-restore.md                 restore drill
docs/checklists/release.md                     ICP, filing, privacy, upload, review evidence
```

Scripts stop on errors, quote variables, and refuse empty/broad filesystem targets. Restore scripts require explicit target paths and never delete an existing production volume.

### Task 1: Production image and Compose topology

**Files:**
- Create: `apps/server/Dockerfile`
- Create: `apps/server/.dockerignore`
- Create: `deploy/docker-compose.prod.yml`
- Create: `deploy/env/production.env.example`
- Modify: `apps/server/next.config.ts`
- Test: `deploy/tests/compose-config.ps1`

**Interfaces:**
- Consumes: verified Next.js standalone build, Prisma migration, persistent upload root.
- Produces: `ordering-server`, `ordering-mysql`, and `ordering-nginx` services with health dependencies.

- [ ] **Step 1: Write the failing Compose policy test**

```powershell
$config = docker compose --env-file deploy/env/production.env.example -f deploy/docker-compose.prod.yml config --format json | ConvertFrom-Json
if ($config.services.mysql.ports) { throw 'Production MySQL must not publish ports' }
if (-not $config.services.server.healthcheck) { throw 'Server healthcheck is required' }
if (-not $config.services.mysql.volumes) { throw 'MySQL persistence is required' }
if (-not $config.services.server.read_only) { throw 'Server root filesystem must be read-only' }
```

Run: `pwsh deploy/tests/compose-config.ps1`

Expected first result: FAIL because the production Compose file does not exist.

- [ ] **Step 2: Enable Next.js standalone output and create a non-root image**

```ts
// apps/server/next.config.ts
import path from "node:path";

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
};
export default nextConfig;
```

Use a multi-stage `node:24-bookworm-slim` Dockerfile: frozen pnpm install, Prisma generation, CLI compilation, tests excluded from runtime, and `next build`. Copy `.next/standalone`, `.next/static`, `public`, Prisma migrations plus the pinned Prisma CLI, and the compiled upload-cleanup CLI into runtime. Run as a fixed non-root UID, set `NODE_ENV=production`, expose 3000, and write only to `/tmp` plus the mounted `/var/lib/ordering/uploads`.

- [ ] **Step 3: Define the production services and volumes**

`docker-compose.prod.yml` must:

- Pin `mysql:8.4` and `nginx:stable` by image digest when the plan is executed.
- Build a content-addressed Next.js image tagged by Git commit SHA.
- Define named volumes `mysql-data`, `dish-media`, `avatar-media`, `nginx-acme`, and `nginx-certs`.
- Mount dish/avatar directories into the server and mount only dish media read-only into Nginx if direct static serving is used.
- Set `read_only: true` with `tmpfs: /tmp` for Next.js; give Nginx tmpfs mounts for `/tmp`, `/var/cache/nginx`, and `/var/run`.
- Put all services on an internal network; publish only Nginx `80:80` and `443:443`.
- Add MySQL `mysqladmin ping` and Next.js `/api/v1/health` healthchecks.
- Start Next.js only after healthy MySQL; start Nginx only after healthy Next.js.
- Add a pinned `certbot/certbot` service behind the explicit `tls` Compose profile, sharing only the ACME webroot and certificate volumes with Nginx.

- [ ] **Step 4: Define environment formats without real secrets**

The example file contains safe sample values only:

```dotenv
APP_DOMAIN=menu.example.com
APP_IMAGE=ordering-server:local
MYSQL_DATABASE=ordering
MYSQL_USER=ordering_app
UPLOAD_ROOT=/var/lib/ordering/uploads
BACKUP_LOCAL_ROOT=/var/backups/ordering
```

Document the required secret variable names but leave their values absent from the tracked example. Compose must fail fast with `${NAME:?required}` for each secret rather than using a weak default.

- [ ] **Step 5: Build, inspect, and run the policy test**

```powershell
pnpm verify:server
docker build -f apps/server/Dockerfile -t ordering-server:local .
pwsh deploy/tests/compose-config.ps1
docker image inspect ordering-server:local --format '{{.Config.User}}'
```

Expected: checks pass and the image user is non-root.

- [ ] **Step 6: Commit**

```powershell
git add apps/server/Dockerfile apps/server/.dockerignore apps/server/next.config.ts deploy
git commit -m "build: add hardened production containers"
```

### Task 2: Nginx TLS, proxy, limits, and media policy

**Files:**
- Create: `deploy/nginx/templates/default.conf.template`
- Create: `deploy/nginx/snippets/security-headers.conf`
- Create: `deploy/tests/nginx-policy.ps1`
- Modify: `deploy/docker-compose.prod.yml`

**Interfaces:**
- Produces: same-origin `/admin`, `/api/v1`, public dish media, signed avatar media, ACME challenge, and HTTPS redirect.

- [ ] **Step 1: Write the failing Nginx policy checks**

The test renders the template with `APP_DOMAIN=menu.example.com`, runs `nginx -t` in the pinned container, and asserts the rendered config contains: TLS 1.2/1.3 only, HTTP-to-HTTPS redirect, body limits, API and login rate zones, `X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy`, and no autoindex.

- [ ] **Step 2: Implement the HTTP and HTTPS servers**

```nginx
limit_req_zone $binary_remote_addr zone=api_per_ip:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login_per_ip:10m rate=5r/m;
server_tokens off;

server {
  listen 80;
  server_name ${APP_DOMAIN};
  location ^~ /.well-known/acme-challenge/ { root /var/www/acme; }
  location / { return 301 https://$host$request_uri; }
}
```

The TLS server proxies Next.js with preserved `Host`, `X-Forwarded-Proto`, request ID, a 15-second normal timeout, and a 60-second upload timeout. Set 6 MB body limit for dish upload, 3 MB for avatar upload, and 512 KB for all other API requests.

- [ ] **Step 3: Apply endpoint-specific limits and caching**

- `/api/v1/admin/session`: login rate zone, no cache.
- `/api/v1/auth/wechat`: 10 requests/minute/IP burst 5, no cache.
- `/api/v1/admin/uploads` and `/api/v1/profile/avatar`: upload body limits, no cache.
- `/media/dishes`: public immutable cache only when the URL contains a content hash.
- Signed avatar route: private/no-store; do not expose the avatar directory as static root.
- `/admin`: no-store HTML, strict frame denial.

- [ ] **Step 4: Run policy and local smoke tests**

```powershell
pwsh deploy/tests/nginx-policy.ps1
docker compose --env-file deploy/env/production.env.example -f deploy/docker-compose.prod.yml config
```

Expected: valid Nginx configuration and no production MySQL port.

- [ ] **Step 5: Commit**

```powershell
git add deploy/nginx deploy/tests deploy/docker-compose.prod.yml
git commit -m "feat: add TLS proxy and edge security policy"
```

### Task 3: Encrypted backup and non-destructive restore drill

**Files:**
- Create: `deploy/backup/Dockerfile`
- Create: `deploy/backup/backup.sh`
- Create: `deploy/backup/restore.sh`
- Create: `deploy/systemd/ordering-backup.service`
- Create: `deploy/systemd/ordering-backup.timer`
- Create: `deploy/tests/backup-restore.ps1`
- Create: `docs/runbooks/backup-restore.md`
- Modify: `deploy/docker-compose.prod.yml`

**Interfaces:**
- Produces: verified daily SQL dump, encrypted Restic snapshot containing SQL and media, 7 daily/4 weekly retention, and explicit restore into a new target.

- [ ] **Step 1: Write the failing disposable restore test**

The test seeds a category, dish, user list, dish image, and avatar fixture in the test stack; runs backup; restores to a new database named `ordering_restore_test` and a newly created temporary media directory; then compares row counts, snapshot values, and SHA-256 file hashes. It refuses a restore target that already exists.

- [ ] **Step 2: Build a fixed backup runtime**

Use a small Debian image with MySQL 8.4 client, Restic, `gzip`, `sha256sum`, and CA certificates. Run as a dedicated non-root UID. Mount database credentials as environment/secrets, media read-only, a local backup directory read-write, and Restic credentials through required environment variables.

- [ ] **Step 3: Implement safe backup sequencing**

```bash
set -euo pipefail
umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${BACKUP_LOCAL_ROOT:?}/db/${stamp}.sql.gz"
mkdir -p -- "$(dirname -- "$target")"
mysqldump --single-transaction --quick --routines=false --triggers=true \
  -h mysql -u "${MYSQL_USER:?}" "${MYSQL_DATABASE:?}" | gzip -9 > "${target}.partial"
gzip -t "${target}.partial"
mv -- "${target}.partial" "$target"
restic backup "$target" /media/dishes /media/avatars --tag ordering-daily
restic forget --keep-daily 7 --keep-weekly 4 --prune
```

The actual script supplies `MYSQL_PWD` without printing it, verifies non-empty dump size, records a checksum manifest, and exits nonzero on dump, upload, or retention failure. After validating `BACKUP_LOCAL_ROOT` resolves beneath `/var/backups/ordering`, it removes local `.sql.gz` and checksum files older than 7 days; weekly retention is provided by the encrypted Restic repository.

- [ ] **Step 4: Implement refusal-first restore**

`restore.sh` requires `--snapshot`, `--target-database`, and `--target-media-root`. It validates the media target is an absolute empty directory that is not `/`, `/var`, `/var/lib`, the production upload root, or a symlink. It creates only the named non-production database, restores SQL, restores media to the empty directory, and runs row-count/checksum verification. It never drops a database or overwrites production files.

- [ ] **Step 5: Add the daily timer and run the restore test**

The timer runs daily at 03:20 with `RandomizedDelaySec=900` and `Persistent=true`. The service reports failure to the journal and the health check observes the backup result marker.

Run: `pwsh deploy/tests/backup-restore.ps1`

Expected: restored data matches and an existing target is rejected.

- [ ] **Step 6: Document recovery and commit**

Document finding snapshots, restoring into a disposable location, validating before cutover, rotating Restic/object-storage credentials, and the monthly restore drill record.

```powershell
git add deploy/backup deploy/systemd deploy/tests/backup-restore.ps1 docs/runbooks/backup-restore.md deploy/docker-compose.prod.yml
git commit -m "feat: add encrypted backups and verified restore"
```

### Task 4: Deployment, health monitoring, and rollback

**Files:**
- Create: `deploy/scripts/deploy.sh`
- Create: `deploy/scripts/rollback.sh`
- Create: `deploy/scripts/health-check.sh`
- Create: `deploy/systemd/ordering-health.service`
- Create: `deploy/systemd/ordering-health.timer`
- Create: `deploy/systemd/ordering-maintenance.service`
- Create: `deploy/systemd/ordering-maintenance.timer`
- Create: `deploy/logrotate/ordering`
- Create: `docs/runbooks/production.md`
- Test: `deploy/tests/deploy-smoke.ps1`

**Interfaces:**
- Produces: repeatable migration/start/verify deployment, prior-image rollback, and five-minute service/disk/certificate/backup checks.

- [ ] **Step 1: Write a smoke test around a disposable production-like stack**

Assert `/api/v1/health` returns 200, `/admin/login` renders, MySQL is unreachable on host port 3306, dish media survives a server-container recreation, and an invalid image tag leaves the old service running.

- [ ] **Step 2: Implement deployment with preflight and health gate**

```bash
set -euo pipefail
test -n "${APP_IMAGE:?}"
docker compose --env-file "$ENV_FILE" -f deploy/docker-compose.prod.yml config >/dev/null
docker compose --env-file "$ENV_FILE" -f deploy/docker-compose.prod.yml run --rm backup /opt/ordering/backup.sh
docker compose --env-file "$ENV_FILE" -f deploy/docker-compose.prod.yml pull
docker compose --env-file "$ENV_FILE" -f deploy/docker-compose.prod.yml run --rm server npx prisma migrate deploy
docker compose --env-file "$ENV_FILE" -f deploy/docker-compose.prod.yml up -d --remove-orphans
curl --fail --retry 12 --retry-delay 5 "https://${APP_DOMAIN:?}/api/v1/health"
```

Before changing services, record the current image digest in a timestamped deployment record. If migration or health verification fails, keep logs and invoke rollback only for the application image; never auto-reverse a database migration.

- [ ] **Step 3: Implement explicit rollback**

`rollback.sh` requires a previously recorded image digest, verifies it exists locally or in the registry, sets only `APP_IMAGE`, recreates the server, checks health, and writes a rollback record. It refuses an empty digest and does not modify MySQL or media volumes.

- [ ] **Step 4: Implement health, disk, certificate, and backup checks**

Every five minutes check HTTPS health, container health, root/data filesystem usage under 80%, certificate expiry over 21 days, last successful backup under 30 hours, and failed systemd units. Exit nonzero and log a one-line reason. Configure the cloud provider’s monitoring agent to alert on this unit failure plus CPU, memory, and disk thresholds; do not embed a third-party webhook credential in the repository.

Add a daily 04:10 maintenance timer that executes the compiled `cleanup-uploads` command inside the server container. The service is one-shot, has a 10-minute timeout, records the number deleted/failed, and never scans or deletes outside the configured upload root.

- [ ] **Step 5: Add log rotation and production runbook**

Retain 14 compressed daily application/Nginx log files with restrictive permissions. Document Ubuntu updates, Docker installation from the official repository, cloud firewall rules, SSH keys, production environment creation, secret generation with `openssl rand -base64 48`, Argon2id admin hash generation, initial migration, TLS bootstrap, timers, logs, upgrades, and rollback.

- [ ] **Step 6: Run smoke test and commit**

```powershell
pwsh deploy/tests/deploy-smoke.ps1
git add deploy/scripts deploy/systemd deploy/logrotate docs/runbooks/production.md deploy/tests/deploy-smoke.ps1
git commit -m "ops: add deployment monitoring and rollback"
```

### Task 5: Continuous verification without automatic production mutation

**Files:**
- Create: `.github/workflows/verify.yml`
- Create: `deploy/tests/no-secrets.ps1`
- Modify: `.gitignore`

**Interfaces:**
- Produces: pull-request/main verification for server, Mini Program, container build, Compose policy, and secret scanning; it does not deploy.

- [ ] **Step 1: Write the workflow with least privilege**

Use `contents: read`, Node 24, Corepack, frozen pnpm install, a MySQL 8.4 service, cached pnpm store, `pnpm verify:server`, `pnpm verify:miniapp`, production image build, Compose policy, and Nginx policy. Do not grant write, package-publish, cloud, SSH, or deployment permissions.

- [ ] **Step 2: Add repository secret-pattern checks**

The script fails tracked files containing a real-looking WeChat AppSecret assignment, database URL with password, private key block, Restic password, AWS secret access key, bearer token, or `.env.production`. Allow only variable names and obviously non-secret test fixtures scoped to test files.

- [ ] **Step 3: Run locally and commit**

```powershell
pwsh deploy/tests/no-secrets.ps1
pnpm verify:server
pnpm verify:miniapp
docker build -f apps/server/Dockerfile -t ordering-server:ci .
git add .github/workflows/verify.yml deploy/tests/no-secrets.ps1 .gitignore
git commit -m "ci: verify applications and production policy"
```

### Task 6: Domain, filing, privacy, trial upload, and formal release

**Files:**
- Create: `docs/checklists/release.md`
- Create: `docs/checklists/monthly-operations.md`
- Modify: `apps/miniapp/src/config.ts`
- Modify: `apps/miniapp/project.config.json`
- Modify: `docs/runbooks/production.md`

**Interfaces:**
- Consumes: purchased resources, official filing results, production health, both application acceptance gates.
- Produces: filed production service, configured legal domain, reviewed privacy declaration, searchable Mini Program release, and repeatable monthly maintenance.

- [ ] **Step 1: Stop at the external-resource gate and collect evidence**

Do not fabricate or bypass this gate. Record evidence for: real-name-verified domain, mainland server public IP, completed ICP filing, Mini Program AppID for the personal subject, Mini Program filing result, selected service category shown in the current console, approved HTTPS certificate, and an S3-compatible off-server backup bucket. Secrets themselves are never copied into the checklist.

- [ ] **Step 2: Deploy production and prove recoverability before user traffic**

Create production secrets on the server, start HTTP ACME challenge, issue/install TLS, deploy, run migration, seed only administrator-owned example categories/dishes, enable backup/health timers, run one backup, and restore it into a disposable database/media path. Record health output, certificate dates, backup snapshot ID, and restore result.

- [ ] **Step 3: Replace example origins and configure WeChat domains**

Set `trial` and `release` in `apps/miniapp/src/config.ts` to the exact filed `https://` origin, set the real AppID only through ignored Developer Tools private configuration or authorized release configuration, and add the same origin to WeChat request/upload/download legal-domain lists. Keep URL validation enabled for trial and release builds.

- [ ] **Step 4: Complete privacy and content declarations**

Declare WeChat login identity matching, optional avatar, optional nickname, favorites, saved lists, retention, clearing, deletion, and operator contact using the exact data behavior implemented. Link the user-facing privacy page to the platform privacy contract. Confirm the administrator sees aggregates only and the application contains no transaction or fulfilment wording.

- [ ] **Step 5: Run the trial-version acceptance checklist**

On iOS and Android, with two WeChat accounts, verify login, onboarding save/skip, menu, search, favorite isolation, draft persistence, save/retry, snapshot, edit/copy/delete, clear data, account deletion/re-entry, HTTPS media, signed avatar expiry, server restart persistence, rate-limit messages, privacy contract, filing number display, and absence of sharing/payment/order/table/pickup features.

- [ ] **Step 6: Submit honestly and release only after approval**

Upload the verified commit, use screenshots and description matching the personal menu-list tool, select only a service category currently available to the personal subject and consistent with actual behavior, submit review, address review feedback without hiding functionality, then publish after approval. Confirm search visibility from an unrelated WeChat account.

- [ ] **Step 7: Establish monthly operations**

The monthly checklist records restore drill, certificate days remaining, disk usage, container health, dependency/security update review, filing/contact accuracy, WeChat policy/category changes, privacy behavior, and one real-device smoke test. Apply upgrades only through a separate approved change with backup and rollback.

- [ ] **Step 8: Commit release documentation and final production configuration**

```powershell
git add apps/miniapp/src/config.ts apps/miniapp/project.config.json docs/checklists docs/runbooks/production.md
git commit -m "docs: finalize production release controls"
```

## Production Plan Completion Gate

The project is complete only when:

- Both application verification commands and all deployment policy/smoke tests pass on the released commit.
- The domain and Mini Program filings are approved, HTTPS is valid, and the exact origin is configured in WeChat.
- MySQL is not publicly reachable; only 80/443 are public and SSH is key-only/restricted.
- A production backup has been restored successfully into a separate target, with database and media checks passing.
- Monitoring covers health, errors, disk, certificate, container state, and backup freshness.
- Privacy declarations match optional profile collection, private user data, aggregate-only administration, clearing, and deletion.
- The released Mini Program passes two-account iOS/Android acceptance, review approval, publication, and independent search discovery.
