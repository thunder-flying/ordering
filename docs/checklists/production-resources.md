# 生产资源验收记录

验收日期：2026-09-18（Asia/Shanghai）

## 已完成

- DNS：`api.guziyi.cn` A 记录解析到 `8.137.174.33`，TTL 300。
- HTTPS：Let's Encrypt 证书匹配 `api.guziyi.cn`，有效期至 2026-12-17。
- 反向代理：HTTP 健康请求 301 跳转 HTTPS；HTTPS `/api/v1/health` 返回 200；Nginx 配置测试通过。
- 网络隔离：公网只监听 80/443/22；宿主机未监听 3000/3306。
- 数据库：生产 MySQL 健康；Prisma `20260820030633_init` 已完成，重复执行 `migrate deploy` 报告无待迁移。
- 健康检查：`kaifanla-health.service` 执行成功；`kaifanla-health.timer` 已启用，每 5 分钟运行。

## 待人工完成

- 微信公众平台配置 `https://api.guziyi.cn` 到 request、uploadFile、downloadFile 合法域名。
- 微信开发者工具使用 AppID `wx0006792d6129b164` 上传当前小程序代码，并在版本管理中切换为体验版。
- 用至少一台真实设备验证登录、菜单、图片、收藏和清单流程。

本文件不记录数据库口令、微信 AppSecret、管理员密码、SSH 私钥或 OSS 凭据。
