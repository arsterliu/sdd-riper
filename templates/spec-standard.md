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
苏格拉底式追问：不接受需求的字面表述，逐一拆解每个陈述背后的假设。
追问维度：
  - 这个词的边界在哪里？（定义不清）
  - 如果 X 发生，期望是什么？（异常路径 / edge case）
  - 这个约束是绝对的还是可商量的？（约束真实性）
  - 谁来判断"完成"？标准是什么？（验收标准缺失）
  - 这个需求和已知约束/目标有没有矛盾？（内部冲突）
  - 为什么要这样做？背后的真实问题是什么？（目标验证）

操作规则（提问纪律）：
  - 一次只问一题，禁止一锅端：每轮 AskUserQuestion 只承载一个维度，等用户回答后再进入下一题
  - "Push once, push again"：第一轮答案通常是用户事先准备好的话术；至少追问一次（"这个边界在 X 情况下也成立吗？"），逼出未经打磨的真实信号
  - 反对 sycophancy：禁说"这个方向很有意思"、"有多种思路可考虑"、"也可以这样想"等敷衍话术。每次必须 take a position（"按你这个说法，X 场景会冲突，对吗？"），并说明什么证据能改变 AI 的判断
  - Premise Challenge 收口：追问完成后，把所有未显式确认的隐含前提编号列出（如 P1/P2/P3），让用户逐条回 agree / disagree / 需要再聊；模糊回答不算结论

结论：列出所有未被显式回答的问题；有阻碍项时停在此处等待确认，不继续后续步骤。
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
