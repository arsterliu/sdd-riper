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

### Requirement Review
<!--
苏格拉底式审视：AI 对需求做一次完整分析，**不进行实时追问**；把所有发现以文档形式写入本区块，最后触发一个门禁让用户决定是否继续。

分析维度（6 项，逐一检查）：
  - 这个词的边界在哪里？（定义不清）
  - 如果 X 发生，期望是什么？（异常路径 / edge case）
  - 这个约束是绝对的还是可商量的？（约束真实性）
  - 谁来判断"完成"？标准是什么？（验收标准缺失）
  - 这个需求和已知约束/目标有没有矛盾？（内部冲突）
  - 为什么要这样做？背后的真实问题是什么？（目标验证）

输出格式：
  1. **维度状态表**：每个维度一行 → ✅ Clear / ⚠️ Ambiguous / ❌ Missing
  2. **对每个 ⚠️ 或 ❌ 的维度**：列出
       - Open Question（具体不清的是什么）
       - Tentative Assumption（AI 当前的暂定理解）
       - Impact-if-wrong（假设错了会怎样影响后续 Plan/Execute）
  3. **Premise List**：把从原始需求中识别的隐含前提编号列出（P1/P2/…），每条注明 AI 当前如何理解
  4. **反对 sycophancy**：禁写"需求很清晰"、"多种可能都可考虑"等敷衍话术；每条结论都要 take a position

门禁（写完上面后必须触发，由 orchestrator 用 AskUserQuestion 执行）：
  - A) **STOP** — 用户需要先线下澄清 / 重新定义；Spec 保持 draft，不进入 Findings
  - B) **CONTINUE** — 接受当前 Tentative Assumptions（将自动复制到 `### Assumptions` 区块），进入 Findings

全部维度都 ✅ Clear 时，可省略门禁直接进入 Findings，但 Premise List 仍要写。
-->

### Findings
<!-- 代码出处、调用链、依赖关系、已确认行为（必填） -->

### Open Questions
<!-- 从 Findings 中识别的技术未知点，阻碍进一步判断的疑点（必填） -->

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
