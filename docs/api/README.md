# 个人选菜清单 API

本文档描述原生微信小程序和 Next.js 管理后台使用的 HTTP API。机器可读契约见 [openapi.yaml](./openapi.yaml)。接口实现必须先更新契约和契约测试，再修改服务端代码。

## 基本约定

- 基础路径：`/api/v1`。
- 数据格式：除图片上传和媒体读取外，统一使用 `application/json; charset=utf-8`。
- 金额：全部使用人民币“分”的整数，例如 `1299` 表示 `¥12.99`。
- 时间：UTC ISO 8601 字符串，例如 `2026-08-20T08:00:00.000Z`。
- ID：服务端生成的不可枚举字符串，客户端不得推测或自建资源 ID。
- 成功响应：`{ "code": 200, "message": "success", "data": ... }`。
- 失败响应：`{ "code": 400, "message": "请求参数不正确", "data": null }`。
- 响应体 `code` 是 HTTP 数字状态码，并且必须与实际 HTTP 状态一致；客户端依据数字状态码分支。
- 每个响应通过 `X-Request-ID` 响应头返回追踪 ID，不在 JSON 中重复返回。客户端可以选择发送同名请求头；未发送或内容不安全时，服务端会重新生成。
- `VALIDATION_ERROR`、`CONFLICT` 等符号错误码只用于服务端日志，不属于公开 API 契约。
- 客户端不得提交用户 ID、`openid`、参考价格或预估合计。服务端从会话确定用户并重新读取价格、计算合计。

## 认证

### 小程序用户

1. 小程序调用 `wx.login` 获取一次性 `code`。
2. 调用 `POST /api/v1/auth/wechat`。
3. 后续私有请求携带 `Authorization: Bearer <token>`。
4. 令牌最长有效 30 天；失效后重新静默登录。

服务端不向客户端返回 `openid`，数据库也不保存明文 `openid`。

### 管理员

- `POST /api/v1/admin/session` 登录后设置 `Secure + HttpOnly + SameSite=Strict` Cookie。
- 登录响应和 `GET /api/v1/admin/session` 返回 CSRF 令牌。
- 所有会改变数据的管理接口同时要求管理员 Cookie 和 `X-CSRF-Token`。
- 管理员会话最长有效 12 小时。

## 幂等和并发

- 新建、编辑、复制清单使用 UUID `idempotencyKey`。相同用户重复提交相同键时返回第一次成功结果，不重复写入。
- 清单编辑、分类编辑和菜品编辑携带 `expectedUpdatedAt`。记录已被更新时返回 HTTP `409`，客户端必须刷新后重试。
- 收藏使用幂等 `PUT`/`DELETE`；重复添加或删除仍返回成功状态。

## 隐私边界

- 收藏、清单、资料和头像均从用户会话确定所有权。
- 对不存在和不属于当前用户的私有资源统一返回 HTTP `404`，避免泄露资源是否存在。
- 管理后台只接收聚合统计，不提供用户列表、头像昵称、收藏明细或清单内容。
- “清空个人数据”只删除收藏和清单；“注销账号”同时删除资料、头像、会话和身份映射。

## 主要端点

| 范围 | 方法与路径 | 用途 |
| --- | --- | --- |
| 系统 | `GET /api/v1/health` | 检查服务和数据库可用性 |
| 身份 | `POST /api/v1/auth/wechat` | 微信静默登录 |
| 身份 | `DELETE /api/v1/auth/logout` | 退出当前用户会话 |
| 资料 | `GET/PATCH /api/v1/profile` | 读取或修改昵称 |
| 资料 | `POST /api/v1/profile/avatar` | 上传或替换头像 |
| 资料 | `POST /api/v1/profile/onboarding/complete` | 完成或跳过首次引导 |
| 资料 | `DELETE /api/v1/profile/data` | 清空收藏和清单 |
| 资料 | `DELETE /api/v1/profile/account` | 注销账号 |
| 菜单 | `GET /api/v1/categories` | 获取可用分类 |
| 菜单 | `GET /api/v1/dishes` | 搜索和分页获取菜品 |
| 菜单 | `POST /api/v1/dishes/availability` | 批量刷新菜品状态与价格 |
| 收藏 | `GET /api/v1/favorites` | 获取当前用户收藏 |
| 收藏 | `PUT/DELETE /api/v1/favorites/{dishId}` | 添加或取消收藏 |
| 清单 | `GET/POST /api/v1/lists` | 清单列表或新建清单 |
| 清单 | `GET/PATCH/DELETE /api/v1/lists/{listId}` | 查看、编辑或删除清单 |
| 清单 | `POST /api/v1/lists/{listId}/copy` | 按当前菜品状态复制清单 |
| 管理 | `POST/GET/DELETE /api/v1/admin/session` | 管理员会话 |
| 管理 | `GET /api/v1/admin/stats` | 匿名聚合统计 |
| 管理 | `/api/v1/admin/categories` | 分类管理 |
| 管理 | `/api/v1/admin/dishes` | 菜品管理 |
| 管理 | `POST /api/v1/admin/uploads/dish-image` | 上传菜品图片 |

## 错误状态

| HTTP / `code` | 含义 |
| --- | --- |
| 400 | 请求格式或字段不符合契约 |
| 401 | 会话缺失、无效或过期 |
| 403 | 管理员 CSRF/来源校验失败等禁止操作 |
| 404 | 资源不存在或当前用户无权感知 |
| 409 | 并发版本、菜品状态或删除前置条件冲突 |
| 429 | 请求频率超过限制 |
| 502 | 微信登录服务暂时不可用 |
| 500 | 未预期服务端错误；细节仅记录在服务端日志 |
| 503 | 服务或数据库暂时不可用 |

错误消息用于向用户简要说明，不作为程序分支依据；客户端必须依据与 HTTP 状态一致的数字 `code` 判断。服务端日志会同时记录内部符号错误码和 `requestId`，用于定位问题。
