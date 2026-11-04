# 「今日饭单」多项目自动发布 Implementation Plan

> **For agentic workers:** Implement tasks in order. Do not execute `git add`, `git stage`, or a commit without explicit user instruction.

**Goal:** 在重装后的 Ubuntu 22.04 服务器上部署「今日饭单」，与其他项目共享一个 HTTPS 入口，并建立可重复、可回滚的 CI 发布流程。

**Architecture:** 共用边缘代理单独运行；此项目的 MySQL 与 Next.js 使用独立 Compose 项目和数据卷。CI 校验并构建以提交 SHA 标识的镜像，服务器只拉取/加载镜像、迁移、运行和验收。旧生产环境原样保留至迁移完成。

**Tech Stack:** Next.js 16、Node.js 24、pnpm 11、MySQL 8.4、Prisma 7、Docker Compose、Caddy 或经确认的共用入口、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-11-04-ordering-multi-project-deployment-design.md`

## Global Constraints

- 旧部署记录仅描述重装前的 `8.137.174.33`；现有 `deploy/docker-compose.prod.yml`、`deploy/scripts/update-server.ps1` 不参与新环境部署。
- 新服务器地址、域名和发布触发条件从实际资源与用户答复获取，不用旧值作默认。
- MySQL 3306 和应用 3000 不暴露公网；共用入口独占 80/443。
- 数据库迁移只向前执行；自动回滚只回滚应用镜像。
- 生产密钥不进入仓库、镜像层、CI 输出或聊天记录。
- 不执行 `git add` 或等价暂存操作；仅在明确要求时提交。

## Review Focus

1. 服务器无法连接 GHCR：发布应在替代镜像传输路径上继续，且保持同一 SHA 标识。
2. 新服务器已有其他服务占用 80/443：入口启动应先失败并报告冲突，不能重启其他项目。
3. 数据库迁移成功但应用更新失败：回滚旧应用镜像且保留数据，记录不自动逆向迁移。
4. 域名尚未解析或证书未签发：不得把小程序生产地址切到新域名。
5. 空库和上传卷需要初始化：不能把旧生产数据仍在服务器上作为前提。

---

### Task 1: 锁定入口方案与资源参数

**Files:**
- Modify: `docs/superpowers/specs/2026-11-04-ordering-multi-project-deployment-design.md`
- Modify: `DEPLOYMENT.md`

- [ ] **Step 1:** 将已确认的 Ubuntu 22.04、2 vCPU、2 GiB、`8.137.174.33`、`root:22`、`ordering.guziyi.cn`、共用 Caddy、`main` 自动发布、空库初始化和 OSS 写入设计文档；补齐磁盘与 DNS 权限。
- [ ] **Step 2:** 核查目标服务器 SSH 主机指纹；只用经过验证的密钥执行只读检查，记录 Docker/Compose、内存、磁盘、端口、GHCR 可达性和当前服务。
- [ ] **Step 3:** 在 `DEPLOYMENT.md` 记录新环境的非敏感资源及验收基线；检查不包含口令、令牌或私钥。

### Task 2: 新环境容器与共用入口

**Files:**
- Create: `deploy/next/compose.yaml`（新项目的 MySQL、server、tooling 和网络）
- Create: `deploy/next/edge/compose.yaml`（整机共用入口）
- Create: `deploy/next/edge/Caddyfile`（导入项目站点配置）
- Create: `deploy/next/edge/sites/ordering.caddy`（本项目域名路由）
- Create: `deploy/next/env.example`（非敏感必填变量名）
- Test: `deploy/next/tests/compose-policy.sh`

- [ ] **Step 1:** 写部署策略测试，断言数据库和应用不发布宿主机端口、使用独立持久卷与健康检查、入口仅发布 80/443、域名非空、镜像必须带 SHA 或摘要；运行测试并确认针对当前缺失文件失败。
- [ ] **Step 2:** 创建新环境 Compose、入口和示例环境文件；复用当前 `apps/server/Dockerfile`，保持 MySQL/上传卷的持久化与只读运行时。
- [ ] **Step 3:** 执行 `docker compose --env-file <临时测试环境> -f deploy/next/compose.yaml config` 和入口 Compose 的 `config`，再运行策略测试；检查展开结果无秘密输出且端口/网络符合设计。
- [ ] **Step 4:** 使用目标版本的 Caddy 镜像验证 Caddyfile 语法；核对 `/api/v1`、`/admin`、`/media`、上传限制与安全响应头。

### Task 3: 镜像构建与 CI 发布

**Files:**
- Create: `.github/workflows/verify.yml`
- Create: `.github/workflows/release.yml`
- Create: `deploy/next/scripts/release.sh`
- Test: `deploy/next/tests/release-policy.sh`

- [ ] **Step 1:** 写发布脚本测试，覆盖缺失变量、非法镜像标记、无旧镜像、更新失败、健康失败与回滚；先确认测试失败。
- [ ] **Step 2:** 创建验证工作流，安装 Node/pnpm，执行 `pnpm run verify:server` 和 `pnpm run verify:miniapp`；锁定触发分支为实际仓库分支。
- [ ] **Step 3:** 创建发布工作流，使用用户选定的手动或分支触发方式；构建应用与 tooling 镜像，以完整提交 SHA 标记并发布到 GHCR 或传输归档，记录摘要。
- [ ] **Step 4:** 实现服务器发布脚本：验证环境与镜像、备份、迁移、更新、HTTPS 健康检查、记录结果与应用镜像回滚；发布时不得更新或重启共用入口、其他项目及其卷。
- [ ] **Step 5:** 运行脚本测试、`bash -n`、工作流 YAML 校验和 Docker 构建；查看完整输出后修正失败。

### Task 4: 数据、备份与回滚

**Files:**
- Create: `deploy/next/scripts/backup.sh`
- Create: `deploy/next/scripts/restore-check.sh`
- Create: `deploy/next/scripts/rollback.sh`
- Test: `deploy/next/tests/data-policy.sh`
- Modify: `DEPLOYMENT.md`

- [ ] **Step 1:** 写备份与恢复策略测试，覆盖数据库导出失败、上传卷缺失、目标非空/生产路径拒绝、备份校验失败；先确认失败。
- [ ] **Step 2:** 实现数据库与上传卷备份、受限权限、保留策略和异地复制配置；恢复脚本仅对独立目标运行。
- [ ] **Step 3:** 实现按上一个 SHA 或显式 SHA 回滚应用镜像的脚本，明确迁移不逆转。
- [ ] **Step 4:** 本地用独立测试库和临时上传目录执行一次备份/恢复演练；记录校验结果与实测命令。

### Task 5: 新服务器上线与微信切换

**Files:**
- Modify: `apps/miniapp/src/config.ts`（仅在域名确定并可用后）
- Modify: `DEPLOYMENT.md`

- [ ] **Step 1:** 安装 Docker/Compose 和共用入口，创建专用部署账号、受限生产环境文件与网络；核验公网仅开放 80/443/SSH。
- [ ] **Step 2:** 启动空 MySQL、执行迁移并创建上传卷；确认是否导入项目自带菜单种子。
- [ ] **Step 3:** 完成首次镜像发布；检查 HTTPS 健康、后台页面及全部静态资源、API、图片、持久卷和证书。
- [ ] **Step 4:** 模拟一次失败发布并验证旧镜像回滚、其他项目不受影响；执行独立备份恢复验证。
- [ ] **Step 5:** DNS 切换和微信合法域名配置后修改小程序生产 API 地址，运行小程序类型检查/测试，在真机验证再发布微信版本。
- [ ] **Step 6:** 记录新服务器当前 SHA、镜像摘要、备份/恢复时间、健康与告警状态及回滚命令；用实际证据逐项核对验收标准。
