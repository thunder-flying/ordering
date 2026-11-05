# 新服务器部署说明

适用于重装后的 Ubuntu 22.04 服务器。当前文件是待上线配置。

## 项目边界

- `/opt/ordering/deploy/next/compose.yaml`：本项目的 MySQL、Next.js、内部 Nginx；Nginx 只映射 `127.0.0.1:18080`。
- `/opt/ordering/deploy/next/edge/`：整台服务器共用的 Caddy。Caddy 使用主机网络，独占 80/443；证书在持久卷中。
- `/etc/ordering/production.env`：项目生产密钥与当前镜像标签，`root:root`、`0600`；不上传 Git。
- `/etc/ordering/edge.env`：`ACME_EMAIL`，`root:root`、`0600`。
- `/var/backups/ordering`：本机数据库与上传图片备份，`0700`；异地 OSS 副本仍需配置和恢复验证。

其他项目使用自己的 Compose、数据库与上传卷，以及不同的 `127.0.0.1` 内部代理端口。在共用 Caddy 的 `sites/` 下增加域名配置即可；不能再发布其他 80/443 监听者。

## 首次准备

### 生产配置需要什么

本地项目中的 `.env.production.local`、`.env.edge.local` 和 `.env.admin.local` 是此机器专用的真实配置文件，均被根目录 `.gitignore` 的 `.env*` 规则忽略，权限为 `0600`。`.env.admin.local` 保存生成的管理员明文密码；不要把这些文件加入 Git。填写 `.env.production.local` 的 `WECHAT_APP_SECRET` 和 `.env.edge.local` 的 `ACME_EMAIL` 后，运行：

```bash
python3 deploy/next/scripts/validate_env.py deploy/next/.env.production.local
```

验证通过后，再通过 SSH 将前两个文件安装到服务器 `/etc/ordering/production.env` 和 `/etc/ordering/edge.env`，属主为 `root:root`、权限为 `0600`。`.env.admin.local` 仅留在本机，不上传服务器。当前镜像标签仍是本地占位值，首次启动前须改为实际已加载的镜像标签。

项目已提供 [`env.example`](env.example) 作为变量清单，以及 [`scripts/init-env.sh`](scripts/init-env.sh) 生成服务器配置。脚本会在终端交互式读取三项由你提供的值：

| 输入 | 来源 | 用途 |
| --- | --- | --- |
| 微信小程序 AppSecret | 微信公众平台 | 服务端调用微信登录接口 |
| 管理员密码（至少 16 字符） | 你自行设定 | 生成 Argon2id 密码哈希，供后台登录 |
| ACME 联系邮箱 | 你可收信的邮箱 | Caddy 自动签发与续期 HTTPS 证书 |

若从零开始且没有本地配置，脚本也可在服务器生成数据库密码、HMAC 密钥和会话密钥，并创建 `/etc/ordering/production.env` 与 `/etc/ordering/edge.env`。运行前服务器需要 `argon2`、`openssl` 和 `python3`。在服务器终端执行：

```bash
sudo /opt/ordering/deploy/next/scripts/init-env.sh
```

脚本只创建配置，不会启动容器或发布应用。文件已存在时会停止，避免覆盖现有密钥。

1. 在阿里云安全组只放行需要的 SSH 端口及 80/443；确认 `ordering.guziyi.cn` 的 A 记录指向新服务器。用云控制台核对 SSH 主机密钥指纹，再安装专用公钥。密码只用于首次控制台或 SSH 引导，不能放进 CI Secrets。
2. 按[Docker 官方 Ubuntu 安装指南](https://docs.docker.com/engine/install/ubuntu/)安装 Docker Engine 与 Compose 插件。确认 `docker compose version`、`docker info`、磁盘剩余空间及 80/443/18080 端口占用。2 GiB 内存实例须观察构建和 MySQL 内存；镜像在 GitHub Actions 构建，不在服务器构建。
3. 由 root 安装本目录到 `/opt/ordering/deploy/next/`，文件保持 root 所有、不可被部署账号改写。创建 `/etc/ordering/production.env` 和 `/etc/ordering/edge.env`，权限均为 `0600`。从 `env.example` 填入实际随机密钥；`ADMIN_PASSWORD_HASH` 的 Argon2id 值含 `$`，在 Compose env 文件中用单引号包住。不要把真实值写入仓库或命令行参数。
4. 创建专用 `deploy` 用户及 SSH 公钥，授予其仅执行 root 所有的 `release.sh` 的免密 sudo 规则。部署账号不加入 Docker 组，不可写 `/opt/ordering/deploy/next/`、`/etc/ordering/` 或备份目录。root 登录保留到部署账号的第二连接验证成功，再调整 SSH 策略。
5. 先启动共用 Caddy；DNS 和 80/443 生效后确认自动签发证书。应用首次发布可由 `main` 的下一次推送触发；发布流程会启动空 MySQL、执行 Prisma 迁移、启动 Next.js/Nginx 并检查公网 HTTPS。

## GitHub Actions 设置

仓库需以 `main` 为默认分支。工作流 `.github/workflows/ordering.yml` 对 `dev`、`master`、`main` 和 PR 执行验证；只有 `main` 的 push 且 `verify` 成功时构建并发布两个 GHCR 镜像。部署任务还要求仓库变量 `ORDERING_DEPLOY_READY=true`，该变量只在服务器、DNS、密钥和 HTTPS 前置条件全部完成后开启。

生产环境 `production` 中配置这些 Secrets：

| 名称 | 用途 |
| --- | --- |
| `DEPLOY_HOST` | 新服务器 IP 或 SSH 主机名 |
| `DEPLOY_USER` | 专用部署账号 |
| `DEPLOY_SSH_PRIVATE_KEY` | 仅供 CI 登录的专用私钥；与个人管理密钥分开 |
| `DEPLOY_KNOWN_HOSTS` | 经云控制台核对的 SSH 主机公钥整行 |

可选变量 `DEPLOY_PORT` 默认为 22。GHCR 的 `GITHUB_TOKEN` 由 GitHub Actions 提供；发布脚本用临时 Docker 配置登录，任务结束即删除。若服务器无法稳定连接 GHCR，先不要开启自动部署，改用经验证的镜像归档传输方案。

部署文件不随每次应用发布自动覆盖。修改 Compose、Nginx、Caddy 或发布脚本时，先在本地验证，再由 root 单独安装和检查；应用镜像更新只调用服务器上已安装的 `release.sh`。这避免一次普通代码推送误改整机入口。

## 验证与回滚

本地配置测试：

```bash
python3 -m unittest discover -s deploy/next/tests -p '*_policy.py' -v
```

服务器发布前备份由 `scripts/backup.sh` 生成数据库压缩包、上传卷归档和 SHA-256 清单。部署失败时 `release.sh` 尝试恢复上一应用镜像；Prisma 迁移不会自动逆转。每次发布记录位于 `/opt/ordering/var/releases/`。手工回滚或恢复数据前，先核实目标镜像、数据库备份和当前容器状态。

上线验收须包含 `https://ordering.guziyi.cn/api/v1/health`、分类与菜品接口、`/admin/login` 的全部 JS/CSS、图片上传和访问、重建后的卷持久性、证书、备份独立恢复，以及微信小程序合法域名与真机请求。新域名可用并完成微信公众平台配置后，再修改 `apps/miniapp/src/config.ts` 的生产地址、上传体验版和正式版。
