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
无 ## Research 包裹层；Research 的 5 个子区块（Requirement Review / Findings / Open
Questions / Assumptions / Confirmed Requirement）在 lite 模式下平铺为 5 个 ## 顶层 section。
Innovate Options / Plan / Execute Log / Review Summary 与 standard 模板结构一致。
-->

## Summary
<!-- 热区：3-5行，每次阶段变更后由 AI 更新；resume 时优先读此块 -->
<!-- 格式：当前阶段 | 核心目标（一句话）| 关键约束 | 最新进展 -->

## Invocation
<!-- 用户原始输入 + 目标 + 约束（必填，AI 不修改）；研究校准版见 ## Confirmed Requirement -->

## Requirement Review
<!--
document-first with gate：
- 一次性完成 6 维度苏格拉底式审视（边界 / 异常路径 / 约束真实性 / 验收标准 / 内部冲突 / 目标验证）
- 维度状态表（每行 ✅/⚠️/❌）；对 ⚠️/❌ 列 Open Question + Tentative Assumption + Impact-if-wrong
- Premise List（隐含前提编号 P1/P2/…）
- 写完触发 STOP/CONTINUE 门禁（AskUserQuestion）；6 维度全 ✅ Clear 可省略门禁直接进入 Findings
- 不要实时一次一题追问（避免主上下文被 Q&A 污染）
-->

## Findings
<!-- 代码位置 / 调用链 / 依赖关系 / 已确认的行为 -->

## Open Questions
<!-- 当前不确定的点——包含技术未知点和需求层面未解决的问题（必填） -->

## Assumptions
<!-- 约束填充 + Requirement Review 的 Tentative Assumptions（CONTINUE 后自动复制过来） -->

## Confirmed Requirement
<!-- 基于以上综合判断，用自己的话复述需求（首轮为基准版本，后续追加 Revised — Round N，不覆盖） -->
<!-- 写完触发 Mode Recommendation Gate：用 5 维度评估复杂度，推荐 mode，用户确认后 Edit frontmatter mode: 字段 -->

## Innovate Options
<!-- 至少2个方案；或写明：Innovate: Skipped, Reason: [原因] -->

## Plan

Plan Approved By:
Approved At:

<!-- micro-plan：文件 / 改动点 / 验收条件 -->

## Execute Log
<!-- append-only；每个 Plan step 完成后追加一条记录 -->

## Review Summary
<!-- verdict + deviation summary -->
