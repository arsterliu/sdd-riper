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
- **观察点**：通过 `sdd status` 观察全员任务进度。

---

## 3. 团队唯一规则

> **”未经 Plan Approved，不得改代码”**

这是 SDD-RIPER 的核心灵魂。无论任务多紧急，必须在 Spec 中完成计划拆解，并获得批准后，方可进入 Execute 阶段。

**谁批准——由 GATE_POLICY 决定：**

| 策略 | 谁批 Plan | TL 介入点 | 适合谁 |
| :--- | :--- | :--- | :--- |
| **manual** | 人（签名） | Plan 阶段 | 核心模块、高风险、新人 |
| **auto** | AI（附 Gate Evidence） | Challenge 阶段 | 有经验同学、有测试覆盖的常规任务 |
| **advisory** | AI（附 Gate Evidence） | Challenge 阶段 + 人工确认 | 边界场景、团队刚上手 |

TL 可以按模块设置不同策略——核心模块 `.sdd-config` 写 `GATE_POLICY=”manual”`，常规模块用 auto。不确定就用 advisory，它不阻塞流程，只多一次人工确认。

---

## 4. 角色分工

- **核心研发 (Senior)**：
  - 使用 **Standard** 模式运行完整 RIPER 流程。
  - 负责编写和维护 `CodeMap` 和 `ProjectMap`。
  - 作为 Reviewer 审批其他成员的 Plan，并对 Completion Verification 四轴中 `Axis 2`（Code Diff Scope）亲自跑 diff 审计，不下放给 subagent。
  - 在 `## Completion Verification` 区块追加 Completion Verification Pass N + ISO-8601 timestamp，不覆盖历史 Pass。Challenge 结果通过 `sdd challenge --record-result` 写入。
  - 写 `Technical Design` 时用 ADR（`protocols/adr.md`）记录选型；对高风险任务发起 `sdd challenge` 做独立对抗评审（见第 9 节）。

- **初级研发 / 低经验同学**：
  - 建议先从 **Lite** 模式入手，培养“思考后再动手”的习惯。
  - 重点关注 `Confirmed Requirement` 的 5 个结构化要素（Scope Boundary / Irreversibility / Impact Radius / Dependencies & Constraints / Acceptance Intent），确保理解不偏航。

- **TL / 主管 (Team Lead)**：
  - 负责 `Plan Approved` 门禁。
  - 定期查看 `sdd status` 报告，识别进度风险；多项目 / 全员进度用 `sdd console` 看板更直观（见第 9 节）。
  - 不必介入每一行代码，但必须把控“方案方向”。

---

## 5. 与 AI 协作的正确姿势

### 意图分类表
| 协作阶段 | 协作模式 | 关键指令 |
| :--- | :--- | :--- |
| **探索 (Research)** | 深度对话 | “基于 mydocs/context/ 中的原始材料和 spec context-source，帮我分析这个 requirement 的潜在风险，写到 ### Requirement Review。” |
| **Mode Recommendation** | 复杂度校准 | “用 5 维度打分评估任务复杂度，推荐 mode；不接受基于 Requirement 字符数的判断。” |
| **规划 (Plan)** | 结构化输出 | “请将选定的方案拆解为原子步骤，并填入 Spec 的 Plan 区块。” |
| **执行 (Execute)** | 严格指令 | “严格按照 Plan 第 1 步执行，不要改动其他文件。” |
| **评审 (Challenge)** | 对照检查 | “对照原始 Spec 验收清单，检查代码实现是否存在偏差。” |

> **Mode Recommendation Gate** 是 Research 末尾的强制门禁（micro 模式跳过）。它读 **Confirmed Requirement**（不是 raw Requirement）评估复杂度，避免”用户一句话就当小任务”的误判。Confirmed Requirement 现在是结构化产出（5 要素），研发在评审时要看每个要素是否站得住脚——这是 mode 校准的关键决策点。Research Gate（Research Reviewed By / Research Reviewed At）确保 Research 产出经过独立审查后才进入 Innovate。

### 自由度表
- **Research (研究)**：中（鼓励多问，但目标要明确）。
- **Innovate (创新)**：高（鼓励尝试不同方案，只要能说清优劣）。
- **Plan (规划)**：**低**（必须精确、死板、原子化）。
- **Execute (执行)**：**零**（禁止在执行阶段“临场发挥”，发现计划不行必须回退）。
- **Challenge (对抗评审)**：中（基于事实做出判断）。

---

## 6. 方法论深度解析

### sdd discover 的艺术
`sdd discover` 动作要求同时接收 **requirement** (你要做什么) 和 **context** (你以前是怎么做的)。
- CLI 推荐入口：`sdd discover <dir> --task-name <name> ...`
- **原始材料管理**：PRD、UI 稿、原型等原始材料放入 `mydocs/context/<task-name>/`（在 discover 之前创建），`sdd discover` 自动绑定 `context-source`。每个任务独立子目录，支持并行 spec 开发。
- 常见错误：只给 requirement，导致 AI 重新发明轮子；只给 context，导致 AI 无所适从。
- 正确做法：requirement 定义任务底色，context 填充细节，Spec 最终收敛为单一真相。

### 测试策略速查

SDD 要求每个 AC 都声明 `Verification:` 类型（unit / integration / e2e / manual），并在 Execute 中用对应 `Method`（tdd / bdd / manual）执行。

| Verification | Method | 团队规则 |
| :--- | :--- | :--- |
| `unit` | `tdd` | 默认要求。纯逻辑代码必须 TDD 覆盖。 |
| `integration` | `tdd` / `bdd` | 接口契约必须验证。重点验证数据流和错误处理。 |
| `e2e` | `bdd` | 仅覆盖关键用户路径（3-5 个场景）。flaky test 不等于 PASS。 |
| `manual` | `manual` | 最后手段。必须提供 `Manual Evidence:`，不能留空。 |

**TL 关注点**：
- Challenge 时，检查 AC 的 `Verification` 是否匹配实际风险——高风险路径只有 unit 测试是不足的。
- E2E `SKIPPED` 必须有人签字（`Approved By` 不能是 `auto-gate`），Agent 不能自行跳过验证。
- Design 的 `Test Strategy` 字段不应为空——如果为空，说明设计者没想清楚怎么验证。

### 治理的折中策略
- **Standard vs Lite**：这是管理成本与交付质量的平衡。对于高风险核心模块，严禁使用 Lite。
- **Status 的角色**：`sdd status` 仅作为辅助提醒。它检查“你有没有做功课”，但不代你做决定。如果 status 报 WARN，你应该去检查 Spec 内容是否充实，而不是简单地为了消除 WARN 而填垃圾内容。

---

## 7. 效果量化方法

建议在引入 SDD 前三周收集基线数据，后续对比：
- **Bug 率**：统计 Execute 阶段产生的非预期 Bug 数量。
- **需求周期 (Lead Time)**：观察从 Research 到 Challenge 完成的耗时。
- **重工率**：统计因为“方案不对”而导致代码推倒重来的次数。

---

## 8. 常见坑与解决方案

1. **坑：跳过 Plan 直接 Execute**
   - *症结*：觉得任务简单，不想写步骤。
   - *解法*：TL 在 Challenge 时，发现没有详细步骤的直接打回。

2. **坑：把 context 当作 requirement 用**
   - *症结*：把旧的文档丢给 AI 说“按这个改”，结果 AI 把旧文档里的错误也复现了。
   - *解法*：强制要求在 Spec 中明确写出 `Confirmed Requirement`，并先用 Requirement Review（document-first with gate）暴露歧义点再进入 Findings。

3. **坑：Requirement Review 走成实时一次一题追问**
   - *症结*：老协议默认"Q&A 模式"，但每次追问都污染主上下文，对长任务尤其痛。
   - *解法*：让 AI 一次性把审视结果写入 `### Requirement Review` 区块，然后逐个填写 Confirmed Requirement 的 5 个结构化要素（Scope Boundary / Irreversibility / Impact Radius / Dependencies & Constraints / Acceptance Intent），再用 AskUserQuestion 触发 STOP / CONTINUE 门禁。STOP 走线下澄清，CONTINUE 把 Tentative Assumptions 自动复制到 `### Assumptions`。

3. **坑：status 有 WARN 就 Panic**
   - *症略*：追求 status 全 OK，导致在 Spec 里填废话。
   - *解法*：强调 status 仅供提示。真正的质量门禁在人，不在工具。

4. **坑：Archive 简单复制 Spec 原文**
   - *症结*：为了完成任务而归档，把 Spec 原文搬进 `archive/` 完事，AI 之后无法快速提取关键决策。
   - *解法*：`sdd archive` 会在原 Spec 末尾追加四个 summary section（目标摘要 / 最终方案 / 关键约束 / 坑点与风险），由开发者 Edit 填实后再 `resume` 验证；不要让 `<!-- (未填充) -->` 占位符遗留。归档的产物是一份**带决策密度的 Spec**，不是 Spec 的副本。

5. **坑：Windows 路径与安装问题**
   - *症结*：把带空格的项目路径直接拼进命令，或不同 shell 下行为不一致。
   - *解法*：当前已是 Node CLI，全员用 `npm install -g` 安装的 `sdd` 命令（需 Node 18+）；路径含空格时用引号包裹，如 `sdd next "D:\my project"`。

6. **坑：AC 只有 unit 测试，关键路径缺乏 E2E 保障**
   - *症结*：所有 AC 都标 `Verification: unit`，核心业务路径（支付、下单、认证）没有端到端验证，上线后集成问题频发。
   - *解法*：Design 的 `Test Strategy` 必须说明哪些 AC 需要更高级别验证。TL 在 Plan 审批时检查高风险路径是否只有 unit 覆盖——如果是，要求补充 integration 或 e2e AC。

7. **坑：E2E 测试不稳定就标记 SKIPPED 掩盖问题**
   - *症结*：E2E 测试偶尔失败，Agent 直接标记 SKIPPED 继续推进，集成风险被隐藏。
   - *解法*：flaky test 不是 PASS 也不是 SKIPPED 的理由。必须先 `sdd debug` 找根因，再决定修复或重写。SKIPPED 只用于环境确实不可用的情况，且必须有人签字（`Approved By` 不能是 `auto-gate`）。

---

## 9. 自动化、巡航与方法论

基础 RIPER 跑顺后，团队可以用下面这层把“人工推进”升级为“带门禁的半自动 / 自动推进”。SDD 只做控制协议——定义做什么、何时停、回退到哪；真正的执行循环复用宿主 agent（Claude Dynamic Workflows / Codex / opencode 的原生 loop），SDD 不自建模型 runtime，也不是 harness。

### 对抗评审（challenge）
`sdd challenge <dir>` 生成独立对抗评审 prompt，由一个只读、独立于实现者的 reviewer 从六个轴找茬，输出 `PASS / PASS_WITH_CONCERNS / FAIL_*`。任何 `FAIL_*` 阻止归档并回跳到对应阶段。用它把”质量判断”从实现者手里独立出来——裁判不能是运动员。

六轴审查：

| 轴 | 找什么 | 团队关注点 |
| :--- | :--- | :--- |
| Research | 需求偏离、隐含假设 | 需求理解是否到位 |
| Design | 架构遗漏、接口风险 | 设计是否经得起推敲 |
| Acceptance | 验收不可验证、场景缺失 | AC 是否真可验收 |
| Plan | 步骤不可执行、边界不清 | Plan 是否真的能落地 |
| **Code** | 代码质量、安全漏洞、冗余、测试质量 | **这是 SDD 内置的代码审查**——不是 PR review 的替代，而是归档前的代码质量门禁 |
| Execute Log | 审计链断裂、偏差未记录 | 执行是否忠实 |

Code Challenge 不替代 PR review：PR review 关注团队协作和风格；Code Challenge 关注代码是否匹配 Spec/Design 约束、是否有安全缺陷、测试是否有效。

### 自主巡航（cruise）
`sdd cruise <dir>` 生成有预算的巡航控制 prompt：每轮“next → 只修回跳目标 → validate → review / challenge → 回跳”，遇 PASS / 高风险 / 超过 `CRUISE_MAX_ITERATIONS` 即停。
- `CRUISE_POLICY`：`off`（禁用）/ `assisted`（每轮人工确认）/ `autonomous`（允许宿主原生 loop）。按模块风险选：核心模块用 assisted，常规任务可 autonomous。
- 遇安全 / 权限 / 计费 / 数据迁移 / 公共 API / 不可逆变更，巡航必须停下要求人工介入。

### 进度看板（console）
`sdd console` 启动本地只读 Web 看板，一屏看多项目、每个 Spec 的阶段 / 门禁问题 / 最新巡航状态，比逐个 `sdd status` 更适合全员进度观察。它只读投影，不改产物。

### 方法论路由与两层方法论
Design 阶段不必凭感觉选方法论。`sdd next` / `cruise` / `challenge` 会按 `mode` + 风险输出 `DESIGN_METHOD` / `DESIGN_FOCUS_FIELDS` 建议（advisory，最终由人拍板）。背后是两层可加载方法论：
- **执行质量层**：`vendored/superpowers/` 内置的 brainstorming / TDD / 系统化调试 / 完成验证 / 计划撰写 / 子 agent / 分支收尾，绑定到 RIPER 各阶段动作（触点见 `INTEGRATIONS.md`）。
- **设计方法层**：DDD / C4 / arc42 等按需进入 Design；其中 ADR 有本地写法 `protocols/adr.md`，Senior 写 `Technical Design` 的 `Selected Option / ADR` 字段时直接照它。
