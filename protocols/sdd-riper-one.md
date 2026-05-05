# SDD-RIPER Protocol (Standard)

## 三铁律
- **铁律一：No Spec, No Code** — 没有 Spec 就不写代码
- **铁律二：Spec is Truth** — Spec 是代码的唯一真相源
- **铁律三：Reverse Sync** — 发现代码与 Spec 不一致，回写 Spec

## Pre-Research 阶段与上下文层级
执行任务前，AI与开发者必须对齐以下输入语义及上下文层级。

### 核心输入语义
- **requirement** = 当前生效的任务定义（当前执行口径），是锚，不可被 context 替代。
- **context** = 支撑 requirement 的背景材料，分为两层：
  - **Source Materials** = 当前任务相关的外部原始材料。
  - **Project Background** = 项目内已沉淀的背景知识（如 specs / codemap / archive）。
- 两层 context 可按需通过 `build-context-bundle` 归一化为单个上下文包供任务加载。
- **sdd_discover** 动作同时接收 requirement + context：requirement 定方向，context 补理解。
  - CLI 推荐入口：`sdd discover <dir> --task-name <name> ...`
  - *注意*：若 context 与 requirement 冲突，以 requirement 为准，并在 Research 中记录冲突。
  - *禁止*：把 context 直接当作当前 requirement 的权威定义。

### 三层上下文架构
- **Spec**：当前任务工作单（核心执行域）。
- **CodeMap**：模块结构 / 调用链路 / 外部依赖（本地代码级架构视图）。
- **ProjectMap**：跨仓库协作 / 接口契约 / 仓库职责（全局视角与边界）。

### CodeMap 治理规则
- **CodeMap 是模块级活文档，不是任务级产物**：按模块维护，跨任务复用；不要为每个任务单独新建一份 CodeMap。
- **按需创建**：仅当模块结构复杂、调用链不清晰、外部依赖较多，或后续 Research / Plan 会因缺少架构地图而失真时才创建。
- **先复用，再判断是否更新**：进入 Research / Plan 前，若已有对应模块的 CodeMap，先加载并检查是否仍然准确；不得在未确认过期前直接重建。
- **仅因架构事实变化而更新**：以下变化需要回写 CodeMap：入口点新增/删除/重命名、核心调用链结构改变、关键外部依赖变化、风险项出现或消失。
- **不是每次任务都更新**：若任务只改内部实现、注释、样式或不影响模块结构的细节，CodeMap 可以保持不变。
- **关闭任务前做一次 CodeMap 反向同步检查**：若本次任务改变了架构事实，必须在 Review 完成前更新 CodeMap，并记录 `updated-at` 与 `last-reason`。

### 热/温/冷三层加载规则

为避免上下文爆炸，AI 在执行每轮对话时按以下三层规则加载文档：

#### 热层（Hot）— 每轮必带
- 当前 Spec 的活跃阶段区块（仅当前阶段所需区块，非全文）
- Plan 区块（若 Plan Approved By 已填写）

#### 温层（Warm）— 切阶段时按需加载
- **进入 Research 阶段**：CodeMap（若存在）、ProjectMap（若多仓库任务）
- **进入 Plan 阶段**：CodeMap（若存在）、Innovate Options 区块
- **进入 Execute 阶段**：Plan 全文、CodeMap（若存在）
- **进入 Review 阶段**：Plan 全文、Execute Log 区块
- **进入 Archive 阶段**：Review Summary 区块

#### 冷层（Cold）— 默认不带
- 历史 Spec 全文（已完结的）
- archive/ 目录下的文件
- 其他任务的 Spec
- context/ 目录内容（除非主动 build-context-bundle）
- ProjectMap（单仓库任务时）

#### 切阶段预热规则（Summary）
| 进入阶段 | 自动预热（温层升热） |
|----------|---------------------|
| Research | CodeMap、ProjectMap（多仓库时） |
| Innovate | 无（仅需 Research 产出） |
| Plan     | CodeMap、Innovate Options |
| Execute  | Plan 全文、CodeMap |
| Review   | Plan 全文、Execute Log |
| Archive  | Review Summary |

## RIPER 阶段与执行流

### 1. Research 阶段
- **做什么**：基于 requirement 与 context，澄清任务理解并挖掘潜在冲突。
- **产出物**：必须固定按以下四段输出格式提交 Research 结论：
  1. Requirement Restatement（我对需求的复述）
  2. Open Questions（我当前不确定的点）
  3. Confirmed Facts（我已确认的事实）
  4. Spec Writeback（我建议回写到 Spec 的内容）
- **阶段自由度**：中（可提问，可澄清，不能跳过）
- **Gate 1 — Invocation Alignment Check**：每轮 Research 输出末尾必须追加第 5 段 §5 Invocation Alignment Check，格式：
  - **原始调用意图**（来自最初 invocation 消息）：[1-2句复述]
  - **当前 Research 方向**：[1-2句说明本轮 Research 了什么]
  - **判断**：ALIGNED | DRIFTED
  - **若 DRIFTED**：说明偏差；Research 可继续，偏差记入日志，无需额外人工确认
- **完成标准**：Open Questions 被解决，并完成 Spec 的 Reverse Sync。

### 2. Innovate 阶段
- **做什么**：针对澄清后的要求，产出技术可行性方案并推荐最优解。
- **产出物**：至少给 **2 个方案**（复杂任务建议 3 个）。每个方案必须包含：Pros / Cons / 风险 / 推荐理由。简单任务允许：`Innovate: Skipped, Reason: ...`。
- **阶段自由度**：高（可创意，可跳过，需注明原因）
- **完成标准**：开发者明确选择某方案，或确认跳过。

### 3. Plan 阶段
- **做什么**：将确认的方案转化为可执行的原子步骤。
- **产出物**：输出原子级拆解计划（文件路径 / 函数或接口签名 / 执行顺序 / 验收条件）。
- **禁止事项**：禁止模糊的操作指引，计划必须具体到行/接口级别。
- **阶段自由度**：低（原子拆解，禁止模糊）
- **Gate 2 — Spec Coverage Gate**：请求 Plan Approved 前，必须输出 Coverage Matrix 表格，列出 Spec §2 Requirement Restatement 和 §3 Constraints 中的每一个 bullet，标注：
  - `✅` 计划已覆盖 / `❌` 未覆盖（BLOCK，必须补全后才能请求 Plan Approved）/ `⚠️` 部分覆盖
  - 若有任何 `❌`，计划处于 BLOCKED 状态，须修订后重新提交 Coverage Matrix
  - 人工可显式说明"Approve anyway"以覆盖 BLOCK
- **完成标准**：必须获得人工门禁签名：**Plan Approved By** 是人工门禁，不可由 AI 替代！

### 4. Execute 阶段
- **做什么**：严格执行已获批的 Plan 步骤。
- **产出物**：记录 Execute Log（步骤日志）/ Change Summary / Deviations from Plan。
- **执行纪律与偏差分级**：
  - `DEVIATED_MINOR`：步骤目标仍可达，只是实现方式不同 → 写入 execute.log 标注 `[DEVIATED_MINOR]`，继续执行
  - `DEVIATED_MAJOR`：步骤目标已不成立，或修复它需要改动其他 Plan 步骤 → 立即 STOP，写入 execute.log 标注 `[DEVIATED_MAJOR]`，明确说明影响的下游步骤，回退到 Plan 阶段
  - 判断原则：若不确定是 MINOR 还是 MAJOR，按 MAJOR 处理（升级不降级）
- **CodeMap 纪律**：Execute 过程中只记录“CodeMap 是否可能失效”的信号；待代码稳定后再统一判断是否需要更新 CodeMap，不在半成品状态下改地图。
- **阶段自由度**：零（严格按 Plan，偏差必记录）
- **完成标准**：代码改动完成或因 Plan 失效回退。

### 5. Review 阶段
- **做什么**：对比原始意图 (Invocation) 与最终实现，评估完成度及遗留问题。Review 是裁判，不是程序员——只读代码，只出判决，不就地修复。
- **四轴验证**：
  - **Axis 0 — Invocation Integrity**：实现是否仍然服务于原始 requirement / goal / constraints？Finding: `ALIGNED | DRIFTED | VIOLATED | UNVERIFIABLE`
  - **Axis 1 — Spec Plan Coverage**：每个 Plan 步骤是否都有对应实现？Finding: `FULL | PARTIAL | MISSING`
  - **Axis 2 — Code Diff Scope**：实际代码变更是否在 Plan 范围内？Finding: `IN_SCOPE | OUT_OF_SCOPE_MINOR | OUT_OF_SCOPE_MAJOR`
  - **Axis 3 — Execute Log Fidelity**：Execute Log 记录的偏差与实际代码是否吻合？Finding: `FAITHFUL | DISCREPANCY`
- **产出物**：输出带编号的 Review Pass 报告，追加写入 Spec §10，不覆盖历史记录：
  ```
  Review Pass N — YYYY-MM-DDTHH:MM:SSZ — VERDICT
  ```
- **Verdict 枚举**（仅这五个，无其他）：
  - `PASS` → 归档
  - `PASS_WITH_CONCERNS` → 归档（附 Risk Register）；Axis 0=DRIFTED 时触发
  - `FAIL_CODE` → 开发者重新进入 Execute，按指定步骤修复代码
  - `FAIL_PLAN` → 开发者重新进入 Plan，修正计划后重新过 Plan Approved 门禁
  - `FAIL_SPEC` → 开发者重新进入 Research + Plan，澄清需求理解后重新过门禁
  - **优先级**（多项同时失败时）：`FAIL_SPEC > FAIL_PLAN > FAIL_CODE`
- **Review 写权限**：
  - ✅ 允许：回写 §10 Review Verdict（追加，不覆盖）
  - ✅ 允许：更新 CodeMap（仅限架构事实发生变化时，出 Verdict 前完成）
  - ❌ 禁止：写代码文件、新增功能、修 Plan 步骤
- **多轮收敛规则**：每次 FAIL 修复后重新进入 Review，算新一轮 Pass (N+1)；不在同一轮内部自旋修复。
- **CodeMap 检查**：出 Verdict 前，判断本次任务是否改变了入口点、核心调用链、外部依赖或风险项；若改变则先更新 CodeMap，再出 Verdict。
- **禁止事项**：禁止"看起来没问题"等无效回复；禁止就地修复代码；禁止 AI 自动推进到 Archive。
- **阶段自由度**：中（需判断，但有固定输出格式）
- **轴角色分级**：
  - **Axis 2 — Code Diff Scope** `[PRIMARY]`：Review 的核心职责，全量 Diff 审计，只能在此处完成。⚠️ 当前限制：仅覆盖 HEAD~1..HEAD（上次提交），多提交任务需手动提供更宽范围的 Diff。
  - **Axis 0 — Invocation Integrity** `[CONFIRMATION]`：安全网。若此轴 FAIL，说明 Gate 1（Research 的 Invocation Alignment Check）未能拦截漂移。
  - **Axis 1 — Spec Plan Coverage** `[CONFIRMATION]`：安全网。若此轴 FAIL，说明 Gate 2（Plan 的 Spec Coverage Gate）未能拦截缺口。
  - **Axis 3 — Execute Log Fidelity** `[CONFIRMATION]`：安全网。若此轴 FAIL，说明 Gate 3（Execute 的 DEVIATED_MAJOR 记录）未能拦截差异。
- **上游门禁失效警告**：当 Axis 0/1/3 出现 FAIL 判定时，在 Verdict 输出中追加：
  > ⚠️ 上游门禁失效：Axis [N] FAIL 说明对应的上游检查站（Gate [1/2/3]）在 [Research/Plan/Execute] 阶段未能拦截此问题，建议复盘上游门禁的有效性。
  
  Verdict 映射：Axis 0 FAIL → `FAIL_SPEC`；Axis 1 FAIL → `FAIL_PLAN`；Axis 3 FAIL → `FAIL_CODE`

- **FAIL_CODE 自动修复循环**：
  - Verdict 为 `FAIL_CODE` 时，Orchestrator **自动**重新触发 Execute 阶段（仅针对 Verdict 中指定的步骤，非全量重跑），Execute 完成后重新进入 Review（Pass N+1）
  - 最多自动重试 **3 次**；超出后输出 `FAIL_CODE_ESCALATED`，必须人工介入
  - `FAIL_PLAN` 和 `FAIL_SPEC` **永远不自动修复**，必须人工决策后进入对应阶段
- **完成标准**：提供完整的 4 轴 Review 报告并由开发者确认。

### 6. Archive 阶段
- **做什么**：沉淀任务资产。
- **产出物**：
  - **`_human.md`**：人类可读，聚焦决策/方案/结论。
  - **`_llm.md`**：AI 上下文恢复钥匙，高密度，无叙事。
- **禁止事项**：两份均不得简单复制 Spec 原文。

## 团队使用规则与红线

### 团队使用规则
- **Plan Approved** 才能动手（不可跳过）。
- 关闭 AI 全自动模式（不允许 AI 自行推进 RIPER 阶段）。
- 发现代码与 Spec 不符 → 回写 Spec。

### 绝对禁止事项清单
- 未经 Plan Approved 不得写代码。
- 不得将 context 当作 requirement。
- Review 不得只写“没问题”。
- Archive 不得简单复制 Spec 原文。
