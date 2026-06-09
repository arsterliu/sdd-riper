---
date: YYYY-MM-DD
task-name: "Task Name Placeholder"
mode: lite
status: draft   # draft | archived
reopened-from: ""
context-source: ""
---

<!--
Lite 模式：适合小改动、轻量 bugfix、熟悉 RIPER 协议的团队。
所有门禁规则与 Standard 一致，区块内容可精简。
-->

## Summary
<!-- 热区：3-5行，每次阶段变更后由 AI 更新；resume 时优先读此块 -->
<!-- 格式：当前阶段 | 核心目标（一句话）| 关键约束 | 最新进展 -->

## Invocation
<!-- 需求复述、目标、约束（必填） -->

## Requirement Review
<!--
苏格拉底式审视：AI 一次性分析需求，**不实时追问**，把所有发现写入本段，最后门禁决定 STOP / CONTINUE。

分析维度：定义边界 / 异常路径 / 约束真实性 / 验收标准 / 内部冲突 / 真实目标

输出格式：
  - 每维度一行 → ✅ Clear / ⚠️ Ambiguous / ❌ Missing
  - 对 ⚠️/❌：列 Open Question + Tentative Assumption + Impact-if-wrong
  - Premise List：隐含前提编号（P1/P2/…）+ AI 当前理解
  - 反对 sycophancy：禁敷衍话术，take a position

门禁（写完触发 AskUserQuestion）：
  - A) STOP — 需先澄清，Spec 保持 draft
  - B) CONTINUE — 接受 Tentative Assumptions（复制到 ### Assumptions），进入下阶段

全部 ✅ 时可省略门禁直接进入下阶段，Premise List 仍要写。
-->

## Open Questions
<!-- 当前不确定的点——包含技术未知点和需求层面未解决的问题（必填） -->

## Innovate Options
<!-- 至少2个方案，或写明：Innovate: Skipped, Reason: [原因] -->

## Plan

Plan Approved By:
Approved At:

<!-- micro-plan：文件 / 改动点 / 验收条件 -->

## Execute Log
<!-- append-only；每个 Plan step 完成后追加一条记录 -->

## Review Summary
<!-- verdict + deviation summary -->
