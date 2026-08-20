# 服务端本地开发手册

## 1. 前置条件

- Node.js 24（仓库 `.node-version` 已固定为 `24`）。
- Corepack 与 pnpm 11。
- Docker Desktop，能够运行 MySQL 8.4 测试容器。
- Windows PowerShell 7；其他系统可将环境变量语法替换为对应 Shell 写法。

确认版本并安装依赖：

```powershell
node --version
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
```

不要提交 `.env`、微信 AppSecret、生产数据库密码、管理员明文密码或任何会话令牌。

## 2. 启动本地 MySQL

仓库提供 `deploy/docker-compose.yml`，用于启动只监听 `127.0.0.1:33070` 的本地 MySQL：

```powershell
docker compose -f deploy/docker-compose.yml up -d --wait
$env:DATABASE_URL='mysql://ordering:123456@127.0.0.1:33070/ordering'
pnpm --filter @ordering/server exec prisma migrate deploy
```

停止容器使用：

```powershell
docker compose -f deploy/docker-compose.yml down
```

除非明确要丢弃全部测试数据，不要加 `-v`。

## 3. 创建环境文件

```powershell
Copy-Item apps/server/.env.example apps/server/.env
```

编辑 `apps/server/.env`：

- `DATABASE_URL`：使用仓库 Compose 服务时填写 `mysql://ordering:123456@127.0.0.1:33070/ordering`；生产必须使用独立强密码账号。
- `WECHAT_APP_ID` / `WECHAT_APP_SECRET`：微信公众平台的小程序凭据。
- `OPENID_HMAC_SECRET`、`USER_SESSION_PEPPER`、`ADMIN_SESSION_SECRET`：三个彼此不同、至少 32 字符的随机值。
- `ADMIN_USERNAME`：唯一管理员账号。
- `ADMIN_PASSWORD_HASH`：Argon2id 哈希，不是明文密码。
- `UPLOAD_ROOT`：持久化图片目录的绝对路径。

可以用 Node 生成随机密钥：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

分别执行三次，并保存到密码管理器。命令只输出随机值，不要把生产密钥粘贴进聊天记录或提交到 Git。

### 不在 Shell 历史中记录管理员密码

下面的命令交互式读取密码，Shell 历史只记录命令本身，不包含密码：

```powershell
$orderingSecurePassword = Read-Host '管理员密码' -AsSecureString
$orderingCredential = [PSCredential]::new('admin', $orderingSecurePassword)
$env:ORDERING_ADMIN_PASSWORD = $orderingCredential.GetNetworkCredential().Password
pnpm --filter @ordering/server exec node --input-type=module -e "import { hash } from '@node-rs/argon2'; console.log(await hash(process.env.ORDERING_ADMIN_PASSWORD))"
Remove-Item Env:ORDERING_ADMIN_PASSWORD
```

把输出的完整 `$argon2id$...` 字符串写入 `.env` 的 `ADMIN_PASSWORD_HASH`。执行结束后关闭该终端可进一步清除进程环境。

## 4. 迁移、种子和开发服务器

Prisma 命令从应用目录读取 `apps/server/.env`：

```powershell
pnpm --filter @ordering/server exec prisma generate
pnpm --filter @ordering/server exec prisma migrate deploy
pnpm --filter @ordering/server exec prisma db seed
pnpm --filter @ordering/server dev
```

种子是可选的，只在数据库没有分类时创建“家常菜”。打开：

- 管理后台：`http://localhost:3000/admin/login`
- 健康检查：`http://localhost:3000/api/v1/health`

## 5. 测试和验收

先确认本地 MySQL 健康并设置当前终端的 `DATABASE_URL`，再运行完整服务端门禁：

```powershell
docker compose -f deploy/docker-compose.yml up -d --wait
$env:DATABASE_URL='mysql://ordering:123456@127.0.0.1:33070/ordering'
pnpm verify:server
```

首次运行浏览器测试需要安装 Chromium：

```powershell
pnpm --filter @ordering/server exec playwright install chromium
pnpm --filter @ordering/server test:e2e
```

测试覆盖：

- 微信登录映射、令牌过期和注销。
- 分类、菜品、图片、公开菜单和匿名统计。
- 用户隔离的收藏、清单快照、当前价格编辑、复制与幂等。
- 可选资料、头像替换、清空数据和账号注销。
- 单管理员登录、CSRF、分类/菜品浏览器 CRUD、非法价格和伪造图片拒绝。

验收后可检查测试库：`users.openidDigest` 应是固定长度摘要，`user_sessions.tokenHash` 应是哈希；数据库中不存在 `openid` 或明文令牌列。应用日志也不应出现请求体、AppSecret、管理员密码或 `DATABASE_URL`。

## 6. 生产构建与文件清理

```powershell
pnpm --filter @ordering/server build
pnpm --filter @ordering/server start
```

生产构建会同时生成 `dist-cli/cleanup-uploads.mjs`。计划任务可定期执行：

```powershell
pnpm --filter @ordering/server cleanup:uploads
```

该命令只处理数据库已标记为待删除且不再被菜品或头像引用的文件；失败记录保留，下一次可重试。生产部署还需由 Nginx 提供 HTTPS，并对 MySQL 与 `UPLOAD_ROOT` 做独立备份。
