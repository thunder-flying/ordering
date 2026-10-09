# 生产部署记录

> 本文件只记录非敏感部署信息。密码、SSH 私钥、数据库口令、微信上传密钥和其他密钥不得写入项目。

## 应用

- 小程序名称：今日饭单
- 微信公众平台正式名称：今日饭单（用户已在后台修改）
- 微信小程序 AppID：`wx0006792d6129b164`
- AppID 配置文件：`apps/miniapp/project.config.json`

## 阿里云服务器

- 公网 IP：`8.137.174.33`
- 操作系统：Alibaba Cloud Linux 3.2104 LTS 64 位
- ECS 地域与可用区：`cn-chengdu` / `cn-chengdu-a`
- 服务器资源：2 vCPU、约 1.8 GiB 内存、40 GB ext4 系统盘、无 Swap
- 初始软件状态：未安装 Docker、Podman、Nginx、Node.js、pnpm、Git
- SSH 用户：`root`
- SSH 端口：`22`（已确认）
- 专用 SSH 私钥：`C:\Users\17251\.ssh\ordering_aliyun_ed25519`
- 专用 SSH 公钥：`C:\Users\17251\.ssh\ordering_aliyun_ed25519.pub`
- 公钥指纹：`SHA256:bXvnFHDsgvHoqGhB+6hnUTMy98JaA97yON9q/RUm8Dw`
- SSH 认证：专用公钥已安装，已验证可登录 `root@8.137.174.33`

## 域名与 HTTPS

- 已备案主域名：`guziyi.cn`
- 后端 API 子域名：`api.guziyi.cn`
- DNS 目标：`api.guziyi.cn` A 记录指向 `8.137.174.33`
- DNS 状态：尚未解析
- HTTPS：待签发并配置证书
- 微信公众平台 request 合法域名：待 HTTPS 生效后配置为 `https://api.guziyi.cn`

## 数据库

- 部署位置：同一台服务器
- 数据库类型：MySQL 8.4，由 Prisma 7 管理迁移
- 生产数据库名称、账号及端口：部署时创建且不暴露公网
- 数据库密码：仅保存在服务器生产环境变量或受限配置中，不写入本文件

## 初始化菜单数据

生产数据库完成迁移后，需要额外执行一次菜单种子导入。种子脚本会写入项目自带的分类、菜品和菜品图片；重复执行会更新匹配的同名种子数据（包括价格、描述、图片、分类启用和菜品发布状态），并可能删除无菜品的旧“家常菜”种子分类。已有人工修改时请先备份。

将项目中的 `deploy/scripts/seed-production.sh` 拖动到服务器目录：

```text
/opt/kaifanla/deploy/scripts/seed-production.sh
```

然后在服务器上执行：

```bash
bash /opt/kaifanla/deploy/scripts/seed-production.sh
```

脚本固定使用 `/etc/kaifanla/production.env`、`/opt/kaifanla/deploy/docker-compose.prod.yml` 和 `kaifanla_uploads` 卷，并会先检查生产环境文件权限、Compose 配置、上传卷以及已经运行且健康的 MySQL 服务。使用 `--no-deps` 跳过 MySQL 启动，并通过 `docker image inspect` 确认配置的工具镜像已在服务器加载；缺少镜像时直接停止。为兼容服务器的 Compose 版本，不使用 `run --pull` 参数。遇到 `unknown flag: --pull`，覆盖更新后的脚本后重试即可，无需为此升级 Docker。

脚本显式指定 `/bin/sh -c` 入口，使用镜像内的 Node 和 tsx 执行 `prisma/seed.ts`，不依赖 pnpm 入口。遇到 `/bin/sh: 0: cannot open pnpm` 时，将更新后的脚本拖到上述路径覆盖，再执行同一条 bash 命令。如果提示工具文件缺失，请检查 `production.env` 的 `TOOLING_IMAGE` 是否对应已加载的完整 tooling 镜像；只拖动脚本不会更新镜像内的种子代码和图片。

若遇到 `EACCES: permission denied, mkdir '/var/lib/kaifanla/uploads/dishes'`，覆盖最新版脚本后重试。脚本先在一次性 root 工具容器内创建图片目录，将上传卷根目录和 `dishes` 目录本身设为 `10001:10001`、权限 `0755`；不递归修改已有文件。实际种子导入仍由普通用户 `10001:10001` 执行。若已有图片文件自身不可写，仍需按具体报错排查文件权限。

菜单导入完成后验证：

```text
https://api.guziyi.cn/api/v1/categories
https://api.guziyi.cn/api/v1/dishes
```

## 待确认/待执行

### 2026-09-22 菜单连接关闭排查记录

- 种子导入后，生产应用内部的分类接口返回 9 个分类，菜品接口可返回番茄炒蛋、鱼香肉丝等数据；从 ECS 访问公网 HTTPS 的健康、分类、菜品接口均为 HTTP 200。
- Windows 微信开发者工具请求 `/api/v1/dishes?limit=20` 报 `net::ERR_CONNECTION_CLOSED`。同一台 Windows 电脑直接请求该 HTTPS 接口时，TLS 握手被重置；HTTP 健康接口返回 `403`、`Server: Beaver`，页面标题为 `Non-compliance ICP Filing`，指向阿里云备案拦截页。
- 因此服务器内接口正常不能证明所有公网访问正常；此时无需重复导入菜单。应在阿里云核查 `guziyi.cn` 的网站备案和接入状态。如已完成阿里云接入，提交工单，附上域名 `api.guziyi.cn`、ECS 公网 IP `8.137.174.33`、上述响应和拦截页标识 `00000000005854151745`，请求核查公网备案阻断及状态同步。
- 处理后从原 Windows 网络再次验证 HTTPS 菜单接口，并在微信开发者工具重试。以公网实际恢复为准，不能仅凭 ECS 自测或健康检查判定问题已解决。
- 官方排查说明：https://help.aliyun.com/zh/icp-filing/basic-icp-service/web-site-for-the-record-to-block-1

- 已确认项目为原生微信 TypeScript 小程序 + Next.js 16 模块化单体 + MySQL 8.4 + Prisma 7
- 检查生产构建命令和后端监听端口
- 配置 DNS、服务器安全组、防火墙、反向代理和 HTTPS
- 部署数据库与后端，执行迁移并配置开机自启
- 配置微信小程序合法域名，构建、上传、体验验证并提交审核

## 更新服务器代码

### 2026-10-09 后台静态资源修复

- 线上旧镜像 `kaifanla-server:local` 的工作目录为 `/app/apps/server/.next/standalone`，实际入口为该目录下的 `apps/server/server.js`；JS、CSS 却位于外层 `/app/apps/server/.next/static`，导致登录页返回 200、静态资源返回 404。
- 基于原线上镜像构建修复镜像 `kaifanla-server:static-repair-20261009T085402Z`，将静态资源和 public 复制到实际应用目录，更新生产环境的 `APP_IMAGE`，重新创建应用容器并重启 Nginx。
- 从 ECS 通过 `https://api.guziyi.cn/admin/login` 提取并请求全部 10 个 JS、CSS，均为 HTTP 200，内容非空且 MIME 类型正确；HTTPS 健康接口返回 `status: ok`。此验证不代表原 Windows 网络访问情况。
- 旧镜像保留，部署前环境文件备份在服务器受限目录 `/opt/kaifanla/incoming/static-repair-20261009T085402Z/production.env.previous`，不写入项目。
- 后续完整发布使用下述本地构建脚本和当前 `apps/server/Dockerfile`，保证 standalone 入口和静态资源使用一致目录。本次只修复现有线上版本的资源目录，未发布本地新功能，也未执行数据库迁移。

本地 Windows 电脑执行 `deploy/scripts/update-server.ps1`。脚本会先运行
`pnpm run verify:server`，再在本地构建 `server` 和 Prisma tooling 镜像，压缩后通过
SSH/SCP 上传到服务器。服务器端会校验生产环境文件权限、加载镜像、执行
`prisma migrate deploy`、更新 Docker Compose 服务并运行 HTTPS 健康检查。

默认参数已经对应上面的阿里云服务器和专用 SSH 私钥：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\update-server.ps1
```

自定义服务器或私钥时覆盖参数：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\update-server.ps1 `
  -ServerHost 8.137.174.33 `
  -SshUser root `
  -SshPort 22 `
  -IdentityFile "$env:USERPROFILE\.ssh\ordering_aliyun_ed25519"
```

脚本只上传生产 Compose、Nginx 配置、部署脚本和 Docker 镜像，不上传源码、生产环境文件或私钥。
`-SkipChecks` 只跳过本地 `verify:server`，不跳过服务器端校验；`-KeepArtifacts` 会保留本地临时镜像压缩包供排障。

执行更新前应先确认已有数据库备份。数据库迁移是向前迁移，脚本不会自动执行逆向迁移；如果服务更新后的健康检查失败，脚本只尝试恢复旧应用镜像。
