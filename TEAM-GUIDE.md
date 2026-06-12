# SDD-RIPER 团队落地指南

## 1. TL 决策速览（30秒版本）

**为什么要引入 SDD-RIPER？**
- **防腐化**：强制“先设计后代码”，杜绝 AI 乱改导致的逻辑腐化。
- **透明化**：通过 Spec 文档，让 AI 的思考过程和执行步骤对人类可见。
- **资产化**：开发过程中的决策和背景自动沉淀，不再随对话关闭而消失。

**风险说明**：
- 初期会增加 10%-20% 的文档编写时间，但能减少 50% 以上的重工和 Bug 修复时间。

**建议策略**：
- 挑选 1 个中等复杂度的任务进行为期 1 天的试点。

---

## 2. 一周落地计划

### Day 1-2: 试点阶段
- **目标**：验证流程可行性。
- **行动**：挑选 1 名核心工程师，针对一个正在进行中的任务，跑完完整的 RIPER 流程。
- **关注点**：TL 重点 Review `Plan` 阶段，检查 AI 拆解的任务是否足够原子化。

### Day 3-4: 复盘与扩展
- **目标**：解决实际痛点，补齐模板。
- **行动**：复盘试点过程中的卡点（如：AI 不理解某些内部库）。根据复盘结果更新 `templates/` 或增加 `CodeMap`。
- **规模**：扩展到 2-3 人参与。

### Day 5-7: 全面推广
- **目标**：建立常态化机制。
- **行动**：全组开始使用。启用 `ProjectMap` 进行跨仓库联动。
- **观察点**：通过 `npx sdd-riper status` 观察全员任务进度。

---

## 3. 团队唯一规则

> **“未经 Plan Approved，不得改代码”**

这是 SDD-RIPER 的核心灵魂。无论任务多紧急，必须在 Spec 中完成计划拆解，并获得（人工或 TL）的签名批准后，方可进入 Execute 阶段。

---

## 4. 角色分工

- **核心研发 (Senior)**：
  - 使用 **Standard** 模式运行完整 RIPER 流程。
  - 负责编写和维护 `CodeMap` 和 `ProjectMap`。
  - 作为 Reviewer 审批其他成员的 Plan，并对 Review 四轴中 `Axis 2`（Code Diff Scope）亲自跑 diff 审计，不下放给 subagent。
  - 在 `## Review Verdict` / `## Review Summary` 区块追加 Review Pass N + ISO-8601 timestamp，不覆盖历史 Pass。

- **初级研发 / 低经验同学**：
  - 建议先从 **Lite** 模式入手，培养“思考后再动手”的习惯。
  - 重点关注 `Confirmed Requirement`，确保理解不偏航。

- **TL / 主管 (Team Lead)**：
  - 负责 `Plan Approved` 门禁。
  - 定期查看 `npx sdd-riper status` 报告，识别进度风险。
  - 不必介入每一行代码，但必须把控“方案方向”。

---

## 5. 与 AI 协作的正确姿势

### 意图分类表
| 协作阶段 | 协作模式 | 关键指令 |
| :--- | :--- | :--- |
| **探索 (Research)** | 深度对话 | “基于 context，帮我分析这个 requirement 的潜在风险，写到 ### Requirement Review。” |
| **Mode Recommendation** | 复杂度校准 | “用 5 维度打分评估任务复杂度，推荐 mode；不接受基于 Requirement 字符数的判断。” |
| **规划 (Plan)** | 结构化输出 | “请将选定的方案拆解为原子步骤，并填入 Spec 的 Plan 区块。” |
| **执行 (Execute)** | 严格指令 | “严格按照 Plan 第 1 步执行，不要改动其他文件。” |
| **评审 (Review)** | 对照检查 | “对照原始 Spec 验收清单，检查代码实现是否存在偏差。” |

> **Mode Recommendation Gate** 是 Research 末尾的强制门禁（micro 模式跳过）。它读 **Confirmed Requirement**（不是 raw Requirement）评估复杂度，避免”用户一句话就当小任务”的误判。研发在评审时要看 AI 的 5 维度评分是否站得住脚——这是 mode 校准的关键决策点。

### 自由度表
- **Research (研究)**：中（鼓励多问，但目标要明确）。
- **Innovate (创新)**：高（鼓励尝试不同方案，只要能说清优劣）。
- **Plan (规划)**：**低**（必须精确、死板、原子化）。
- **Execute (执行)**：**零**（禁止在执行阶段“临场发挥”，发现计划不行必须回退）。
- **Review (评审)**：中（基于事实做出判断）。

---

## 6. 方法论深度解析

### sdd_discover 的艺术
`sdd_discover` 动作要求同时接收 **requirement** (你要做什么) 和 **context** (你以前是怎么做的)。
- CLI 推荐入口：`npx sdd-riper discover <dir> --task-name <name> ...`
- 常见错误：只给 requirement，导致 AI 重新发明轮子；只给 context，导致 AI 无所适从。
- 正确做法：requirement 定义任务底色，context 填充细节，Spec 最终收敛为单一真相。

### 治理的折中策略
- **Standard vs Lite**：这是管理成本与交付质量的平衡。对于高风险核心模块，严禁使用 Lite。
- **Status 的角色**：`npx sdd-riper status` 仅作为辅助提醒。它检查“你有没有做功课”，但不代你做决定。如果 status 报 WARN，你应该去检查 Spec 内容是否充实，而不是简单地为了消除 WARN 而填垃圾内容。

---

## 7. 效果量化方法

建议在引入 SDD 前三周收集基线数据，后续对比：
- **Bug 率**：统计 Execute 阶段产生的非预期 Bug 数量。
- **需求周期 (Lead Time)**：观察从 Research 到 Review 完成的耗时。
- **重工率**：统计因为“方案不对”而导致代码推倒重来的次数。

---

## 8. 常见坑与解决方案

1. **坑：跳过 Plan 直接 Execute**
   - *症结*：觉得任务简单，不想写步骤。
   - *解法*：TL 在 Review 时，发现没有详细步骤的直接打回。

2. **坑：把 context 当作 requirement 用**
   - *症结*：把旧的文档丢给 AI 说“按这个改”，结果 AI 把旧文档里的错误也复现了。
   - *解法*：强制要求在 Spec 中明确写出 `Confirmed Requirement`，并先用 Requirement Review（document-first with gate）暴露歧义点再进入 Findings。

3. **坑：Requirement Review 走成实时一次一题追问**
   - *症结*：老协议默认"Q&A 模式"，但每次追问都污染主上下文，对长任务尤其痛。
   - *解法*：让 AI 一次性把 6 维度苏格拉底式审视全部写入 `### Requirement Review` 区块，再用 AskUserQuestion 触发 STOP / CONTINUE 门禁。STOP 走线下澄清，CONTINUE 把 Tentative Assumptions 自动复制到 `### Assumptions`。

3. **坑：status 有 WARN 就 Panic**
   - *症略*：追求 status 全 OK，导致在 Spec 里填废话。
   - *解法*：强调 status 仅供提示。真正的质量门禁在人，不在工具。

4. **坑：Archive 简单复制 Spec 原文**
   - *症结*：为了完成任务而归档，把 Spec 原文搬进 `archive/` 完事，AI 之后无法快速提取关键决策。
   - *解法*：`npx sdd-riper archive` 会在原 Spec 末尾追加四个 summary section（目标摘要 / 最终方案 / 关键约束 / 坑点与风险），由开发者 Edit 填实后再 `resume` 验证；不要让 `<!-- (未填充) -->` 占位符遗留。归档的产物是一份**带决策密度的 Spec**，不是 Spec 的副本。

5. **坑：Windows 路径兼容性问题**
   - *症结*：旧 shell 版本在 PowerShell 下可能有路径问题。
   - *解法*：全员使用 **npm/npx** 命令。
