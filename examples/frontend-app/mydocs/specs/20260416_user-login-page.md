---
date: 2026-04-16
task-name: user-login-page
mode: standard
status: done
---

# User Login Page Spec

> Confirmed Requirement:
> 用户登录页：提供邮箱+密码的表单输入，调用后端 POST /api/login 获取 JWT 进行身份认证，若认证失败则展示错误提示。

## Pre-Requisites

### Open Questions
- [x] 密码最小长度限制？ -> 确认：前端验证至少8位。
- [x] 是否需要“记住我”功能？ -> 确认：v1 版本不需要，默认 token 有效期即可。
- [x] token 存储在 localStorage 还是 cookie？ -> 确认：暂存于 localStorage。

### Assumptions
- 后端 /api/login 接口已准备就绪，格式为 `{ "email": "...", "password": "..." }`
- 前端已有基础组件库（Input, Button, Alert）可用。

### Research Readiness
- [x] Existing code related to the task has been reviewed.
- [x] External dependencies/APIs have been verified.

---

## §1 目标 (Goal)
实现用户登录页面，完成前后端认证闭环，使用户能够通过邮箱和密码登录系统并获取后续请求的访问凭证。

## §2 范围 (Scope)
**包含:**
- 登录页面的 UI 渲染（邮箱、密码输入框，登录按钮，错误提示区）
- 表单的本地验证（必填项、邮箱格式、密码长度）
- 调用 `POST /api/login` 接口
- JWT token 的接收与存储
- 登录成功后的页面跳转

**不包含:**
- 用户注册功能
- 第三方（如 Google/GitHub）OAuth 登录
- 忘记密码/重置密码功能

## §3 约束 (Constraints)
- 必须使用标准的 `fetch` API 或现有项目的 HTTP 客户端调用接口。
- 不绑定特定的前端框架（如 React/Vue），确保逻辑与 UI 分离。
- 密码在网络传输中虽然有 HTTPS 加密，但不应在本地日志中打印。

## §4 风险 (Risks)
- **风险1：接口契约变更** 
  - *缓解措施:* 在 ProjectMap 中定义明确的接口契约，后端变更需同步通知前端。
- **风险2：网络超时或服务器不可用** 
  - *缓解措施:* 增加请求的 Loading 状态，并处理网络异常，给予用户友好的提示。

## §5 验收清单 (Checklist)
- [x] 访问 `/login` 路由能正常展示登录表单。
- [x] 提交空表单或错误格式的邮箱时，触发本地验证错误。
- [x] 输入错误凭证提交后，能展示“用户名或密码错误”等提示。
- [x] 输入正确凭证提交后，localStorage 中成功存入 `token`，页面跳转到 `/dashboard`。

---

## §6 调研结果 (Research Findings)
- **接口文档确认:** 后端提供的接口为 `POST /api/login`。
  - Request: `{"email": "...", "password": "..."}`
  - Response (Success): `200 OK`, Body: `{"token": "eyJhb...", "expires_in": 3600}`
  - Response (Fail): `401 Unauthorized`, Body: `{"error": "invalid_credentials"}`
- **当前项目路由:** 项目入口在 `src/pages/LoginPage`，路由配置需增加 `/login` 路径。

## §7 方案创新 (Innovate Options)
- **方案A：原生 form 提交** 
  - *优点:* 浏览器原生支持，无需额外 JavaScript。
  - *缺点:* 页面会刷新，难以优雅地处理局部 Loading 状态和自定义 JWT 存储。
- **方案B：JS 拦截表单提交 (Fetch API) + 状态管理** (✅ 选中方案)
  - *优点:* 用户体验好，支持 Loading 动画，方便处理 JSON 响应和跳转。
  - *缺点:* 需要额外编写表单状态和请求处理逻辑。

## §8 执行计划 (Plan)
- [x] 1. 创建 UI 组件 `src/pages/LoginPage`，包含邮箱和密码输入框。
- [x] 2. 添加表单状态管理（email, password, loading, error）。
- [x] 3. 实现 `handleSubmit` 逻辑：包含本地验证和 `fetch('POST /api/login')`。
- [x] 4. 处理响应：成功则存 `token` 并跳转 `/dashboard`，失败则设置 `error` 状态。

> Plan Approved By: Alice (Tech Lead) / At: 2026-04-16 10:00

## §9 执行日志 (Execute Log)
- *2026-04-16 10:15* - 完成 UI 组件的基础结构搭建。
- *2026-04-16 10:30* - 接入表单状态和本地验证规则，测试通过。
- *2026-04-16 11:00* - 完成 `fetch` 请求集成，使用 Mock 数据测试通过。
- *2026-04-16 11:30* - 与后端联调，成功获取 JWT，完成存储和跳转。

## §10 审查结论 (Review Verdict)
**PASS**
- UI 和交互符合预期，Loading 和错误提示完整。
- 接口调用符合 `POST /api/login` 契约，Token 成功存入 localStorage。
- 密码未在控制台输出。所有 Checklist 均已通过。
