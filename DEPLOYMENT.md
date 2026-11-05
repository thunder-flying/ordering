# 生产部署状态

目标服务器为 `8.137.174.33`（Ubuntu 22.04），生产域名为 `ordering.guziyi.cn`。本项目在服务器上使用独立的 MySQL、Next.js 和内部 Nginx 容器，由整机共用的 Caddy 提供 HTTPS。

## 当前状态（2026-11-04）

- 已安装 Docker Engine 29.9.3、Docker Compose 5.7.0、Git，以及部署脚本需要的 argon2、OpenSSL、curl、Python 3 和 rsync。
- 已将 `deploy/next/` 放在服务器 `/opt/ordering/deploy/next/`；文件归 `root:root`，`init-env.sh` 可执行。
- 尚无项目容器或镜像；生产环境文件尚未创建。`/opt/ordering/first-release.tar.gz.part` 是未完成的镜像传输文件。
- 根分区 40 GB，约剩 34 GB；可见内存约 1.7 GiB，无 Swap。UFW 已安装但未启用；云安全组需单独核查。
- 本地 `dev` 分支的部署文件仍未提交；远程默认分支仍为 `master`。不能据此认为 GitHub Actions 已生效。

## 生产配置

配置项及填写方式见 [`deploy/next/README.md`](deploy/next/README.md) 和 [`deploy/next/env.example`](deploy/next/env.example)。本地真实配置保存在 `deploy/next/.env.production.local`、`.env.edge.local` 和 `.env.admin.local`，由 Git 忽略；服务器副本放在 `/etc/ordering/production.env`、`/etc/ordering/edge.env`（`root:root`、`0600`）。微信 AppSecret 和证书邮箱仍需在本地填写。

## 待完成

1. 在云控制台核对 SSH 主机密钥；确认云安全组和 DNS。
2. 在本地配置文件填写微信 AppSecret 和 ACME 联系邮箱，通过 `validate_env.py` 验证后安全复制到服务器。
3. 完成镜像传输并校验，启动空库、迁移、应用和 Caddy；验证 HTTPS、后台资源、数据库和上传卷。
4. 完成备份恢复演练，再启用 GitHub 自动部署并切换微信小程序合法域名与生产地址。
