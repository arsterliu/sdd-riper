# SDD-RIPER Examples

本目录包含了基于 SDD (Spec-Driven Development) 和 RIPER 流程的完整多仓库协作示例。

## 这组示例展示了什么？

这些文件是一个**真实的跨前后端协同开发场景**的演示（实现一个用户登录功能）。
通过这些示例，你可以直观地看到 SDD 理念是如何落地到日常开发文件中的。示例包含了：

1. **前端的完整 Spec (`examples/frontend-app/mydocs/`)**: 展示了前端如何完成 UI 和请求调用的规划，以及表单提交流程图。
2. **后端的完整 Spec (`examples/backend-api/mydocs/`)**: 展示了后端如何完成数据库查询、密码哈希比对与 JWT 签发的规划，以及认证服务流程图。

> **注意**：CodeMap 已改为按需计算视图（`sdd codemap <dir>`），不再持久化。架构概览可随时运行命令获取。ProjectMap 已移除——跨仓协调应通过 Spec 的 Research 和接口契约来管理，而非独立产物。

## 如何对照示例学习？

推荐按照以下顺序阅读这些文件，以理解 SDD-RIPER 的流转逻辑：

1. **再看各端的 Spec**
   - 在本示例中，路径分别是 `examples/frontend-app/mydocs/specs/*.md` 和 `examples/backend-api/mydocs/specs/*.md`。
   - 观察前/后端是如何在 Spec 中复述各自的需求边界的。
   - 关注 §6 (Research Findings) 阶段，看两端是如何各自调研并确认接口格式和相关依赖库的。
   - 关注 §8 (Plan) 阶段，看两端如何列出原子级的执行步骤（包含具体的文件路径和方法调用）。
2. **按需查看架构视图**
   - 运行 `sdd codemap <dir>` 获取当前源码的实时架构概览（入口点、模块边界、组件、依赖）。

## 示例中刻意保留的教学点

为了更好地展示最佳实践，这些示例在编写时刻意突出了以下原则：

- **无代码约束 (No Code Bindings)**: 示例不包含特定语言的源代码实现，而是侧重于需求和设计的清晰描述。
- **接口契约先行**: 两端的 Spec 中的 §6 (Research) 和 §8 (Plan) 都基于明确的接口契约展开。
- **Plan 门禁 (Human Gate)**: 在每个 Spec 中，都明确填写了 `> Plan Approved By: ...`，强调了"未经人审阅批准的 Plan 不可进入 Execute 阶段"的核心准则。
- **状态流转**: 示例中的 Spec 状态均为 `status: done`，且包含完整的 `§9 Execute Log` 和 `§10 Review Verdict`，展现了开发闭环后的最终归档形态。
