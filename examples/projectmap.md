---
name: user-login-feature
repos:
  - frontend-app
  - backend-api
updated-at: 2026-04-16
---

# ProjectMap: User Login Feature

这是一个展示多仓库（跨前后端）协作的 ProjectMap 示例。通过定义明确的职责边界和接口契约，确保 `frontend-app` 和 `backend-api` 可以独立并行开发。

## 1. 仓库清单与职责边界 (Repositories & Boundaries)

| Repository | Role / Responsibility |
| :--- | :--- |
| **`frontend-app`** | 负责渲染用户登录表单 UI，收集用户输入并进行本地格式校验，调用登录接口并处理响应（成功跳转或展示错误提示），管理本地 token 存储。 |
| **`backend-api`** | 负责提供统一的认证接口，连接数据库验证用户凭证（邮箱与密码的哈希比对），并下发符合 JWT 标准的访问令牌。 |

## 2. 本次任务涉及范围 (Scope of Changes)

- **frontend-app 需改动:**
  - 新增 `src/pages/LoginPage` 页面组件。
  - 新增 `/login` 路由配置。
  - 更新全局或模块状态管理（集成 `localStorage` 对 token 的存取）。
- **backend-api 需改动:**
  - 新增 `POST /api/login` 路由。
  - 更新或新增验证 Controller 与对应的 Service 逻辑。
  - 引入 `jsonwebtoken` 等必要依赖。

## 3. 核心接口契约 (Interface Contract)

在并行开发中，**接口契约即是 Truth**。前后端必须严格遵守以下定义：

**POST `/api/login`**

*Request Body (application/json):*
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

*Response 200 OK (Success):*
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5...",
  "expires_in": 3600
}
```

*Response 401 Unauthorized (Failure):*
```json
{
  "error": "invalid_credentials"
}
```

*Response 400 Bad Request (Validation Error):*
```json
{
  "error": "missing_parameters"
}
```

## 4. 跨仓库验证清单 (Cross-Repo Checklist)

在两端各自完成单元测试和集成测试后，需进行端到端（E2E）联调验证：

- [x] **前端调用成功:** `frontend-app` 能够成功发起符合契约的 POST 请求。
- [x] **后端返回JWT:** `backend-api` 能够根据正确凭证返回 `200 OK` 状态码和有效的 JWT。
- [x] **错误处理机制:** 发送错误密码时，前端能正确解析 `401` 并显示提示。
- [x] **端到端冒烟测试:** 从用户界面输入到后端验证再到页面跳转，全流程跑通。
