---
date: YYYY-MM-DD
task-name: "Task Name Placeholder"
mode: standard
status: draft   # draft | archived
reopened-from: ""
context-source: ""
---

<!--
Requirement = 当前执行口径（任务定义，是锚）
Context     = 背景材料包（历史资料、旧Spec、CodeMap等，不替代Requirement）
Spec        = Invocation + Research 收敛后的单一决策链
-->

## Summary
<!-- 热区：3-5行，每次阶段变更后由 AI 更新；resume 时优先读此块 -->
<!-- 格式：当前阶段 | 核心目标（一句话）| 关键约束 | 最新进展 -->

## Invocation
<!-- 核心目标 -->

### Requirement
<!-- 我对需求的复述（必填） -->

### Constraints
<!-- 技术或业务约束 -->

### Scope
<!-- 影响的范围和边界 -->

### Risks
<!-- 风险及应对措施 -->

### Checklist
<!-- 可验证的验收标准 -->

## Research

### Findings
<!-- 代码出处、调用链、依赖关系、已确认行为（必填） -->

### Open Questions
<!-- 从 Findings 中识别的未知点，阻碍进一步判断的疑点（必填） -->

### Assumptions
<!-- Open Questions 暂无答案时的前提填充，需标注"待验证" -->

### Requirement Restatement
<!-- 基于以上三项的综合判断，用自己的话复述需求（最后写，必填） -->

## Innovate Options
<!-- 至少2个方案，含 Pros/Cons/风险/推荐理由 -->

## Plan
<!-- 文件路径 + 函数签名 + 步骤，需人工批准后才能进入 Execute -->

Plan Approved By:
Approved At:

## Execute Log
<!-- append-only；每个 Plan step 完成后追加一条记录 -->
<!-- 格式：Step N: <描述> | Status: DONE/BUGFIX/… | Deviation: none/<说明> | Timestamp: ISO-8601 -->

## Review Verdict
<!-- Spec vs Code 对比结论 -->
<!-- 格式：Review Pass N — <ISO-8601> — <VERDICT> -->
