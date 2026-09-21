# 生产部署记录

> 本文件只记录非敏感部署信息。密码、SSH 私钥、数据库口令、微信上传密钥和其他密钥不得写入项目。

## 应用

- 小程序名称：开饭啦
- 微信公众平台正式名称：需在微信公众平台后台申请修改为“开饭啦”
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

## 待确认/待执行

- 已确认项目为原生微信 TypeScript 小程序 + Next.js 16 模块化单体 + MySQL 8.4 + Prisma 7
- 检查生产构建命令和后端监听端口
- 配置 DNS、服务器安全组、防火墙、反向代理和 HTTPS
- 部署数据库与后端，执行迁移并配置开机自启
- 配置微信小程序合法域名，构建、上传、体验验证并提交审核

## 更新服务器代码

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
