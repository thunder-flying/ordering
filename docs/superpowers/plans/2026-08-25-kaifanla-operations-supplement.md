# 「开饭啦」运维计划补强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to apply this mandatory companion while executing `2026-08-25-kaifanla-operations-and-deployment.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐主机安装、防火墙、阿里云云监控、管理员凭据和 ACME 联系方式的精确上线步骤。

**Architecture:** 本计划不单独部署服务；它是运维与上线主计划的强制伴随计划。Task 1 与主计划 Task 5 同时执行，Task 2 与主计划 Task 4 同时执行，Task 3 在主计划 Task 6 Step 1 之前执行。

**Tech Stack:** Alibaba Cloud Linux 3、Docker CE、firewalld、阿里云云监控、Argon2id、Certbot。

**Spec:** `docs/superpowers/specs/2026-08-25-kaifanla-production-deployment-design.md`

## Global Constraints

- 不卸载、不删除现有 Docker 数据、系统目录或防火墙规则；只在只读预检确认服务器仍为空机后安装。
- 不使用 `get.docker.com` 一键脚本；使用阿里云针对 Alibaba Cloud Linux 3 的软件源兼容方案。
- 管理员明文密码不进入聊天、命令参数或 Shell 历史。
- 云监控通知必须做一次无害的实际到达测试。
- 不执行任何 Git 命令。

---

### Task 1: 精确安装 Docker CE 与 firewalld

**Files:**
- Modify: `deploy/scripts/bootstrap-host.sh`
- Modify: `docs/runbooks/production.md`

**Interfaces:**
- Consumes: 经只读确认无 Docker 的 Alibaba Cloud Linux 3 主机。
- Produces: 开机自启的 Docker/Compose 与只开放 SSH、HTTP、HTTPS 的主机防火墙。

- [ ] **Step 1: 只读检查安装前状态**

```bash
rpm -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin firewalld || true
test ! -e /var/lib/docker || du -sh /var/lib/docker
ss -lntup
```

Expected: Docker 包未安装、`/var/lib/docker` 不包含既有业务数据、只有 SSH 监听。任何不一致都停止安装。

- [ ] **Step 2: 使用阿里云官方 Alibaba Cloud Linux 3 路径安装**

```bash
dnf -y install wget firewalld
wget -O /etc/yum.repos.d/docker-ce.repo http://mirrors.cloud.aliyuncs.com/docker-ce/linux/centos/docker-ce.repo
sed -i 's|https://mirrors.aliyun.com|http://mirrors.cloud.aliyuncs.com|g' /etc/yum.repos.d/docker-ce.repo
dnf -y install dnf-plugin-releasever-adapter --repo alinux3-plus
dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker firewalld
```

Expected: 所有安装命令退出 0；若仓库兼容插件或包解析失败，立即停止，不切换到第三方安装脚本。

- [ ] **Step 3: 配置并验证防火墙**

```bash
firewall-cmd --permanent --add-service=ssh
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
firewall-cmd --list-all
```

Expected: 只包含 SSH、HTTP、HTTPS 服务；没有 3000、3306 或任意宽范围业务端口。

- [ ] **Step 4: 记录并验证版本**

```bash
docker version
docker compose version
rpm -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

将确切 RPM NEVRA 与 Compose 版本写入非敏感部署记录。后续升级必须作为独立变更，先备份和测试。

### Task 2: 阿里云云监控告警

**Files:**
- Modify: `docs/checklists/production-resources.md`
- Modify: `docs/runbooks/production.md`

**Interfaces:**
- Consumes: 阿里云 ECS 资源所有者权限和可长期接收通知的联系人。
- Produces: 主机与应用健康异常的实际通知能力。

- [ ] **Step 1: 配置主机指标告警**

为目标 ECS 创建四条告警：CPU 连续 15 分钟超过 80%、内存连续 10 分钟超过 85%、磁盘使用率超过 80%、实例不可用。通知渠道使用用户实际可接收的短信、电话或邮件。

- [ ] **Step 2: 接入应用健康结果**

将 `kaifanla-health.service` 非零结果或其日志状态接入自定义监控；事件名固定为 `kaifanla.health.failed`，正文只包含时间、主机名和单行无秘密原因。

- [ ] **Step 3: 验证通知真实到达**

临时把健康检查 URL 指向 `http://127.0.0.1:9/health-check-test`，手工运行 health service，确认云监控收到失败并向联系人发出通知；立即恢复 `https://api.guziyi.cn/api/v1/health` 并再次运行，确认恢复为成功。记录两次时间，不记录联系人隐私内容。

### Task 3: 管理员密码与 ACME 联系方式关卡

**Files:**
- Modify: `docs/checklists/production-resources.md`
- Modify: `DEPLOYMENT.md`

**Interfaces:**
- Consumes: 用户对管理员密码的本地确认和可接收证书通知的邮箱。
- Produces: 可实际登录的管理员哈希与 Certbot `ACME_EMAIL`。

- [ ] **Step 1: 确认管理员密码可用性**

只向用户询问“记得”或“需要重置”，不要求发送密码。若记得，沿用已配置 Argon2id 哈希；若需要重置，在本地 PowerShell 使用 `Read-Host -AsSecureString` 交互读取，通过进程环境传给 `@node-rs/argon2` 生成哈希，随后立即删除该进程环境变量并关闭终端。

- [ ] **Step 2: 验证哈希格式而不输出值**

只检查生产环境中的 `ADMIN_PASSWORD_HASH` 以 `$argon2id$` 开头且长度至少 80；输出布尔结果。首次部署后用户亲自登录管理后台，成功后才继续微信体验版。

- [ ] **Step 3: 收集 ACME 联系邮箱**

用户提供一个可长期接收证书到期与账户通知的邮箱，写入服务器 `0600` 环境文件变量 `ACME_EMAIL`。Certbot 必须使用该邮箱和服务条款参数注册，不使用无邮箱模式。
