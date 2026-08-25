# 「开饭啦」运维与上线实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为「开饭啦」建立可恢复备份、可回滚部署、健康监控，并把已验证镜像安全部署到专用阿里云 ECS。

**Architecture:** systemd 调用受控 Docker Compose 一次性任务完成备份、健康检查、证书续期和上传清理。生产镜像从本机经 SSH 传输到 ECS，更新前备份并记录旧镜像 ID，数据库迁移只向前执行，应用健康失败只回滚应用镜像。

**Tech Stack:** Alibaba Cloud Linux 3、Docker Engine/Compose v2、systemd、Nginx/Certbot、MySQL 8.4、Restic、Rclone S3 backend with provider `Alibaba`、阿里云 OSS、PowerShell 策略测试、Bash 运维脚本。

**Spec:** `docs/superpowers/specs/2026-08-25-kaifanla-production-deployment-design.md`

**Prerequisite Plan:** `docs/superpowers/plans/2026-08-25-kaifanla-production-runtime.md`

## Global Constraints

- ECS 为 `8.137.174.33`，系统 Alibaba Cloud Linux 3，地域 `cn-chengdu`，可用区 `cn-chengdu-a`。
- SSH 只使用 `C:\Users\17251\.ssh\ordering_aliyun_ed25519`；任何 SSH 加固前保持当前会话并从第二连接验证。
- 只在精确路径 `/swapfile`、`/opt/kaifanla`、`/var/lib/kaifanla`、`/var/backups/kaifanla` 和 `/etc/kaifanla` 创建或修改文件。
- 不删除或重建现有 MySQL、上传、证书或备份卷；恢复演练只能写入独立数据库和空目录。
- 真实秘密不显示到命令输出，不进入本地项目、镜像 history、日志或部署记录。
- 阿里云 OSS Bucket 保持私有，位于成都地域；RAM 用户权限仅覆盖指定 Bucket 的 `kaifanla/` 前缀。
- 每日备份保留 7 个日快照和 4 个周快照；超过 30 小时没有成功备份视为故障。
- 不执行任何 Git 命令；每个任务以验证结果作为检查点。

---

## File Map

```text
deploy/backup/Dockerfile                       MariaDB client、Restic、Rclone 运行时
deploy/backup/backup.sh                        一致性导出、加密快照、保留与 OSS 同步
deploy/backup/restore.sh                       拒绝覆盖生产目标的恢复脚本
deploy/tests/backup-restore.ps1                临时库与媒体恢复测试
deploy/scripts/bootstrap-host.sh               Swap、Docker、防火墙与目录基线
deploy/scripts/deploy.sh                       预检、备份、迁移、更新与健康门禁
deploy/scripts/rollback.sh                     仅应用镜像回滚
deploy/scripts/health-check.sh                 HTTPS、容器、磁盘、证书、备份检查
deploy/tests/deploy-smoke.ps1                  生产形态部署/回滚烟雾测试
deploy/systemd/kaifanla-backup.service         每日备份 one-shot
deploy/systemd/kaifanla-backup.timer           03:20 备份计划
deploy/systemd/kaifanla-health.service         五分钟健康检查
deploy/systemd/kaifanla-health.timer           健康计划
deploy/systemd/kaifanla-maintenance.service    上传清理
deploy/systemd/kaifanla-maintenance.timer      04:10 清理计划
deploy/systemd/kaifanla-cert-renew.service     证书续期
deploy/systemd/kaifanla-cert-renew.timer       每日两次证书检查
deploy/logrotate/kaifanla                      14 日日志轮转
docs/runbooks/production.md                    主机初始化、发布、诊断和回滚手册
docs/runbooks/backup-restore.md                备份与恢复演练手册
```

### Task 1: 加密备份与拒绝式恢复

**Files:**
- Create: `deploy/tests/backup-restore.ps1`
- Create: `deploy/backup/Dockerfile`
- Create: `deploy/backup/backup.sh`
- Create: `deploy/backup/restore.sh`
- Create: `docs/runbooks/backup-restore.md`
- Modify: `deploy/docker-compose.prod.yml`

**Interfaces:**
- Consumes: `mysql:3306`、只读 `/media`、可写 `/repo`、`RESTIC_PASSWORD`、OSS 配置环境变量。
- Produces: Restic snapshot ID、`/repo/status/latest-success`、同步到 `oss:${OSS_BUCKET}/${OSS_PREFIX}` 的加密仓库。

- [ ] **Step 1: 写恢复测试并证明其正确失败**

`deploy/tests/backup-restore.ps1` 启动隔离 Compose project `kaifanla_restore_test`，创建分类、菜品、用户清单、菜品图片和头像；运行备份后恢复到数据库 `ordering_restore_test` 和由测试创建的空目录。断言关键表行数、清单快照金额和两张图片 SHA-256 相同，并断言把目标指向非空目录或 `ordering` 时脚本拒绝执行。

```powershell
pwsh deploy/tests/backup-restore.ps1
```

Expected first result: 因 backup/restore 文件不存在而失败。

- [ ] **Step 2: 创建固定备份镜像**

使用固定摘要的 Alpine 基础镜像安装 `mariadb-client`、`bash`、`gzip`、`restic`、`rclone`、`coreutils` 和 CA 证书。创建 UID 10002 的 `backup` 用户，脚本归该用户所有，入口默认执行 `/opt/kaifanla/backup.sh`。构建后运行：

```powershell
docker run --rm kaifanla-backup:local sh -c 'mariadb-dump --version && restic version && rclone version'
```

Expected: 三个命令存在且版本输出无错误。

- [ ] **Step 3: 实现备份顺序**

`deploy/backup/backup.sh` 的安全骨架：

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${MYSQL_HOST:?MYSQL_HOST is required}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE is required}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"
: "${OSS_BUCKET:?OSS_BUCKET is required}"
: "${OSS_PREFIX:?OSS_PREFIX is required}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_dir="/repo/dumps"
target="${dump_dir}/${stamp}.sql.gz"
mkdir -p -- "$dump_dir" /repo/status
export MYSQL_PWD="$MYSQL_PASSWORD"
mariadb-dump --single-transaction --quick --skip-lock-tables \
  -h "$MYSQL_HOST" -u "$MYSQL_USER" "$MYSQL_DATABASE" | gzip -9 > "${target}.partial"
test -s "${target}.partial"
gzip -t "${target}.partial"
mv -- "${target}.partial" "$target"
sha256sum "$target" > "${target}.sha256"
restic snapshots >/dev/null 2>&1 || restic init
snapshot_id="$(restic backup "$target" /media --tag kaifanla-daily --json | awk -F'"' '/snapshot_id/{print $4}' | tail -n 1)"
test -n "$snapshot_id"
restic check
restic forget --keep-daily 7 --keep-weekly 4 --prune
rclone sync /repo "oss:${OSS_BUCKET}/${OSS_PREFIX}" --checkers 4 --transfers 2 --s3-no-check-bucket
printf '%s %s\n' "$stamp" "$snapshot_id" > /repo/status/latest-success.partial
mv -- /repo/status/latest-success.partial /repo/status/latest-success
find "$dump_dir" -type f -mtime +7 -name '*.sql.gz*' -delete
```

Rclone 只通过环境配置远端：`RCLONE_CONFIG_OSS_TYPE=s3`、`RCLONE_CONFIG_OSS_PROVIDER=Alibaba`、`RCLONE_CONFIG_OSS_ENDPOINT=https://oss-cn-chengdu-internal.aliyuncs.com`、AccessKey ID/Secret 和 `RCLONE_CONFIG_OSS_ACL=private`。脚本不启用 remote-control 服务。

- [ ] **Step 4: 实现拒绝式恢复**

`restore.sh` 要求 `--snapshot`、`--target-database`、`--target-media-root`。它拒绝目标数据库 `ordering`，拒绝 `/`、`/var`、`/var/lib`、`/var/lib/kaifanla/uploads`、符号链接和非空媒体目录；只允许匹配 `^ordering_restore_[a-z0-9_]+$` 的数据库。恢复前从 OSS 执行 `rclone copy` 到新的临时 Restic 仓库，运行 `restic check`，恢复 SQL 与媒体后输出行数和 SHA-256 校验结果，但不删除临时数据库。

- [ ] **Step 5: 运行红绿恢复测试**

```powershell
docker build -f deploy/backup/Dockerfile -t kaifanla-backup:local deploy/backup
pwsh deploy/tests/backup-restore.ps1
```

Expected: 正常恢复用例通过；生产数据库名、非空目录和危险路径均被拒绝。

- [ ] **Step 6: 编写恢复手册**

手册包含列出 OSS 对象、同步加密仓库、选择 snapshot、恢复到隔离数据库/目录、核对行数与文件哈希、人工决定切换、清理隔离目标、轮换 Restic/RAM 凭据和每月恢复演练记录格式。

### Task 2: 可回滚部署脚本

**Files:**
- Create: `deploy/tests/deploy-smoke.ps1`
- Create: `deploy/scripts/deploy.sh`
- Create: `deploy/scripts/rollback.sh`
- Modify: `deploy/docker-compose.prod.yml`

**Interfaces:**
- Consumes: `/opt/kaifanla/images/*.tar.gz`、`/etc/kaifanla/production.env`、当前 Compose project。
- Produces: `/var/lib/kaifanla/deployments/*.record`、健康的新应用或保持原应用运行的失败状态。

- [ ] **Step 1: 写部署失败保留旧服务的测试**

烟雾测试先启动可用旧镜像并记录健康，然后把 `APP_IMAGE` 指向不存在的镜像执行部署。断言部署退出非零、旧容器仍健康、MySQL 卷未改变。再加载新镜像，断言健康接口 200、管理登录页可渲染、宿主 3306 无监听、重建 server 后测试图片仍存在。

```powershell
pwsh deploy/tests/deploy-smoke.ps1
```

Expected first result: 因部署脚本不存在而失败。

- [ ] **Step 2: 实现部署脚本的拒绝式预检**

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077
APP_ROOT=/opt/kaifanla
ENV_FILE=/etc/kaifanla/production.env
COMPOSE_FILE="$APP_ROOT/deploy/docker-compose.prod.yml"
test "$(id -u)" -eq 0
test -f "$ENV_FILE"
test "$(stat -c '%a' "$ENV_FILE")" = 600
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/dev/null
```

脚本在现有健康服务上先运行 backup service；记录当前 server image ID；确认新 runtime/tooling/backup 镜像都已加载；运行一次性 tooling migration；再 `up -d` 更新 server/nginx。外部健康检查使用 `curl --fail --retry 12 --retry-delay 5 https://api.guziyi.cn/api/v1/health`。

- [ ] **Step 3: 实现只回滚应用镜像**

`rollback.sh` 只接受部署记录中的完整 `sha256:` image ID。它验证镜像本地存在，把临时环境覆盖限制为 `APP_IMAGE`，只重建 `server`，检查 HTTPS 健康并写入回滚记录；不运行逆向迁移，不操作 MySQL、媒体、证书或备份卷。

- [ ] **Step 4: 运行部署烟雾测试至通过**

```powershell
pwsh deploy/tests/deploy-smoke.ps1
```

Expected: 不存在镜像不会替换健康服务；有效镜像更新成功；应用回滚不改变数据库和媒体。

### Task 3: 健康、维护、证书与日志任务

**Files:**
- Create: `deploy/scripts/health-check.sh`
- Create: `deploy/systemd/kaifanla-backup.service`
- Create: `deploy/systemd/kaifanla-backup.timer`
- Create: `deploy/systemd/kaifanla-health.service`
- Create: `deploy/systemd/kaifanla-health.timer`
- Create: `deploy/systemd/kaifanla-maintenance.service`
- Create: `deploy/systemd/kaifanla-maintenance.timer`
- Create: `deploy/systemd/kaifanla-cert-renew.service`
- Create: `deploy/systemd/kaifanla-cert-renew.timer`
- Create: `deploy/logrotate/kaifanla`
- Create: `docs/runbooks/production.md`

**Interfaces:**
- Consumes: HTTPS endpoint、Compose 容器健康、证书、备份状态文件、磁盘指标。
- Produces: 可被 systemd 与阿里云云监控观察的退出码和单行原因。

- [ ] **Step 1: 实现健康检查脚本并逐个制造失败**

脚本必须检查：HTTPS 200、所有核心容器健康、根分区与 `/var/lib/kaifanla` 使用率低于 80%、证书剩余超过 21 天、`latest-success` 小于 30 小时、无失败 systemd 单元。测试依次传入不可达 URL、伪造 81% 磁盘结果、过期证书和旧时间戳，确认每个分支退出非零并只输出一行无秘密原因。

- [ ] **Step 2: 添加 systemd units 与 timers**

计划时间固定为：

```ini
# backup timer
OnCalendar=*-*-* 03:20:00
RandomizedDelaySec=15m
Persistent=true

# health timer
OnBootSec=5m
OnUnitActiveSec=5m

# maintenance timer
OnCalendar=*-*-* 04:10:00
Persistent=true

# certificate timer
OnCalendar=*-*-* 02,14:35:00
RandomizedDelaySec=20m
Persistent=true
```

每个 service 使用 `Type=oneshot`、明确 `TimeoutStartSec`，从 `/etc/kaifanla/production.env` 读取环境；备份最长 60 分钟、维护 10 分钟、健康 2 分钟、证书续期 15 分钟。

- [ ] **Step 3: 配置日志轮转**

`deploy/logrotate/kaifanla` 每日轮转 `/var/log/kaifanla/*.log`，保留 14 份、压缩、`missingok`、`notifempty`、权限 `0640 root root`。Docker daemon 配置 `json-file` 驱动、`max-size=10m`、`max-file=5`。

- [ ] **Step 4: 编写生产手册并验证 units**

手册给出初始化、环境文件创建、镜像加载、TLS bootstrap、首次部署、查看日志、手工备份、恢复演练、升级、回滚和 SSH 解锁步骤。使用临时根目录或容器执行 `systemd-analyze verify deploy/systemd/*.service deploy/systemd/*.timer`；全部 unit 无语法错误。

### Task 4: 外部 DNS 与 OSS 资源关卡

**Files:**
- Modify: `DEPLOYMENT.md`
- Create: `docs/checklists/production-resources.md`

**Interfaces:**
- Consumes: 阿里云控制台资源所有者权限。
- Produces: 可解析的 `api.guziyi.cn`、私有成都 OSS Bucket、最小权限 RAM 凭据。

- [ ] **Step 1: 创建 DNS A 记录并验证**

控制台记录：主机记录 `api`、类型 `A`、值 `8.137.174.33`、TTL 600 秒。验证：

```powershell
Resolve-DnsName api.guziyi.cn -Type A
```

Expected: 至少一个 A 记录精确返回 `8.137.174.33`。

- [ ] **Step 2: 创建私有 OSS Bucket**

在 `cn-chengdu` 创建全局唯一名称的 Standard 私有 Bucket，开启服务端加密、版本控制和阻止公共访问；生命周期只清理 30 天前的非当前对象版本，不删除当前 `kaifanla/` 备份对象。

- [ ] **Step 3: 创建最小权限 RAM 用户**

策略只允许目标 Bucket 的 `kaifanla/` 前缀执行列举、读取、写入和删除同步所需对象；不授予其他 Bucket、ECS、RAM 或账户管理权限。AccessKey 只写入服务器 `0600` 环境文件，不粘贴到聊天或项目。

- [ ] **Step 4: 从 ECS 验证 OSS**

在受控环境中运行：

```bash
rclone lsd oss:"${OSS_BUCKET}" --s3-no-check-bucket
rclone copyto /etc/hostname oss:"${OSS_BUCKET}/${OSS_PREFIX}/connectivity/hostname" --s3-no-check-bucket
rclone cat oss:"${OSS_BUCKET}/${OSS_PREFIX}/connectivity/hostname" --s3-no-check-bucket | cmp - /etc/hostname
```

Expected: 列举、上传、下载校验均成功；Bucket 公开 URL 在未授权请求下返回拒绝。

### Task 5: ECS 主机基线

**Files:**
- Create: `deploy/scripts/bootstrap-host.sh`
- Modify: `docs/runbooks/production.md`

**Interfaces:**
- Consumes: 全新 Alibaba Cloud Linux 3 专用实例。
- Produces: 2 GiB Swap、Docker/Compose、firewalld、受限目录和开机自启服务。

- [ ] **Step 1: 编写可重复运行的 bootstrap 脚本**

脚本先断言 `ID=alinux`、根盘至少 8 GiB 可用、目标路径是精确绝对路径；然后：

```bash
if ! swapon --show=NAME --noheadings | grep -qx '/swapfile'; then
  test ! -e /swapfile
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab
printf '%s\n' 'vm.swappiness=10' > /etc/sysctl.d/90-kaifanla-swap.conf
sysctl --system >/dev/null
```

安装 Docker CE、Compose plugin 与 firewalld，启用开机启动；创建 `/opt/kaifanla`、`/var/lib/kaifanla/uploads`、`/var/backups/kaifanla`、`/etc/kaifanla`、`/var/log/kaifanla`，分别设置最小权限。脚本不修改其他应用目录。

- [ ] **Step 2: 在执行前做只读预检**

通过 SSH 重新确认系统版本、磁盘、内存、现有 `/swapfile`、Docker、80/443/3306 监听和目标目录。若发现既有服务或数据，停止并重新评估，不覆盖。

- [ ] **Step 3: 执行 bootstrap 并验证幂等**

先运行一次，再运行第二次。验证：

```bash
swapon --show
sysctl vm.swappiness
docker version
docker compose version
systemctl is-enabled docker firewalld
firewall-cmd --list-services
```

Expected: `/swapfile` 为 2 GiB、swappiness 10、Docker/Compose 可用、第二次运行不创建第二个 Swap 或改变数据目录。

- [ ] **Step 4: 加固 SSH**

在保持当前 root 会话的同时，新建第二个专用密钥连接。先用 `sshd -t` 验证配置，再禁用 `PasswordAuthentication`，重载 sshd，并从第三个新连接验证成功后才关闭旧会话。安全组 SSH 来源收紧必须保留当前公网 IP 或可用 Workbench 恢复入口。

### Task 6: 首次生产部署与 TLS

**Files:**
- Runtime bundle from prerequisite plan
- Server paths under `/opt/kaifanla` and `/etc/kaifanla`

**Interfaces:**
- Consumes: 已验证镜像、DNS、生产环境、空 MySQL 卷。
- Produces: `https://api.guziyi.cn` 健康服务和可登录管理后台。

- [ ] **Step 1: 安全生成生产环境**

在服务器交互式创建 `/etc/kaifanla/production.env`，权限 `0600`。使用 `openssl rand -base64 48 | tr -d '\n'` 分别生成数据库密码、三个应用密钥和 Restic 密码；微信 AppSecret 与管理员 Argon2id 哈希通过加密 SCP 传入临时 `0600` 文件并立即合并，不显示值。随后只输出每个变量“已配置/未配置”。

- [ ] **Step 2: 上传并加载镜像与部署文件**

本地执行 `docker save` 后 gzip，使用专用 SSH 密钥 SCP 到 `/opt/kaifanla/images/`；服务器校验 SHA-256 后 `docker load`。上传 Compose、Nginx、脚本和 systemd 文件，不上传源码、`.env` 或私钥。

- [ ] **Step 3: 签发首张证书**

只启动 `nginx-bootstrap`，从公网验证 ACME challenge 路径可达，再运行 certbot 为 `api.guziyi.cn` 签发证书。证书文件存在且 `openssl x509 -checkend 86400` 成功后停止 bootstrap，启动正式 Nginx。

- [ ] **Step 4: 迁移、种子与启动**

启动 MySQL 并等健康，运行 tooling 镜像执行 `prisma migrate deploy`。空数据库执行现有幂等种子一次，导入项目自带家常菜分类、菜品与图片。随后启动 server/nginx，不把未健康服务开放给小程序。

- [ ] **Step 5: 生产烟雾验证**

```bash
curl --fail https://api.guziyi.cn/api/v1/health
curl --fail --head https://api.guziyi.cn/admin/login
ss -lntup
docker compose --env-file /etc/kaifanla/production.env -f /opt/kaifanla/deploy/docker-compose.prod.yml ps
```

Expected: HTTPS 健康 200、管理员页面成功、宿主无 3000/3306 监听、核心容器健康。

### Task 7: 首次备份恢复与定时任务启用

**Files:**
- All backup/systemd files from Tasks 1 and 3

**Interfaces:**
- Consumes: 已运行的生产数据库、媒体卷和 OSS。
- Produces: 可验证的 OSS snapshot、隔离恢复结果、启用的 timers。

- [ ] **Step 1: 执行首次备份**

手工启动 `kaifanla-backup.service`，确认 `latest-success` 时间与 snapshot ID 更新，OSS 前缀包含加密仓库对象。

- [ ] **Step 2: 从 OSS 完整恢复到隔离目标**

目标数据库命名 `ordering_restore_launch`，媒体目录使用新建空目录 `/var/lib/kaifanla/restore-launch-media`。运行恢复脚本，比较关键表行数与媒体 SHA-256；不把恢复目标切换为生产。

- [ ] **Step 3: 启用并验证 timers**

```bash
systemctl enable --now kaifanla-backup.timer kaifanla-health.timer kaifanla-maintenance.timer kaifanla-cert-renew.timer
systemctl list-timers 'kaifanla-*'
systemctl start kaifanla-health.service
systemctl --failed
```

Expected: 四个 timer 有下一次触发时间，手工健康检查成功，无失败 unit。

- [ ] **Step 4: 完成运维交付记录**

`DEPLOYMENT.md` 只记录镜像 ID、证书起止日期、首次备份 snapshot ID、恢复通过时间、timer 状态和管理后台 URL；秘密值和 OSS AccessKey 不记录。
