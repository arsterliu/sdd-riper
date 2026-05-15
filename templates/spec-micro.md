---
date: YYYY-MM-DD
task-name: "Task Name Placeholder"
mode: micro
status: draft   # draft | archived
reopened-from: ""
context-source: ""
---

<!--
Micro 模式：适合单文件 bugfix、配置调整、文案修改等极轻量任务。
Research / Innovate 整体跳过；直接 Plan → Execute → Review（仅 Axis2）。
所有 RIPER 门禁中保留：Human Gate（Plan 审批）、Execute Log、debug-before-retry。
-->

## Summary
<!-- 热区：每次阶段变更后由 AI 更新；resume 时优先读此块 -->
<!-- 格式：当前阶段 | 核心目标（一句话）| 最新进展 -->

## Invocation
<!-- 核心目标 -->

## Plan

Plan Approved By:
Approved At:

<!-- 文件路径 + 改动点 + 验收条件；步骤粒度尽量小 -->

## Execute Log
<!-- append-only；每个 Plan step 完成后追加一条记录 -->
<!-- 格式：Step N: <描述> | Status: DONE/BUGFIX/… | Deviation: none/<说明> | Timestamp: ISO-8601 -->

## Review Summary
<!-- 仅 Axis2（Code Diff Scope）：改动是否在 Plan 声明边界内 -->
<!-- verdict: PASS | PASS_WITH_CONCERNS | FAIL_CODE -->
