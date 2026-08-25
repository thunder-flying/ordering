# 「开饭啦」上线执行索引

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. This index is authoritative when it conflicts with an earlier plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 锁定「开饭啦」生产上线的执行顺序，并保证 OSS 只接收 Restic 加密仓库，不接收原始数据库导出。

**Architecture:** 先完成本地生产运行时，再完成 ECS 运维与部署，最后发布微信小程序。运维补强计划嵌入对应主任务；本文件中的备份边界替换运维主计划的备份同步片段。

**Tech Stack:** Next.js 16、Docker Compose、MySQL 8.4、Nginx、Restic、Rclone、Alibaba Cloud Linux 3、OSS、微信小程序。

**Spec:** `docs/superpowers/specs/2026-08-25-kaifanla-production-deployment-design.md`

## Global Constraints

- `docs/superpowers/plans/2026-08-19-personal-menu-deployment.md` 是历史计划，不用于本次上线。
- 本索引明确覆盖的片段优先于 `2026-08-25-kaifanla-operations-and-deployment.md`。
- OSS 中只允许出现 Restic 加密仓库对象；不允许出现 `.sql`、`.sql.gz`、上传图片原文件或明文清单。
- 不执行任何 Git 命令。

---

## 执行顺序

- [ ] **Stage 1: 生产运行时**

完整执行 `docs/superpowers/plans/2026-08-25-kaifanla-production-runtime.md`。所有应用、Compose 和 Nginx 门禁通过后才能进入 Stage 2。

- [ ] **Stage 2: 运维代码、外部资源与 ECS 部署**

执行 `docs/superpowers/plans/2026-08-25-kaifanla-operations-and-deployment.md`，同时强制应用 `docs/superpowers/plans/2026-08-25-kaifanla-operations-supplement.md`：

- 主计划 Task 4 同时执行补强计划 Task 2。
- 主计划 Task 5 同时执行补强计划 Task 1。
- 主计划 Task 6 Step 1 之前执行补强计划 Task 3。
- 主计划 Task 1 Step 3 使用下方“加密仓库边界”替换代码。

- [ ] **Stage 3: 小程序体验、审核与发布**

只有 Stage 2 的 HTTPS、恢复演练和 timers 全部通过后，才执行 `docs/superpowers/plans/2026-08-25-kaifanla-miniapp-release.md`。

## 加密仓库边界：替换运维主计划 Task 1 Step 3

**Files:**
- Modify: `deploy/backup/backup.sh`
- Modify: `deploy/docker-compose.prod.yml`
- Test: `deploy/tests/backup-restore.ps1`

**Interfaces:**
- Consumes: tmpfs `/work`、持久加密仓库 `/repo/restic`、状态目录 `/repo/status`、只读媒体 `/media`。
- Produces: OSS `kaifanla/restic/` 下的 Restic 加密对象；不产生远端原始 SQL 或媒体对象。

- [ ] **Step 1: 先扩展失败测试**

备份恢复测试在执行备份后列出模拟 OSS 对象，断言：

```powershell
$remoteObjects | Should -Not -Match '\.sql(?:\.gz)?$'
$remoteObjects | Should -Not -Match '/media/'
$remoteObjects | Should -Match 'config$'
$remoteObjects | Should -Match 'snapshots/'
```

Expected: 在错误的 `rclone sync /repo` 实现下测试失败，因为远端包含 `dumps/*.sql.gz`。

- [ ] **Step 2: 使用严格分离的工作区、仓库和状态目录**

`deploy/docker-compose.prod.yml` 为 backup service 设置：

```yaml
read_only: true
tmpfs:
  - /work:size=256m,mode=0700,uid=10002,gid=10002
volumes:
  - backup-repository:/repo
  - uploads:/media:ro
environment:
  RESTIC_REPOSITORY: /repo/restic
```

原始导出只存在于 tmpfs `/work`，加密仓库位于持久卷 `/repo/restic`，状态位于 `/repo/status`。

- [ ] **Step 3: 使用以下安全备份核心替换旧片段**

```bash
set -euo pipefail
umask 077
work_dir=/work/dumps
repo_dir=/repo/restic
status_dir=/repo/status
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${work_dir}/${stamp}.sql.gz"
mkdir -p -- "$work_dir" "$repo_dir" "$status_dir"
cleanup() { rm -f -- "${target}.partial" "$target" "${target}.sha256"; }
trap cleanup EXIT

export RESTIC_REPOSITORY="$repo_dir"
export MYSQL_PWD="${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
mariadb-dump --single-transaction --quick --skip-lock-tables \
  -h "${MYSQL_HOST:?MYSQL_HOST is required}" \
  -u "${MYSQL_USER:?MYSQL_USER is required}" \
  "${MYSQL_DATABASE:?MYSQL_DATABASE is required}" | gzip -9 > "${target}.partial"
test -s "${target}.partial"
gzip -t "${target}.partial"
mv -- "${target}.partial" "$target"
sha256sum "$target" > "${target}.sha256"

restic snapshots >/dev/null 2>&1 || restic init
summary="$(restic backup "$target" /media --tag kaifanla-daily --json)"
snapshot_id="$(printf '%s\n' "$summary" | awk -F'"' '/snapshot_id/{print $4}' | tail -n 1)"
test -n "$snapshot_id"
restic check
restic forget --keep-daily 7 --keep-weekly 4 --prune
rclone sync "$repo_dir" \
  "oss:${OSS_BUCKET:?OSS_BUCKET is required}/${OSS_PREFIX:?OSS_PREFIX is required}/restic" \
  --checkers 4 --transfers 2 --s3-no-check-bucket
printf '%s %s\n' "$stamp" "$snapshot_id" > "${status_dir}/latest-success.partial"
mv -- "${status_dir}/latest-success.partial" "${status_dir}/latest-success"
```

- [ ] **Step 4: 验证加密边界与可恢复性**

```powershell
pwsh deploy/tests/backup-restore.ps1
```

Expected: 数据库和媒体从 Restic/OSS 恢复成功；远端对象只包含 Restic 的 `config`、`data`、`index`、`keys`、`locks` 和 `snapshots` 结构，不含原始 SQL、图片或状态文件。

## 总完成门禁

- Stage 1 所有代码与容器门禁通过。
- Stage 2 完成 HTTPS、数据库隔离、镜像回滚、OSS 加密备份、隔离恢复、云监控和 timers。
- Stage 3 完成平台名称/域名/隐私配置、双账号双平台体验、审核和用户授权发布。
- 部署记录只含非敏感证据；任何秘密值均未进入工作区或工具输出。
