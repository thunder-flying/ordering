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
