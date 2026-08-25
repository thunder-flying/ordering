# 「开饭啦」生产运行时实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成并验证可在阿里云 ECS 上安全运行的「开饭啦」Next.js、MySQL 8.4 与 Nginx Docker Compose 运行时。

**Architecture:** Windows 本机完成全部测试和多阶段镜像构建，ECS 只加载并运行镜像。Nginx 是唯一公网应用入口，Next.js 与 MySQL 仅通过内部 Docker 网络通信，数据库和上传文件使用独立持久卷。

**Tech Stack:** 原生微信小程序、TypeScript、Vitest、Next.js 16 standalone、Node.js 24、Prisma 7、MySQL 8.4、Docker 29/Compose v2、Nginx、Certbot。

**Spec:** `docs/superpowers/specs/2026-08-25-kaifanla-production-deployment-design.md`

## Global Constraints

- 小程序名称为“开饭啦”，AppID 为 `wx0006792d6129b164`。
- 体验版与正式版 API Origin 均为 `https://api.guziyi.cn`；开发版保持 `http://127.0.0.1:3000`。
- 生产 MySQL 不发布宿主机端口；公网应用端口仅为 80/443。
- 服务端运行用户不是 root，根文件系统只读，仅 `/tmp` 与 `/var/lib/kaifanla/uploads` 可写。
- 真实凭据只进入被忽略的本地环境文件或服务器 `0600` 环境文件，不进入镜像、日志、文档或测试输出。
- 缺少任何必需变量时 Compose 必须立即失败，不使用弱默认值。
- 不执行任何 Git 命令；每个任务以文件复核和验证命令作为检查点。

---

## File Map

```text
apps/miniapp/src/app.json                       全局小程序标题
apps/miniapp/project.private.config.json        微信开发者工具本地项目名
apps/miniapp/src/config.ts                      开发/体验/正式 API Origin
package.json                                    小程序统一验证命令
DEPLOYMENT.md                                   非敏感生产事实记录
apps/server/next.config.ts                      standalone 与 monorepo tracing
apps/server/Dockerfile                          runtime/tooling 多阶段镜像
apps/server/.dockerignore                       排除密钥、测试产物和本地数据
deploy/docker-compose.prod.yml                  生产服务、网络、卷与健康检查
deploy/env/production.env.example               非敏感变量格式
deploy/nginx/templates/bootstrap.conf.template  首次 ACME HTTP 配置
deploy/nginx/templates/default.conf.template    正式 HTTPS 反向代理
deploy/nginx/snippets/security-headers.conf      共用安全响应头
deploy/tests/compose-config.ps1                 Compose 安全策略测试
deploy/tests/nginx-policy.ps1                   Nginx 语法与策略测试
```

### Task 1: 品牌名称、生产 Origin 与部署记录

**Files:**
- Modify: `apps/miniapp/src/app.json`
- Modify: `apps/miniapp/project.private.config.json`
- Modify: `apps/miniapp/src/config.ts`
- Modify: `package.json`
- Modify: `DEPLOYMENT.md`
- Test: existing `apps/miniapp/tests/**/*.test.ts`

**Interfaces:**
- Consumes: 微信环境版本 `develop | trial | release`。
- Produces: `getApiOrigin(): string` 返回与环境完全对应的 Origin；代码与部署记录使用同一产品名。

- [ ] **Step 1: 记录配置测试例外与当前验证基线**

品牌名称和固定 Origin 是明确的配置决策，用户已经批准不新增精确文案测试。先运行现有测试，确认修改前基线：

```powershell
pnpm --filter @ordering/miniapp test
pnpm --filter @ordering/miniapp typecheck
```

Expected: 两条命令均退出 0；若失败，先记录为既有失败并停止改名。

- [ ] **Step 2: 应用最小配置修改**

`apps/miniapp/src/app.json`：

```json
"navigationBarTitleText": "开饭啦"
```

`apps/miniapp/project.private.config.json`：

```json
"projectname": "开饭啦"
```

`apps/miniapp/src/config.ts`：

```ts
export const API_ORIGINS = {
  develop: "http://127.0.0.1:3000",
  trial: "https://api.guziyi.cn",
  release: "https://api.guziyi.cn",
} as const;
```

根 `package.json` 增加：

```json
"verify:miniapp": "pnpm --filter @ordering/contracts test && pnpm --filter @ordering/miniapp typecheck && pnpm --filter @ordering/miniapp test"
```

`DEPLOYMENT.md` 同步写入名称、AppID、域名、SSH 专用密钥路径与指纹、`cn-chengdu` 地域、服务器资源和 SSH 已验证状态；不写任何秘密值。

- [ ] **Step 3: 验证小程序配置与现有行为**

```powershell
pnpm verify:miniapp
pnpm --filter @ordering/miniapp typecheck
```

Expected: 契约测试、小程序测试和类型检查全部退出 0。

- [ ] **Step 4: 文件检查点**

只读确认三个环境 Origin、全局标题、开发者工具名称和部署记录一致；确认页面级“选菜”“当前清单”“我的清单”没有被改名。

### Task 2: Next.js standalone 镜像与 Compose 拓扑

**Files:**
- Create: `deploy/tests/compose-config.ps1`
- Create: `apps/server/Dockerfile`
- Create: `apps/server/.dockerignore`
- Create: `deploy/docker-compose.prod.yml`
- Create: `deploy/env/production.env.example`
- Modify: `apps/server/next.config.ts`

**Interfaces:**
- Consumes: monorepo 根目录构建上下文、`@ordering/server` 构建脚本、生产变量。
- Produces: `kaifanla-server` runtime 镜像、`kaifanla-tooling` 迁移/维护镜像，以及 `mysql`、`server`、`nginx`、`nginx-bootstrap`、`certbot` 服务定义。

- [ ] **Step 1: 写 Compose 策略失败测试**

`deploy/tests/compose-config.ps1` 的核心断言：

```powershell
$ErrorActionPreference = 'Stop'
$env:MYSQL_ROOT_PASSWORD = 'compose-policy-root-password'
$env:MYSQL_PASSWORD = 'compose-policy-app-password'
$env:OPENID_HMAC_SECRET = 'compose-policy-openid-secret-32-bytes'
$env:WECHAT_APP_SECRET = 'compose-policy-wechat-secret'
$env:USER_SESSION_PEPPER = 'compose-policy-user-pepper-32-bytes'
$env:ADMIN_PASSWORD_HASH = '\$argon2id\$v=19\$m=19456,t=2,p=1\$dGVzdHNhbHQ\$dGVzdGhhc2g'
$env:ADMIN_SESSION_SECRET = 'compose-policy-admin-secret-32-bytes'
$env:RESTIC_PASSWORD = 'compose-policy-restic-password'
$config = docker compose --env-file deploy/env/production.env.example `
  -f deploy/docker-compose.prod.yml config --format json | ConvertFrom-Json

if ($config.services.mysql.ports) { throw 'Production MySQL must not publish ports' }
if ($config.services.server.ports) { throw 'Next.js must not publish a host port' }
if (-not $config.services.server.healthcheck) { throw 'Server healthcheck is required' }
if (-not $config.services.mysql.healthcheck) { throw 'MySQL healthcheck is required' }
if (-not $config.services.server.read_only) { throw 'Server root filesystem must be read-only' }
if ($config.services.server.user -eq '0' -or $config.services.server.user -eq 'root') { throw 'Server must be non-root' }
$published = @($config.services.nginx.ports.published)
if (80 -notin $published -or 443 -notin $published) { throw 'Nginx must publish 80 and 443' }
```

- [ ] **Step 2: 运行测试并确认正确失败**

```powershell
pwsh deploy/tests/compose-config.ps1
```

Expected: 因 `deploy/docker-compose.prod.yml` 不存在而失败，不是 PowerShell 语法错误。

- [ ] **Step 3: 启用当前 Next.js 16 文档规定的 standalone 输出**

`apps/server/next.config.ts`：

```ts
import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  poweredByHeader: false,
};

export default nextConfig;
```

- [ ] **Step 4: 创建多阶段 Dockerfile**

Dockerfile 使用 `node:24-bookworm-slim`，包含 `deps`、`build`、`tooling`、`runtime` 四个阶段。`build` 运行 `pnpm --filter @ordering/server build`；`tooling` 保留冻结依赖、Prisma CLI 与迁移，用于一次性迁移和清理；`runtime` 复制 `.next/standalone`、`.next/static` 与 `public`，固定 UID/GID 10001，设置：

```dockerfile
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NODE_OPTIONS=--max-old-space-size=384
USER 10001:10001
EXPOSE 3000
CMD ["node", "apps/server/server.js"]
```

若实际 standalone 输出为 `server.js` 位于镜像工作目录根部，构建检查必须据实将 CMD 改为 `node server.js`；不保留两种猜测路径。

`.dockerignore` 明确排除 `.git`、`node_modules`、`.pnpm-store`、`.next`、`.env*`、测试结果、上传文件、日志和 `.codex-verification`。

- [ ] **Step 5: 定义环境格式和生产 Compose**

`deploy/env/production.env.example` 只包含非秘密值：

```dotenv
APP_DOMAIN=api.guziyi.cn
APP_IMAGE=kaifanla-server:local
TOOLING_IMAGE=kaifanla-tooling:local
MYSQL_DATABASE=ordering
MYSQL_USER=ordering_app
WECHAT_APP_ID=wx0006792d6129b164
ADMIN_USERNAME=admin
UPLOAD_ROOT=/var/lib/kaifanla/uploads
BACKUP_LOCAL_ROOT=/var/backups/kaifanla
```

Compose 对每个秘密使用 `${NAME:?NAME is required}`。`mysql` 使用持久卷和约 256 MiB InnoDB buffer pool；`server` 使用内部网络、`read_only: true`、`user: 10001:10001`、`tmpfs: /tmp` 与上传卷；健康检查用 Node 内置 `fetch` 请求 `http://127.0.0.1:3000/api/v1/health`。`nginx` 发布 80/443，`nginx-bootstrap` 只在 `bootstrap` profile 发布 80，二者不同时运行。

- [ ] **Step 6: 固定上游镜像摘要**

执行以下命令获取当前多架构摘要，并把返回的 `sha256:` 值写入 Compose：

```powershell
docker buildx imagetools inspect mysql:8.4
docker buildx imagetools inspect nginx:stable
docker buildx imagetools inspect certbot/certbot:latest
```

Expected: 三个命令均返回 manifest digest；Compose 中不保留浮动生产引用。

- [ ] **Step 7: 运行 Compose 策略测试至通过**

```powershell
pwsh deploy/tests/compose-config.ps1
docker compose --env-file deploy/env/production.env.example -f deploy/docker-compose.prod.yml config
```

Expected: 退出 0；展开配置中 MySQL/Next.js 无宿主端口、持久卷齐全、必需秘密无默认值。

### Task 3: Nginx TLS、限流与媒体策略

**Files:**
- Create: `deploy/nginx/templates/bootstrap.conf.template`
- Create: `deploy/nginx/templates/default.conf.template`
- Create: `deploy/nginx/snippets/security-headers.conf`
- Create: `deploy/tests/nginx-policy.ps1`
- Modify: `deploy/docker-compose.prod.yml`

**Interfaces:**
- Consumes: `APP_DOMAIN=api.guziyi.cn`、`server:3000`、ACME webroot 与证书卷。
- Produces: HTTP ACME bootstrap、HTTPS `/api/v1`、`/admin`、`/media` 与安全响应头。

- [ ] **Step 1: 写 Nginx 策略失败测试**

测试必须渲染模板、生成一次性自签证书并运行 `nginx -t`，然后断言 TLS 1.2/1.3、HTTP 跳转、`server_tokens off`、API/登录限流区、512 KiB 默认请求体、3 MiB 头像限制、6 MiB 菜品限制、`X-Content-Type-Options`、`Referrer-Policy`、CSP、管理页面 no-store 和头像 private/no-store。

```powershell
pwsh deploy/tests/nginx-policy.ps1
```

Expected first result: 因模板文件不存在而失败。

- [ ] **Step 2: 实现 bootstrap HTTP 配置**

```nginx
server {
  listen 80;
  server_name ${APP_DOMAIN};
  location ^~ /.well-known/acme-challenge/ { root /var/www/acme; }
  location / { return 503; }
}
```

首次证书签发时只启动 `nginx-bootstrap`，不把未加密应用流量代理给 Next.js。

- [ ] **Step 3: 实现正式 HTTPS 配置**

正式配置包含：

```nginx
limit_req_zone $binary_remote_addr zone=api_per_ip:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login_per_ip:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=wechat_auth_per_ip:10m rate=10r/m;
server_tokens off;

server {
  listen 80;
  server_name ${APP_DOMAIN};
  location ^~ /.well-known/acme-challenge/ { root /var/www/acme; }
  location / { return 301 https://$host$request_uri; }
}
```

443 server 加载 `/etc/letsencrypt/live/${APP_DOMAIN}/fullchain.pem` 与 `privkey.pem`，只启用 TLS 1.2/1.3。所有代理传递 Host、`X-Forwarded-Proto https`、客户端地址和请求 ID；普通超时 15 秒，上传超时 60 秒。头像保持 private/no-store，管理页面 no-store 且禁止被 iframe 嵌入，菜品图片仅在内容哈希 URL 上使用 immutable 缓存。

- [ ] **Step 4: 运行 Nginx 测试至通过**

```powershell
pwsh deploy/tests/nginx-policy.ps1
```

Expected: `nginx -t` 成功，所有安全策略断言通过且无 warning。

### Task 4: 本地完整构建与可运行性门禁

**Files:**
- Test: all files produced by Tasks 1–3

**Interfaces:**
- Consumes: runtime/tooling Docker targets、Compose、Nginx 模板。
- Produces: 已验证的本地镜像摘要和可交给运维计划的部署包。

- [ ] **Step 1: 运行应用门禁**

```powershell
pnpm verify:server
pnpm verify:miniapp
```

Expected: 所有测试、Lint、类型检查、集成测试与 Next.js 生产构建退出 0。

- [ ] **Step 2: 构建两个生产目标**

```powershell
docker build --target runtime -f apps/server/Dockerfile -t kaifanla-server:local .
docker build --target tooling -f apps/server/Dockerfile -t kaifanla-tooling:local .
```

Expected: 两个构建退出 0。

- [ ] **Step 3: 检查镜像身份和秘密泄漏**

```powershell
docker image inspect kaifanla-server:local --format '{{.Config.User}}'
docker history --no-trunc kaifanla-server:local
```

Expected: runtime 用户为 `10001:10001`；history 不出现 AppSecret、数据库密码、私钥或本地 `.env` 内容。

- [ ] **Step 4: 运行生产策略门禁**

```powershell
pwsh deploy/tests/compose-config.ps1
pwsh deploy/tests/nginx-policy.ps1
```

Expected: 两项策略测试均退出 0。

- [ ] **Step 5: 记录交付摘要**

将 `docker image inspect` 返回的 runtime/tooling RepoDigest 或本地 image ID 写入非敏感部署记录。只有上述四类门禁全部通过，第二份运维计划才可操作 ECS。
