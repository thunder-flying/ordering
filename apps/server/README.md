# 个人选菜清单服务端

这是一个 Next.js 模块化单体：同一个应用承载 React 单管理员后台、微信小程序 API、图片访问和定时清理 CLI。业务数据存入 MySQL，Prisma 负责模型与迁移。

本项目是个人菜单与选菜清单工具，不包含支付、订单、门店、桌台、履约、退款、员工账号或角色权限。

## 目录

- `src/app/api/v1`：带统一响应信封的 HTTP 接口。
- `src/app/admin`：React 管理后台，入口为 `/admin/login`。
- `src/modules`：身份、菜单、收藏、清单、资料、上传和匿名统计服务。
- `prisma`：MySQL Schema、迁移与可选种子。
- `tests`：单元、MySQL 集成、跨模块验收和 Playwright 浏览器测试。
- `dist-cli/cleanup-uploads.mjs`：生产构建生成的待删除文件清理命令。

共享请求、响应 DTO 和错误码只在 `packages/contracts` 定义。完整 HTTP 契约见 [OpenAPI 文档](../../docs/api/openapi.yaml)，接口使用说明见 [API README](../../docs/api/README.md)。

## 安全边界

- 微信 `openid` 只以 HMAC 摘要入库；用户令牌只保存加盐哈希。
- 收藏、清单、资料和头像的所有权只从 Bearer 会话解析，不接受客户端 `userId`。
- 管理员会话使用加密、`HttpOnly`、`Secure`、`SameSite=Strict` Cookie；写操作同时检查 CSRF 和 Origin。
- 管理统计只返回人数、数量和菜品级收藏汇总，不查询用户资料或清单内容。
- 菜品和头像按文件实际签名验证格式，原子写入；头像通过 10 分钟签名 URL 访问。
- 服务端统一返回中文安全错误和请求 ID，日志字段白名单不会记录请求体、凭据或数据库地址。

## 常用命令

在仓库根目录运行：

```powershell
pnpm --filter @ordering/server dev
pnpm verify:server
pnpm --filter @ordering/server test:e2e
pnpm --filter @ordering/server build
```

`verify:server` 包含契约测试、Lint、类型检查、服务端单元测试、真实 MySQL 集成/验收测试和生产构建。Playwright 因需要本机 Chromium，作为独立门禁运行。

完整环境准备、迁移和启动步骤见 [本地开发手册](../../docs/runbooks/local-development.md)。
