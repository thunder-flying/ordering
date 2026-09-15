# 开饭啦本地生产镜像记录

- 验证日期：2026-08-25（Asia/Shanghai）
- 构建平台：linux/amd64
- Runtime：`kaifanla-server:local`
  - Image ID：`sha256:a097bf1c3d9a85ed9ee36237cd08e4621e9a3f5c986a6d97a42e747489c236e6`
  - 大小：91.4 MiB
  - 用户：`10001:10001`
  - 入口：`node apps/server/server.js`
- Tooling：`kaifanla-tooling:local`
  - Image ID：`sha256:ff9177c72882af69e7e86ec4ec2c78845533486633fe674831e772778b4c0ffc`
  - 大小：496.6 MiB
  - 用户：`10001:10001`
  - 入口：`pnpm --filter @ordering/server prisma:migrate`
- 秘密值扫描：两个镜像的 Config、History 与 `/app` 文件列表均无本地生产秘密值或 `.env*` 文件命中。
- 本记录使用本地 Image ID；镜像尚未推送到远程 Registry，因此没有 RepoDigest。
