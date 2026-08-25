# 「开饭啦」小程序发布实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已验证的「开饭啦」体验版提交微信审核并发布正式版，同时保证名称、域名、隐私声明和实际功能一致。

**Architecture:** 体验版和正式版只访问已通过生产验收的 `https://api.guziyi.cn`。代码验证在本地完成，名称申请、合法域名、隐私声明、服务类目、上传审核和发布由资源所有者在微信公众平台/开发者工具完成，每个外部步骤都用真实设备行为验证。

**Tech Stack:** 微信原生小程序、TypeScript、微信开发者工具、Vitest、微信公众平台、HTTPS API。

**Spec:** `docs/superpowers/specs/2026-08-25-kaifanla-production-deployment-design.md`

**Prerequisite Plans:**
- `docs/superpowers/plans/2026-08-25-kaifanla-production-runtime.md`
- `docs/superpowers/plans/2026-08-25-kaifanla-operations-and-deployment.md`

## Global Constraints

- 小程序 AppID 固定为 `wx0006792d6129b164`，代码与上传项目必须一致。
- 产品名称为“开饭啦”；正式名称只通过微信公众平台合规申请，不用代码冒充平台名称。
- 产品是个人菜单与选菜清单，不描述为点单、外卖、支付、门店、桌台、配送或履约服务。
- request、uploadFile、downloadFile 合法域名均使用 `https://api.guziyi.cn`，不关闭正式版 URL 校验。
- 隐私声明准确覆盖微信身份映射、可选头像/昵称、收藏、清单、清空数据和账号注销。
- 体验版通过两个账号、iOS 与 Android 验收后才能提交审核；审核通过后由用户确认发布。
- 不执行任何 Git 命令；不上传未通过本地门禁的工作区状态。

---

## File Map

```text
apps/miniapp/src/app.json                 全局标题“开饭啦”
apps/miniapp/project.config.json          AppID、URL 校验、上传设置
apps/miniapp/project.private.config.json  本地开发者工具名称
apps/miniapp/src/config.ts                develop/trial/release Origin
docs/checklists/release.md                生产与微信发布证据
docs/checklists/monthly-operations.md     月度恢复、证书、磁盘和真机检查
DEPLOYMENT.md                             非敏感发布状态
```

### Task 1: 发布前代码与生产端点门禁

**Files:**
- Modify: `apps/miniapp/src/app.json`
- Modify: `apps/miniapp/project.private.config.json`
- Modify: `apps/miniapp/src/config.ts`
- Verify: `apps/miniapp/project.config.json`
- Create: `docs/checklists/release.md`

**Interfaces:**
- Consumes: `wx.getAccountInfoSync().miniProgram.envVersion`。
- Produces: 开发版访问本机、体验版/正式版访问生产 HTTPS 的构建配置。

- [ ] **Step 1: 只读确认平台与生产证据**

确认 AppID、域名备案、ECS 公网 IP、HTTPS 证书、生产健康检查、MySQL 隔离、首次 OSS 备份与恢复记录全部存在。任何一项缺失时停止上传体验版。

- [ ] **Step 2: 确认最终配置内容**

`apps/miniapp/src/app.json` 全局标题为“开饭啦”；`project.private.config.json` 项目名为“开饭啦”；`src/config.ts` 为：

```ts
export const API_ORIGINS = {
  develop: "http://127.0.0.1:3000",
  trial: "https://api.guziyi.cn",
  release: "https://api.guziyi.cn",
} as const;
```

`project.config.json` 的 AppID 为 `wx0006792d6129b164`，`urlCheck` 为 `true`，不加入绕过域名校验的选项。

- [ ] **Step 3: 运行本地完整门禁**

```powershell
pnpm verify:server
pnpm verify:miniapp
pwsh deploy/tests/compose-config.ps1
pwsh deploy/tests/nginx-policy.ps1
```

Expected: 四条命令全部退出 0，无 warning 或秘密输出。

- [ ] **Step 4: 创建发布证据清单**

清单记录非敏感证据：AppID、代码内名称、正式 Origin、证书有效期、健康检查时间、备份 snapshot ID、恢复演练结果、上传版本号、体验二维码生成时间、测试设备/微信账号代号、审核提交时间、审核结果和正式发布时间。

### Task 2: 微信公众平台名称、域名、类目与隐私配置

**Files:**
- Modify: `docs/checklists/release.md`
- Modify: `DEPLOYMENT.md`

**Interfaces:**
- Consumes: 微信公众平台管理员权限和已健康的生产域名。
- Produces: 与真实功能一致的平台元数据和网络权限。

- [ ] **Step 1: 核对当前官方规则**

在操作当天只使用微信公众平台控制台显示的名称规则、个人主体可选服务类目、备案状态和隐私配置要求。若控制台与旧文档不一致，以控制台为准并把非敏感差异写入发布清单。

- [ ] **Step 2: 申请正式名称“开饭啦”**

提交名称申请前在平台内检查占用与受保护词提示。若平台拒绝该名称，不使用近似字符规避；停止发布并让用户重新选择名称，再同步修改代码和设计记录。

- [ ] **Step 3: 配置合法域名**

在开发管理的服务器域名设置中，把 `https://api.guziyi.cn` 分别加入 request、uploadFile、downloadFile。若平台要求校验文件，将平台生成的原始文件以精确路径交由 Nginx 提供，不改名、不改内容，并在验证完成后按平台指示保留。

- [ ] **Step 4: 选择真实服务类目**

只选择个人主体当前可用且最贴近“个人菜单/工具/清单”的类目。若控制台只提供与餐饮交易、外卖或门店经营相关的类目，不误选，不隐藏功能，停止提交并记录平台限制。

- [ ] **Step 5: 填写隐私声明**

声明内容逐项对应实际行为：

- 微信登录用于建立不可逆摘要标识的个人账户。
- 头像和昵称是可选资料，可跳过并可后续修改。
- 收藏和选菜清单属于用户私有数据。
- 管理员只查看匿名汇总，不读取用户资料或清单内容。
- 用户可清空个人数据并注销账号；注销后重新进入视为新账户。
- 菜品图片由管理员提供，头像使用短期签名 URL。

运营者联系方式只填用户能够长期接收的真实信息，不把个人密钥或内部地址写入声明。

### Task 3: 上传体验版

**Files:**
- Read-only upload source: `apps/miniapp`
- Modify: `docs/checklists/release.md`

**Interfaces:**
- Consumes: 微信开发者工具已登录身份、通过门禁的项目目录。
- Produces: 可扫码的体验版及可追溯版本说明。

- [ ] **Step 1: 在开发者工具导入并复核**

导入路径为仓库中的 `apps/miniapp`，确认 AppID、项目名、`miniprogramRoot=src/`、基础库版本和 URL 校验开启。清理开发者工具缓存后重新编译，确认没有引用 `menu.example.com` 或本机 Origin 的体验版请求。

- [ ] **Step 2: 执行开发者工具预览**

使用体验环境扫码，观察所有请求 Host 都是 `api.guziyi.cn`，TLS 无证书错误，登录接口不会回退到模拟数据。

- [ ] **Step 3: 上传带语义版本的体验版**

首次版本使用 `1.0.0`，说明填写“开饭啦首次上线：个人选菜、收藏、清单和可选资料”。不使用“下单”“支付”“外卖”措辞。上传成功后把平台生成的时间和版本写入发布清单。

### Task 4: 双账号、双平台体验验收

**Files:**
- Modify: `docs/checklists/release.md`

**Interfaces:**
- Consumes: 体验版二维码、两个互不关联的微信账号、iOS 与 Android 真机。
- Produces: 核心功能、隔离、持久化、隐私和故障行为的实测证据。

- [ ] **Step 1: 验证首次登录与资料流程**

账号 A 保存昵称/头像，账号 B 跳过；两者均进入选菜首页。重启小程序后状态保持，账号 A 的资料不会出现在账号 B。

- [ ] **Step 2: 验证菜单、搜索、收藏与草稿**

两端验证分类、菜品详情、下拉刷新、搜索、收藏/取消收藏；账号 A 的收藏与账号 B 隔离。创建未保存草稿后杀死并重开小程序，草稿按产品现有规则恢复。

- [ ] **Step 3: 验证清单生命周期**

创建带数量和备注的清单，验证总价；保存、重复提交、编辑、复制、删除。价格变化后历史快照保持保存时价格，新编辑使用当前价格。

- [ ] **Step 4: 验证图片与安全边界**

验证菜品图片 HTTPS 加载、头像上传格式/大小拒绝、签名头像过期、未登录接口拒绝、频率限制返回安全中文错误。确认界面不存在支付、桌台、配送或分享诱导。

- [ ] **Step 5: 验证清空与注销**

账号 A 清空数据后收藏/清单消失但账户仍可用；随后注销账号，旧令牌失效，重新进入建立新账户。账号 B 数据不受任何影响。

- [ ] **Step 6: 验证服务重启持久化**

在备份成功后重启 `server` 容器，复测两个账号的数据和图片；再运行健康检查，确认无失败 unit、证书和备份状态正常。

### Task 5: 提交审核、发布与发布后检查

**Files:**
- Modify: `docs/checklists/release.md`
- Create: `docs/checklists/monthly-operations.md`
- Modify: `DEPLOYMENT.md`

**Interfaces:**
- Consumes: 全部体验验收证据和准确平台声明。
- Produces: 审核通过并正式发布的可搜索小程序，以及月度运维制度。

- [ ] **Step 1: 提交真实审核资料**

应用简介、截图、类目和隐私说明只描述当前已实现功能。审核备注说明这是个人菜单和选菜清单工具，不提供交易或履约。提交后记录审核单号和时间。

- [ ] **Step 2: 处理审核反馈**

若反馈涉及名称、类目、备案、隐私或功能，不通过隐藏入口或虚假说明规避。将反馈与拟修改范围交用户确认，修改后重新执行受影响的本地门禁和真机步骤。

- [ ] **Step 3: 审核通过后由用户确认发布**

发布是面向真实用户的外部状态变更。审核通过后再次向用户确认，得到明确授权才点击发布。

- [ ] **Step 4: 发布后独立验证**

使用未加入体验成员的微信账号搜索“开饭啦”，进入正式版并执行登录、菜单、收藏、保存清单和图片加载烟雾测试。服务端日志仅核对状态码、路径和请求 ID，不读取用户私有数据。

- [ ] **Step 5: 建立月度运维清单**

每月记录：OSS 恢复演练、证书剩余天数、根盘与数据目录用量、容器健康、最近备份、依赖/安全更新评估、备案和联系方式准确性、微信类目/隐私规则变化，以及一次 iOS/Android 真机烟雾测试。任何升级都先备份、测试迁移、部署、健康验证并保留旧镜像。

## Release Completion Gate

- 代码、容器、Nginx 与备份测试全部通过。
- `api.guziyi.cn` HTTPS 有效，MySQL 不暴露公网，数据和图片通过重启持久化验证。
- OSS 备份从异地副本恢复到隔离目标并完成数据/文件校验。
- 微信平台正式名称、域名、类目和隐私声明与真实功能一致。
- 两个微信账号在 iOS 与 Android 的完整体验流程通过。
- 审核通过后获得用户明确发布授权，正式版可由无关账号搜索和使用。
