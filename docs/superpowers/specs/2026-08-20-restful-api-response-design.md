# `/api/v1` 统一 REST 响应结构设计

## 背景

当前 23 个 `/api/v1` 路由使用以下统一信封：

```json
{
  "ok": true,
  "data": {}
}
```

失败响应则使用 `ok/error` 结构。管理员后台通过 `adminFetch` 解析该信封，共享契约、路由测试和 OpenAPI 也依赖这一格式。

管理员登录还存在一个独立的本地配置问题：Argon2id 哈希包含未转义的 `$`。Next.js 16 会把 `.env` 中的 `$NAME` 当作变量引用展开，导致运行时读到的 `ADMIN_PASSWORD_HASH` 被截断，`POST /api/v1/admin/session` 因无法验证哈希而返回 HTTP 500。

## 目标

- 在现有 `/api/v1` 上原地迁移全部 JSON API，不新增 `/api/v2`，也不保留旧信封兼容层。
- 所有 JSON 响应固定使用 `code`、`message`、`data` 三个字段。
- `code` 与实际 HTTP 状态码一致，HTTP 状态继续表达请求结果。
- 成功响应继续返回现有业务 DTO，不改变 DTO 内部字段。
- 失败响应只向客户端暴露安全中文消息；内部业务错误码继续用于日志。
- 保留请求链路追踪能力，但只通过 `X-Request-ID` 响应头传递请求 ID。
- 修复本地管理员密码哈希被 Next.js 环境变量展开的问题，并在开发手册中记录正确写法。

## 非目标

- 不改变资源路径、请求体、认证方式、授权边界或数据库模型。
- 不增加旧响应结构的兼容开关。
- 不修改 `/media/*` 图片二进制响应。
- 不把所有 HTTP 响应改成 HTTP 200。
- 不替用户启动或重启开发服务器。

## 响应契约

共享契约定义统一响应类型：

```ts
export type ApiResponse<T> =
  | {
      code: number;
      message: "success";
      data: T;
    }
  | {
      code: number;
      message: string;
      data: null;
    };
```

### 成功响应

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "csrfToken": "example-csrf-token-value-32-characters",
    "expiresAt": "2026-08-20T12:00:00.000Z"
  }
}
```

规则：

- `code` 等于真实 HTTP 状态码，例如 200 或 201。
- `message` 固定为小写字符串 `success`。
- `data` 是端点原有 DTO。创建、分页和动作响应均保留现有业务字段。
- 暂不重新设计各端点原有状态码。当前使用 200、201 或其他成功状态的地方继续保持。
- 删除接口继续返回 HTTP 200，并在 `data` 中保留现有 `{ "success": true }`，从而保证每个 JSON 响应都有统一结构。

### 失败响应

```json
{
  "code": 401,
  "message": "用户名或密码不正确",
  "data": null
}
```

规则：

- `code` 等于真实 HTTP 错误状态码，例如 400、401、403、404、409、429、500、502 或 503。
- `message` 复用当前错误归一化逻辑产生的中文安全消息。
- `data` 固定为 `null`。
- `VALIDATION_ERROR`、`UNAUTHENTICATED` 等内部业务错误码不再进入响应体，但继续写入服务端日志。
- 未预期异常继续统一返回 HTTP 500 和安全消息，不暴露堆栈、密钥或内部实现。
- 健康检查成功时返回 `{ code: 200, message: "success", data: { status: "ok" } }`；数据库不可用时返回 HTTP 503 和 `{ code: 503, message: "服务暂时不可用", data: null }`。

### 请求 ID

- 客户端可以选择发送 `X-Request-ID`。
- 服务端仅接受符合现有安全正则的值；缺失或不合法时生成 UUID。
- 响应始终通过 `X-Request-ID` 头返回最终值。
- 服务端日志使用同一个请求 ID 关联请求。
- 响应 JSON 不再包含 `requestId`。
- 请求 ID 不参与身份认证、会话管理或权限判断。

## 服务端架构

### 共享契约

`packages/contracts/src/result.ts` 将 `ApiResult<T>`、`apiSuccess` 和 `apiFailure` 迁移到新结构。构造函数接收真实 HTTP 状态码，避免状态行与响应体 `code` 不一致。

建议接口：

```ts
apiSuccess(data, status = 200)
apiFailure(status, message)
```

共享契约测试必须覆盖 200、201 和失败时的 `data: null`。

### HTTP 处理器

`apps/server/src/lib/http/handler.ts` 继续作为集中式边界：

- 路由处理器返回普通值时，自动构造 HTTP 200 成功响应。
- 捕获异常后使用 `normalizeError` 得到安全状态、消息和内部业务错误码。
- 响应体只写入状态、消息和 `null`；日志继续记录内部业务错误码。
- 无论成功或失败，都写入并返回 `X-Request-ID`。

新增或调整一个服务端 JSON 成功响应辅助函数，用于以下显式响应：

- HTTP 201 创建成功；
- 需要设置 `Set-Cookie` 的管理员会话；
- 需要额外响应头的端点；
- HTTP 503 健康检查失败。

辅助函数必须让 HTTP 状态和 body `code` 来自同一个参数，防止不一致。

### 路由迁移

全部 23 个 `/api/v1` 路由迁移到集中式构造函数。返回普通 DTO 的路由无需手工构造信封；当前直接调用 `NextResponse.json(apiSuccess(value))` 的路由改用统一辅助函数。

上传端点仍接收 `multipart/form-data`，但其 JSON 结果采用新结构。`/media/*` 不属于本次 JSON API 迁移范围。

## 客户端迁移

`apps/server/src/lib/admin-api.ts` 改为解析 `ApiResponse<T>`：

- 成功时返回 `payload.data`。
- 非 2xx 或响应 `code` 与 HTTP 状态不一致时按失败处理。
- 失败时使用 `message` 创建 `AdminApiError`。
- `AdminApiError` 保存数值状态码和从 `X-Request-ID` 头读取的可选请求 ID。
- 不再依赖字符串业务错误码。

登录页、退出逻辑和后台 CRUD 继续通过 `adminFetch` 调用，因此集中修改后无需在每个组件重复解析响应。

这是 `/api/v1` 的破坏性变更。仓库外部消费者必须与本次服务端版本同时迁移；本设计不提供双格式响应。

## OpenAPI 与文档

- `docs/api/openapi.yaml` 中所有成功响应 schema 改为 `code/message/data`。
- 所有公共错误响应 schema 改为 `code/message/data: null`。
- `code` schema 与对应 HTTP 响应状态保持一致。
- 删除 JSON schema 中的 `ok`、`error` 和 `requestId` 字段。
- `docs/api/README.md` 更新基本响应约定和请求 ID 说明。
- `docs/runbooks/local-development.md` 增加 Next.js `.env` 的 `$` 转义说明。

## 管理员登录 500 修复

实际 `.env` 中的 Argon2id 哈希必须将每个 `$` 写为 `\$`：

```dotenv
ADMIN_PASSWORD_HASH=\$argon2id\$v=19\$m=19456,t=2,p=1\$FFm7iE20Rzj9c9dT57QTlA\$o8TUvKqh5VRwteyAoWn6IGHdYV3Z3kEhCy/mKQxbAA8
```

原因是 Next.js 16 会自动展开 `.env` 中的 `$VARIABLE`。普通 `dotenv` 不会完整复现该行为，因此验收必须使用 Next.js 自带的 `@next/env` 加载器。

本地密码 `123456` 只用于开发。生产环境必须重新生成强密码的 Argon2id 哈希。

## 测试策略

实施遵循测试驱动开发：

1. 先修改共享契约测试，期望新结构并确认旧实现失败。
2. 修改 HTTP 处理器测试，覆盖普通成功、自定义状态、所有常用错误状态和请求 ID。
3. 修改路由测试，至少覆盖管理员登录/退出、资源创建/删除、上传响应和健康检查。
4. 新增 `adminFetch` 测试，覆盖成功解析、失败解析、状态不一致和请求 ID 响应头。
5. 使用 Next.js 16 的 `@next/env` 加载实际 `.env`，确认哈希仍以 `$argon2id$` 开头且密码 `123456` 能通过验证。
6. 运行共享契约测试、服务端单元测试、类型检查、Lint、MySQL 集成测试和生产构建。

测试不得通过启动新的开发服务器完成。真实浏览器登录由用户在自行重启服务后验收。

## 验收标准

- 23 个 `/api/v1` 路由的所有 JSON 响应均只包含顶层 `code`、`message`、`data`。
- 响应体 `code` 与 HTTP 状态码一致。
- 成功响应 `message` 为 `success`，失败响应 `data` 为 `null`。
- 管理后台能够解析新响应并显示安全错误消息。
- `X-Request-ID` 在成功和失败响应中均存在，且与日志一致。
- OpenAPI、API README、TypeScript 契约与实现一致。
- Next.js 加载后的管理员密码哈希有效，密码 `123456` 离线验证通过。
- 不启动或重启用户的开发服务器。

## 迁移风险与缓解

- **外部客户端同时失效：** 这是已确认的 `/api/v1` 原地破坏性改造；通过同步更新 OpenAPI 和共享契约降低错配风险。
- **遗漏显式 `NextResponse`：** 盘点所有 23 个路由，并用结构扫描和路由测试检查旧 `ok/error` 字段残留。
- **HTTP 状态与 body `code` 不一致：** 两者由同一个响应辅助函数参数生成。
- **错误分支能力下降：** 字符串业务错误码不再返回，客户端只依据 HTTP/数值 `code` 分支；内部日志仍保留业务错误码。
- **Argon2 哈希再次被破坏：** 文档记录转义规则，并用 Next 自己的环境加载器验收。
