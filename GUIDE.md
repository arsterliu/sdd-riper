# SDD-RIPER 使用指南

这份指南补充 README，说明流程细节、三种模式、产物边界、subagent 策略和验收标准写法。当前版本的 SDD-RIPER 是 Node CLI 和文件系统产物协议，不是模型执行 runtime；它通过 prompt、门禁和账本引导宿主 agent 或人工推进。

## 设计理念

### SDD 是控制协议层，不是 harness

harness（Claude Code、Codex CLI 等）是承载 agent 运行的运行时外壳，负责工具调用、权限、上下文窗口和模型执行循环。SDD 不做这些，也不该做。SDD 是骑在 harness 之上的**控制协议层**：它定义“做什么、何时停、出问题回退到哪”，以及一条由 Spec / Design / Execute Log / Learning 组成的产物真相链；真正的模型执行和代码修改由宿主 harness 完成。

用“是不是完备 harness”衡量 SDD 是用错了标尺。该问的是：作为 AI 交付的控制协议，它是否覆盖了 意图捕获 → 设计 → 计划 → 执行审计 → 验证门禁 → 复盘沉淀 → 归档复用 的完整链路，并在 advisory / autonomous 两种模式下都成立。

### 四个核心组件的关系

| 组件 | 角色 | 比喻 |
| :--- | :--- | :--- |
| `workflow`（内部状态引擎） | 只读分析 Spec + 门禁，输出 verdict / 回跳目标 / 下一步 / risk flags / 方法论建议 | 大脑读数 |
| `cruise`（自主巡航） | 把状态包装成循环契约：每轮修哪块、何时停、FAIL 回退到哪；自己不跑 | 循环契约书 |
| 宿主原生 loop（Claude Dynamic Workflows / Codex / opencode） | 真正一轮一轮执行 | 借来的发动机 |
| `challenge`（对抗审核） | 独立只读 reviewer，给出真正裁决 | 每轮裁判 |

关键解耦：`workflow` 只发“应该用 ADR / 回退到 Design”这类**信号/指针**，不持有方法论实体和执行循环；方法论实体在 `SKILL.md` / `protocols/` / `vendored/`，执行循环借宿主，challenge 的裁决独立于实现 agent（裁判不能是运动员）。这就是“SDD 是控制协议、不是执行器”的落地方式。

## 一、产物边界

当前版本采用 **Spec 控制面 + 独立 Design + 独立 Execute Log + 条件 Learning Record**。

| 产物 | 存放位置 | 职责 |
| :--- | :--- | :--- |
| Spec | `<docs-root>/specs/` | 需求、Research、Innovate、Acceptance Criteria、Plan、审批、Completion Verification / Challenge verdict，以及 `design-file` / `execute-log-file` / `learning-file` 引用。 |
| Design | `<docs-root>/design/` | standard 的 `Technical Design` 或 lite 的 `Design Note`。micro 不创建独立 Design。 |
| Execute Log | `<docs-root>/logs/` | 执行步骤、偏差、验证结果，append-only。 |
| Learning Record | `<docs-root>/learnings/` | 偏差、BUGFIX、concern、reopen 暴露出的可复用决策规则。 |
| Cruise Run | `<docs-root>/runs/` | 巡航 iteration、engine、verdict、回跳目标和停止原因，属于可观测性账本，不替代核心产物。 |

Spec 是控制面，不再承载完整技术设计、执行日志和经验库。这样 Challenge 和 Archive 可以分别审查规范、设计、执行事实和可复用经验。

阶段产物的模板结构保持英文，包括章节标题、人工字段标签、frontmatter 键、`design-file` / `execute-log-file` / `learning-file` 引用键、CLI 命令名、状态枚举、验证类型枚举和 `AC-###` 编号。实际填充的需求分析、方案取舍、设计说明、计划步骤、执行说明、证据和经验规则使用中文。

## 二、流程架构

SDD-RIPER 按三层职责运行：

```
┌─────────────────────────────────────────────────────┐
│ 控制面（Spec）                                       │
│  目标、Research、Innovate、Acceptance、Plan、        │
│  门禁、Challenge 裁决、产物引用                          │
│  design-file / execute-log-file / learning-file      │
└──────────────┬──────────────────────────────────────┘
               │ 引用
┌──────────────▼──────────────────────────────────────┐
│ 产出面（独立产物）                                   │
│  Design ── 技术设计 / Design Note                    │
│  Execute Log ── 执行事实（append-only）              │
│  Learning Record ── 可复用决策规则                    │
│  Cruise Run Ledger ── 可观测账本（不参与门禁）       │
│  Archive ── 已归档产物                               │
└──────────────▲──────────────────────────────────────┘
               │ 读/写/验证
┌──────────────┴──────────────────────────────────────┐
│ 调度面（CLI + Agent）                                │
│                                                      │
│  探测：status / next / resume                        │
│    → 只读推导状态，不修改产物                         │
│                                                      │
│  生成：debug / review-execute / challenge / cruise   │
│    → 输出 prompt，不调用模型 API                      │
│                                                      │
│  操作：init / discover / validate / archive / reopen │
│    → 创建 / 检查 / 归档产物                          │
│                                                      │
│  视图：codemap / learnings / doctor / console        │
│    → 按需扫描或只读投影，不持久化                     │
│                                                      │
│  执行：Host Agent（Claude Code / Codex / opencode）  │
│    → 按 prompt 执行代码修改和命令，写入产出面         │
└─────────────────────────────────────────────────────┘
```

### 关键边界

- **控制面不嵌入产出**：Spec 通过 `design-file` / `execute-log-file` / `learning-file` 引用产物，不内联 Technical Design、Execute Log 或 Learning Record 内容。
- **调度面只驱动，不决策**：`sdd next` 推导状态但不自动执行；`sdd challenge` 生成对抗 prompt 但不做裁决；`sdd cruise` 生成循环 prompt 但不跑模型循环。
- **产出面只记录，不回溯**：Execute Log 是 append-only；Learning Record 记录规则但不修改历史。架构变更记录到 Learning Record，不另存 codemap 文件。
- **调度面依赖宿主执行**：代码修改由 Host Agent 执行，SDD 不自建模型 runtime。宿主支持原生 loop 时复用，否则退回 prompt-loop 补偿。

## 三、RIPER 流程

```text
Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> (Cruise) -> Learning Check -> Archive
```

Execute 内含 Completion Verification Gate（四轴自查清单 + AC Coverage 汇总），替代了原独立的 Review 阶段。Challenge 是 Execute 之后的唯一质量门禁。`PASS_WITH_CONCERNS` 直接进入 Learning Check（不再回退到 Review）。

### 全链路流转图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  sdd init <dir> --mode standard|lite|micro                                │
│  → 创建目录结构 + .sdd-config + AI 配置文件                               │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  sdd discover <dir> --task-name <name> --version <vN.M|vN.M.P> --requirement "..." │
│  → 创建 Spec + Design（micro 除外）+ Execute Log                           │
│  → Spec frontmatter 写入 design-file / execute-log-file / learning-file    │
│  → 自动绑定 mydocs/context/<task-name>/ 为 context-source                  │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Research                                                                  │
│  ┌─ 读取项目规范宪章（eslint/tsconfig/CI gates 等）→ 写入 Findings          │
│  ├─ Requirement Review：歧义、风险、外部依赖                               │
│  ├─ Findings：代码事实 + 项目约束 + 架构概览（sdd codemap 按需）           │
│  ├─ Open Questions → AskUserQuestion 交互澄清                              │
│  ├─ Assumptions：暂未确认的约束                                           │
│  ├─ Research Gate: Research Reviewed By + Research Reviewed At              │
│  └─ Confirmed Requirement：校准后的需求边界（5 要素）                      │
│     Scope Boundary / Irreversibility / Impact Radius                       │
│     / Dependencies & Constraints / Acceptance Intent                       │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Innovate  （micro 跳过；lite 可跳过但写 Reason）                         │
│  ┌─ 至少两个方案比较                                                       │
│  ├─ 优缺点 / 技术风险 / 需求匹配度                                        │
│  ├─ 被拒绝方案的原因                                                       │
│  └─ 选中方案                                                               │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Design / Acceptance                                                       │
│  ┌─ standard: 独立 Technical Design（8 个必填字段）                        │
│  │            + Acceptance Criteria（AC-### + Verification 元数据）         │
│  ├─ lite:    独立 Design Note（6 个必填字段）+ 轻量 AC                     │
│  └─ micro:   Plan 内含 Acceptance + Verification + Impact                  │
│                                                                             │
│  sdd next → 输出 DESIGN_METHOD / DESIGN_FOCUS_FIELDS（advisory）           │
│  风险标记 → 点亮对应 Design 字段（security→安全审查, billing→状态模型...）  │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Plan                                                                      │
│  ┌─ 从 Design + AC 拆成原子步骤                                            │
│  ├─ 每步：文件路径 / 具体改动 / 对应 AC / 验证方式                         │
│  └─ 门禁三选一 ──┬─ manual:  人工 Plan Approved By + Approved At            │
│                   ├─ auto:    auto-gate + Gate Evidence                    │
│                   └─ advisory: 同 auto，Challenge 时额外人工确认           │
│                                                                             │
│  ★ Plan 未批准 → 禁止进入 Execute                                         │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Execute*                                                                  │
│  ┌─ 严格按 Plan 执行，每个 Step 追加到 Execute Log                         │
│  │                                                                         │
│  │  Step 格式:                                                             │
│  │  ┌─ Step / Status / Files / Result / Verification                      │
│  │  ├─ AC Coverage: AC-###: PASS|FAIL|SKIPPED                             │
│  │  │    ├─ Scenarios: "场景名": PASS|FAIL                                 │
│  │  │    ├─ Test: <test file path>                                        │
│  │  │    ├─ Method: tdd|bdd|manual                                        │
│  │  │    └─ SKIPPED 专属: Reason + Approved By（非 auto-gate）+ Approved At│
│  │  ├─ Deviation: none | DEVIATED_MINOR | DEVIATED_MAJOR                  │
│  │  └─ Timestamp: ISO-8601                                                │
│  │                                                                         │
│  │  偏差规则:                                                              │
│  │  ┌─ DEVIATED_MINOR: 同目标不同实现 → 记录继续                           │
│  │  ├─ DEVIATED_MAJOR: 目标/边界变化 → 停止，回退到 Plan/Design            │
│  │  └─ BUGFIX / BUGFIX_ESCALATED: 缺陷修复                                │
│  │                                                                         │
│  │  失败时: sdd debug → 根因分析 → 再试                                   │
│  │                                                                         │
│  └─ 最后一步: Completion Verification（替代原 Review 阶段）               │
│     ┌─ Step: completion-verification                                       │
│     ├─ AC Coverage Summary: AC-###: PASS|FAIL|SKIPPED (type, test_path)   │
│     └─ Four-Axis Checklist:                                               │
│        Axis 0 (Intake): aligned | misaligned                              │
│        Axis 1 (Design/Acceptance/Plan): complete | incomplete              │
│        Axis 2 (Code Diff): within boundary | out of boundary              │
│        Axis 3 (Execute Log): faithful | unfaithful                        │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Challenge（唯一独立质量门禁）                                             │
│                                                                             │
│  sdd challenge <dir>  →  生成对抗审查 prompt                               │
│                                                                             │
│  ┌─ standard/lite: 必须派子 agent 执行（核心: 不是自己审自己）             │
│  └─ micro: 可内联但必须角色分离                                            │
│                                                                             │
│  子 agent 只读不写，返回:                                                  │
│  ┌─ Challenge Verdict: PASS | PASS_WITH_CONCERNS | FAIL_SPEC              │
│  │                      | FAIL_DESIGN | FAIL_ACCEPTANCE | FAIL_PLAN       │
│  │                      | FAIL_CODE | FAIL_LOG | FAIL_LEARNING            │
│  ├─ Backtrack Target: Research | Design | Acceptance | Plan               │
│  │                    | Execute / Debug | Execute Log | Learning Check     │
│  └─ Challenge Summary: <evidence, ≤200 words>                             │
│                                                                             │
│  结果必须通过命令写入（禁止手动填写）:                                     │
│  sdd challenge <dir> --record-result "VERDICT" --summary "..."            │
│                    --executed-by "subagent"                                │
│  → 自动写入: Challenge Verdict / Backtrack Target / Challenge Summary     │
│             Challenge Executed By / Challenge Executed At（当前时间戳）    │
│             Challenge Evidence                                             │
│                                                                             │
│  判决路由:                                                                  │
│  ┌─ PASS               → Learning Check → Archive                        │
│  ├─ PASS_WITH_CONCERNS → Learning Check（必须创建 Learning）→ Archive     │
│  └─ FAIL_*             → Cruise 修复循环                                 │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ FAIL_*
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Cruise（自主巡航）                                                        │
│                                                                             │
│  sdd cruise <dir> [--engine auto|prompt|local-loop|claude-code|codex]      │
│              [--emit-claude-prompt] [--record-run] [--iteration N]         │
│                                                                             │
│  每轮循环:                                                                  │
│  ┌─ 按 Backtrack Target 回到对应阶段修复                                   │
│  ├─ sdd validate → 检查门禁                                               │
│  └─ sdd challenge → 重新评审                                              │
│                                                                             │
│  终止条件:                                                                  │
│  ┌─ Challenge PASS / PASS_WITH_CONCERNS → 退出循环                         │
│  ├─ 达到 CRUISE_MAX_ITERATIONS（默认 5） → 人工介入                       │
│  └─ 安全/权限/计费/迁移/公共 API/不可逆 → 立即停止，人工介入              │
│                                                                             │
│  CRUISE_POLICY: off（禁用）| assisted（每轮人工确认）| autonomous（原生loop）│
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ PASS / PASS_WITH_CONCERNS
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Learning Check                                                            │
│                                                                             │
│  必须创建 Learning Record 的触发条件:                                      │
│  ┌─ Execute Log 含 BUGFIX / BUGFIX_ESCALATED / DEVIATED_MINOR|MAJOR       │
│  ├─ Challenge verdict = PASS_WITH_CONCERNS                                │
│  ├─ 任务从归档 reopen                                                     │
│  ├─ AC 本身不充分                                                          │
│  └─ 同类失败模式重复出现                                                  │
│                                                                             │
│  sdd new-learning <dir> [spec-name]                                        │
│  → 创建 learning-file，8 个必填字段:                                      │
│    Source Spec / Trigger / Observed Problem / Root Cause                   │
│    Decision Rule / Applies When / Recommended Action / Evidence            │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Archive                                                                   │
│                                                                             │
│  sdd validate <dir> --archive-ready                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  归档门禁清单:                                                       │    │
│  │  ┌─ Research Gate: Research Reviewed By + Research Reviewed At（standard/lite 必填）│    │
│  │  │   └─ Confirmed Requirement 5 要素非空（Scope Boundary / Irreversibility / Impact Radius / Dependencies & Constraints / Acceptance Intent）│    │
│  │  ├─ Plan Gate: Approved By + Approved At + Gate Evidence（auto 时）  │    │
│  │  ├─ Challenge Verdict: 非 FAIL_*                                    │    │
│  │  ├─ Challenge Evidence: Executed By + Executed At + Evidence        │    │
│  │  │   ├─ standard/lite: Executed By 含 subagent                      │    │
│  │  │   ├─ manual policy: 非 auto-gate                                 │    │
│  │  │   └─ Executed At 晚于 Execute Log 最后 step Timestamp            │    │
│  │  ├─ Mode Artifacts: Design 必填字段 / AC Verification 元数据       │    │
│  │  ├─ Execute Log: 非空                                               │    │
│  │  ├─ AC Coverage L1-L4:                                              │    │
│  │  │   ├─ L1: 每个 AC 有 Coverage 记录                                │    │
│  │  │   ├─ L2: 所有 Coverage 结果 PASS（SKIPPED 需人工批准）           │    │
│  │  │   ├─ L3: Test 路径文件存在                                       │    │
│  │  │   └─ L4: Scenario 名称匹配（WARNING，不阻断）                    │    │
│  │  ├─ Learning Record: 触发条件满足时必填且 8 字段齐全                │    │
│  │  └─ diff-base frontmatter（git 仓库时）                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  sdd archive <dir> <spec-name>                                             │
│  → 移动 Spec + Design + Execute Log + Learning 到 archive/                 │
│  → 更新归档 Spec 内的引用路径                                              │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
                    ┌──── 已归档 ────┐
                    │                 │
                    │  发现缺陷?      │
                    └────┬────────────┘
                         │ 是
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  sdd reopen <dir> <slug> --defect "缺陷描述" [--mode standard|lite|micro] │
│  → 基于归档 Spec 创建新 Spec + 新 Execute Log（+ 新 Design if 非micro）  │
│  → 不要重新 discover（切断历史上下文）                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

`discover` 前置门禁：agent 必须让用户输入或确认 `version` 与 `task-name`，并询问是否存在参考资料 / context。`version` 是迭代 / 交付批次聚合键，支持 `vN.M` 和 `vN.M.P`；同一个 `version` 下允许多个并行 Spec，但 `task-name` 必须唯一。

### 状态引擎

```
sdd resume / sdd next / sdd status

workflow.analyzeSpec()
    │
    ├─ 读 Spec frontmatter: mode / status / design-file / execute-log-file
    ├─ 读 Spec 内容: Plan Approved / Challenge Verdict / Gate Evidence
    ├─ 读 Design / Execute Log 内容
    ├─ validate.validateSpec(archiveReady: true) → issues[]
    ├─ riskFlags(actionText, confirmedRequirement) → security / billing / migration / public-api / irreversible
    ├─ designMethodHint(mode, riskFlags) → advisory 方法论建议
    │
    ├─ challengeVerdict: 优先用 Spec 中显式值，无则从 issues 推导
    ├─ backtrackTarget: VERDICT_TO_TARGET 映射
    ├─ nextAction: PASS → archive_ready, FAIL_* → repair_<target>
    │   Challenge PASS + 有 validation blockers → repair_<target>（不跳过修复）
    └─ blockers: validate issues 列表

sdd resume → 自动输出 RELEVANT_LEARNINGS（recallLearnings 相关性召回）
sdd console → 只读投影，展示以上所有状态
```

Challenge 和 Cruise 是 Execute 之后的质量闭环。它们不改变 RIPER 产物合同，而是在四轴自查后追加一层独立对抗评审，并在发现问题时提供有预算的修复循环。

- `sdd next`：判断当前阶段、下一步和回跳目标。
- `sdd challenge`：生成独立对抗评审 prompt，由独立角色（standard/lite 必须派子 agent）执行。
- `sdd cruise`：在 challenge 返回 `FAIL_*` 后，生成有预算的修复循环 prompt。

循环的执行优先复用宿主 agent 能力：Claude Code 可使用 Dynamic Workflows，Codex / opencode 如果当前运行面支持原生自主循环，也应直接复用。SDD 不自建模型执行 runtime；它只提供状态机、门禁、回跳映射和产物真相链。宿主不支持原生 loop 时，退回 `prompt` 或 `local-loop` prompt-loop 补偿模式；SDD 只记录 iteration 快照，不执行模型循环。

`CRUISE_POLICY="off"` 会禁用巡航 prompt 和 run ledger；`assisted` 要求人在每轮修复之间确认；`autonomous` 才允许宿主原生 loop。

`sdd cruise --engine claude-code --emit-claude-prompt` 会输出包含 `ultracode:` 和 `/effort ultracode` 提示的 Claude Code workflow 启动 prompt；真正的 workflow script 由 Claude Code 自己生成和执行。`sdd cruise --record-run --iteration N` 会追加 `<docs-root>/runs/<spec>.cruise.jsonl`，用于 Console 和人工审计查看巡航状态。

### Research

目标是把”原始要求”变成可执行的 Confirmed Requirement。应产出：

- Requirement Review：歧义、隐含假设、风险、外部依赖。
- Findings：从代码、文档、历史 Spec 得到的事实。**应包含项目本身的编码惯例和约束**（如 `eslint` / `tsconfig` / `.editorconfig` 的关键规则、测试框架和覆盖率阈值、CI 流水线的阻断条件等），确保后续 Design 和 Execute 不违背项目既有规范。架构概览可按需运行 `sdd codemap <dir>`。外部材料（PRD、UI 稿、原型等）放入 `mydocs/context/<task-name>/`，`sdd discover` 自动绑定 `context-source`。
- Open Questions：必须澄清的问题。**Agent 应主动用 `AskUserQuestion` 交互式提问，而非仅列出问题等用户自行编辑。** 提问时给出 2-4 个具体选项，每个选项应是 **AI 基于上下文推理出的建议答案**，而非空占位符。不必穷举所有可能——用户始终可通过”其他”选项输入自定义答案。用户确认、微调或另给答案后，写入 spec 的 Assumptions 或 Confirmed Requirement，并从 Open Questions 中移除。
- Assumptions：暂时接受但需要追踪的假设。
- Research Gate：`Research Reviewed By` + `Research Reviewed At`，确认 Research 产出的门禁。standard/lite 要求 subagent 独立审查；micro 跳过。Gate Policy 与 Plan Gate 一致。
- Confirmed Requirement：校准后的需求边界，包含五个结构化要素：Scope Boundary（范围边界）、Irreversibility（不可逆性）、Impact Radius（影响半径）、Dependencies & Constraints（依赖与约束）、Acceptance Intent（验收意图）。

### Innovate

目标是定义方案，而不是写一句“使用现有实现”。standard 至少比较两个方案：

- 方案描述。
- 优点、缺点。
- 技术风险。
- 与需求的匹配度。
- 被拒绝方案的原因。
- 选中方案。

lite 可以跳过 Innovate，但必须写 `Innovate: Skipped, Reason: ...`。

方案探索与设计澄清可借助 vendored 的 `brainstorming` 方法（见第六节）：一次一问澄清意图、提出 2-3 个方案并给推荐、分段呈现设计并逐段确认，且“无设计批准不进实现”。注意 SDD 适配——产物落到 Spec 的 `Innovate Options` 和外部 `design-file`，不走 brainstorming 默认的 `docs/superpowers/specs/` 路径，也不自动转入 writing-plans（交给 SDD 自己的 Plan 门禁）。

### Design / Acceptance

Design 在 Innovate 之后、Plan 之前完成。

设计方法论按 `mode` + 风险**路由**，不是把所有方法论铺到每个任务。`sdd next` / `sdd cruise` 会输出 `DESIGN_METHOD` 和 `DESIGN_FOCUS_FIELDS` 作为 advisory 建议：micro 无独立设计；lite 用 ADR；standard 用 ADR + arc42 字段结构 + C4 视图；命中 `migration` / `public-api` / `security` / `billing` / `irreversible` 风险时点亮对应的 Design 重点字段；领域复杂时建议考虑 DDD。建议是 advisory，最终由 orchestrator 判断（机制见第六节）。

standard 写独立 `Technical Design`。它不是方案说明，而是技术设计合同。归档门禁强制检查核心字段：

- Selected Option / ADR。
- Requirement Traceability。
- Impact Scope。
- Architecture View，必要时用 C4。
- Data Model / Schema。
- Interface Contract。
- Compatibility / Rollback。
- Test Strategy。

以下字段按需填写，但涉及对应风险时不应省略：

- Context / Boundary。
- Domain Model。
- Data Migration / Backfill。
- API Protocol。
- State / Concurrency。
- Failure Modes。
- Security / Permission。
- Observability。
- Performance / Capacity。
- Risks / Trade-offs。

lite 写独立 `Design Note`，至少覆盖：

- Approach。
- Impact Scope。
- Interface / Data Impact。
- Compatibility。
- Risks。
- Test Strategy。

micro 不写独立 Design，但 Plan 必须有：

- Scope。
- Touched Files。
- Change。
- Impact Scope。
- Data Impact。
- Interface Impact。
- Acceptance。
- Verification。
- Blast Radius。

Acceptance Criteria 留在 Spec。推荐使用 AC 编号和 BDD 场景：

```gherkin
### AC-001: 用户可以用正确凭证登录
Requirement: login
Type: functional
Verification: e2e
Automated: yes
Test: tests/auth/login.test.ts

Scenario: 有效登录
  Given 一个已注册用户
  When 用户提交有效邮箱和密码
  Then 系统创建已认证会话
```

好的验收标准必须可观察、可验证、可追踪到需求，不应写成”代码实现完成”。`Verification:` 是归档门禁字段，取值为 `unit` / `integration` / `e2e` / `manual`。E2E AC 必须提供 `Test:` 或 `Manual Evidence:`；manual AC 必须提供 `Manual Evidence:`。

### 测试策略：TDD / BDD / E2E

SDD 不规定具体测试框架，但要求每个 AC 都有明确的验证方式（`Verification:`），并在 Execute 阶段用对应的 `Method` 执行。测试策略在 Design 阶段的 `Test Strategy` 字段中声明，在 Acceptance 的每个 AC 中落地，在 Execute 中执行和记录。

**验证层级与适用场景：**

| Verification | 适用场景 | Method | 何时用 |
| :--- | :--- | :--- | :--- |
| `unit` | 单个函数 / 模块逻辑、边界条件、错误路径 | `tdd` | 默认首选。纯逻辑、无外部依赖的代码应全部覆盖。 |
| `integration` | 模块间交互、数据库 / API / 中间件集成 | `tdd` 或 `bdd` | 当单元测试无法验证模块协作时使用。重点验证接口契约和数据流。 |
| `e2e` | 用户关键路径、跨系统端到端行为 | `bdd` | 覆盖核心业务场景（登录、支付、下单等），数量不宜多但必须稳。 |
| `manual` | 视觉验证、主观体验、一次性检查 | `manual` | 仅当自动化不可行时使用，必须提供 `Manual Evidence:`。 |

**TDD — Execute 的默认工作方式：**

TDD 适用于 `unit` 和 `integration` 验证。SDD 的 TDD 循环与 Execute Log 集成：

1. **Red**：写失败测试，确认失败原因正确。
2. **Green**：写最小实现使测试通过。
3. **Refactor**：在测试保护下重构，行为不变。

每个 TDD 步骤在 Execute Log 中记录 AC Coverage，`Method: tdd`。当步骤不适用 TDD（如配置变更、纯 UI 调整）时，用 `Method: manual` 并提供验证证据。

**BDD — 验收标准的自然语言测试：**

BDD 用于 `e2e` 和部分 `integration` 验证。AC 的 Gherkin 场景即是测试规范：

```gherkin
Scenario: 无效密码登录
  Given 一个已注册用户
  When 用户提交有效邮箱和错误密码
  Then 系统返回认证失败并记录尝试
```

BDD 场景在 Acceptance 阶段编写，在 Execute 阶段实现为自动化测试。Execute Log 记录 `Method: bdd`，`Scenarios` 子字段追踪每个场景的通过状态。

**E2E — 关键路径的端到端保障：**

E2E 测试验证完整的用户路径，从入口到持久化。SDD 对 E2E 的核心规则：

- **每个任务 3-5 个 E2E 场景即可**——覆盖核心路径和最关键的失败路径，不是追求覆盖率。
- **E2E AC 必须提供 `Test:` 路径**——`validate --archive-ready` 会检查该路径是否存在（L3 门禁）。
- **E2E 环境不可用时**：AC 标记为 `SKIPPED`，必须提供三要素（`Reason` + `Approved By` + `Approved At`）。`Approved By` 不能是 `auto-gate`——跳过验证是人工决策。Agent 应先尝试修复环境，无法修复时标记 BLOCKED 让人决定。
- **不稳定的 E2E 测试**：flaky test 不等于 PASS。如果测试不稳定，先 debug 找根因，再决定修复或重写。不要通过重试来掩盖不稳定性。

**测试金字塔在 SDD 中的映射：**

```
        /  e2e  \           ← 少量关键路径，Method: bdd
       / integ.  \          ← 接口契约验证，Method: tdd / bdd
      /   unit    \         ← 大量逻辑覆盖，Method: tdd
     /  manual     \        ← 仅自动化不可行时，Manual Evidence 必填
```

**Design 中 `Test Strategy` 字段的写法：**

standard 的 `Technical Design` 和 lite 的 `Design Note` 都有 `Test Strategy` 字段。它应说明：

- 测试框架和运行命令。
- 哪些 AC 用 unit / integration / e2e / manual 验证。
- E2E 环境依赖和搭建方式。
- 已知约束（如外部服务 mock 策略）。

micro 模式没有独立 Design，但 Plan 的 `Verification` 字段同样需要说明验证方式。

### Plan

Plan 是执行契约，不是技术设计的替代品。Plan 必须从 Design 和 Acceptance Criteria 推导出来，每步包含：

- 文件路径。
- 具体改动。
- 对应 AC 或验收条件。
- 验证方式。

进入 Execute 前必须填写：

```text
Plan Approved By: <user> | auto-gate
Approved At: <timestamp>
Gate Policy: manual | auto | advisory
Gate Evidence: <auto/advisory 时必填>
```

GATE_POLICY 的三种策略详细说明见第四节。这里强调核心规则：**auto-gate 不是无门禁**——缺少 `Gate Evidence:` 或 `Approved At:` 都会被 validate 拦截。manual 策略下 AI 不能填写 `Plan Approved By`，必须由人工签名。

**Plan 未批准时的行为**：如果 Plan 因 Open Questions 未解决而无法批准，Agent 应主动用 `AskUserQuestion` 交互式澄清每个问题，并给出建议答案选项，而非仅提示"存在问题"。澄清后更新 spec，再走门禁。

### Execute

Execute 只做 Plan 已批准的内容。每个步骤完成后写入 `execute-log-file` 指向的 Execute Log：

```text
Step: 1
Status: DONE | BLOCKED | DEVIATED_MINOR | DEVIATED_MAJOR
Files: ...
Result: ...
Verification: ...
Deviation: ...
Timestamp: ...
```

重大偏差必须暂停并回到 Plan / Design，而不是事后改写 Spec 合理化实现。

Execute Log 每个 Step 应包含 AC Coverage 结构化记录：

```text
AC Coverage:
  - AC-001: PASS
    Scenarios:
      - "有效登录": PASS
    Test: tests/e2e/login.spec.ts
    Method: bdd
```

E2E 环境不可用时，AC 标记为 `SKIPPED`，需人工批准三要素（Reason + Approved By + Approved At）。`Approved By` 不能是 `auto-gate`。

Execute 最后一个 Step 是 Completion Verification，包含四轴自查清单和 AC Coverage 全量汇总：

```text
Step: completion-verification
Status: DONE
AC Coverage Summary:
  - AC-001: PASS (unit, tests/auth/login.test.ts)
  - AC-002: SKIPPED (e2e, tests/e2e/login.spec.ts)
Four-Axis Checklist:
  - Axis 0 (Intake): aligned
  - Axis 1 (Design/Acceptance/Plan): complete
  - Axis 2 (Code Diff): within boundary
  - Axis 3 (Execute Log): faithful
```

`validate --archive-ready` 对有 AC Coverage 的 Execute Log 做交叉检查（L1-L4）：每个 AC 有 Coverage 记录、结果 PASS、Test 路径文件存在、Scenario 名称匹配（warning）。旧 Execute Log 无 Coverage 记录时不报错（渐进式门禁）。

### Challenge（对抗评审）

**何时触发**：Execute Completion Verification 完成后自动进入。Review 已合并进 Execute 的 Completion Verification Gate，Challenge 是唯一独立质量门禁。

**谁执行**：

- **standard / lite**：必须派子 agent 执行。对抗审查的核心价值是"不是自己审自己"——主 agent 写了代码再自己审，确认偏差不可避免。子 agent 有独立上下文，只返回 verdict + findings。
- **micro**：可在主上下文内执行，但必须保持对抗角色与实现角色分离。

**怎么运行**：

```text
sdd challenge <project-dir>
```

Challenge agent 只读不写任何文件（包括代码），只返回：

```text
Challenge Verdict: PASS | PASS_WITH_CONCERNS | FAIL_SPEC | FAIL_DESIGN | FAIL_ACCEPTANCE | FAIL_PLAN | FAIL_CODE | FAIL_LOG | FAIL_LEARNING
Backtrack Target: Research | Design | Acceptance | Plan | Execute / Debug | Execute Log | Learning Check | Ready
Challenge Summary: <evidence, ≤200 words>
```

**执行证据门禁**：Challenge 完成后，必须在 Spec 中填写执行证据三要素：

```text
Challenge Executed By: subagent | inline | auto-gate | <agent-id>
Challenge Executed At: <ISO-8601>
Challenge Evidence: <verdict + summary from independent agent>
```

`validate --archive-ready` 强制校验三要素齐全，缺任何一项拦截归档。门禁策略复用 `GATE_POLICY`：

- **manual**：`Challenge Executed By` 不能是 `auto-gate`，必须由人工填写
- **auto**：AI 可填写 `auto-gate`，但三要素必须齐全
- **advisory**：与 auto 行为一致，Challenge 阶段额外提示人工确认

standard/lite 模式下 `Challenge Executed By` 必须包含 `subagent`（对抗审查的核心是"不是自己审自己"）；micro 模式下可以是 `inline`。

**审查轴**：Challenge 从六个维度独立审查，每个维度都可触发 `FAIL_*`：

| 轴 | 审查什么 | FAIL verdict | 回跳目标 |
| :--- | :--- | :--- | :--- |
| Research Challenge | 确认需求是否匹配原始目标，隐含假设是否暴露，5 个结构化要素是否准确捕获，Research Gate 是否正确记录 | FAIL_SPEC | Research |
| Design Challenge | 架构、数据模型、接口契约、影响范围、兼容性、回滚、失败模式 | FAIL_DESIGN | Design |
| Acceptance Challenge | AC 是否可观察、可验证、可追踪到需求 | FAIL_ACCEPTANCE | Acceptance |
| Plan Challenge | Plan 步骤是否可执行、有边界、从 Design 和 AC 推导 | FAIL_PLAN | Plan |
| **Code Challenge** | 代码质量（冗余、死代码、命名）、安全（硬编码密钥、注入、输入校验）、正确性（是否匹配 Spec/Design）、测试质量（测行为还是测 mock） | FAIL_CODE | Execute / Debug |
| Execute Log Challenge | 执行是否偏离 Plan，AC Coverage 是否真实 | FAIL_LOG | Execute Log |

Code Challenge 是 Challenge 与 PR review 的区别所在：PR review 关注团队协作和风格偏好，Code Challenge 关注代码是否匹配 SDD 产物的约束——Spec 说要做 X，Design 说用 Y 方案，代码是否真的做了 X 且用了 Y？安全漏洞和测试质量也在这一轴审查。

**Code Challenge 的 verdict 判定**：如果代码忠实实现了一个有缺陷的 Design，正确 verdict 是 `FAIL_DESIGN`（回跳到 Design），不是 `FAIL_CODE`。`FAIL_CODE` 只适用于代码本身有缺陷的情况。Challenge agent 需要区分"代码错了"和"代码对了但上游错了"。

**怎么结束**：

- `PASS`：对抗评审通过，进入 Learning Check → Archive。
- `PASS_WITH_CONCERNS`：通过但有顾虑，进入 Learning Check（必须创建 Learning Record）→ Archive。
- `FAIL_*`：阻止归档，进入 Cruise 修复循环。

**派发规则**（standard/lite，遵循 `protocols/subagent-dispatch.md`）：

1. Brief 自足：将 spec、design 摘要、execute log 摘要和**源代码**直接贴入 brief，不让子 agent 自己找。Code Challenge 需要读代码——brief 中必须包含源代码。
2. 子 agent 只读不写：不修改任何文件，只返回 verdict。
3. 返回压缩：verdict + backtrack target + summary（≤200 词）。

### Cruise（自主巡航）

**何时触发**：Challenge 返回 `FAIL_*` verdict 后自动进入。如果 Challenge 返回 `PASS` 或 `PASS_WITH_CONCERNS`，不需要 Cruise。

**怎么运行**：

```text
sdd cruise <project-dir> [--engine auto|prompt|local-loop|claude-code|codex|opencode] [--emit-claude-prompt] [--record-run] [--iteration N]
```

Cruise 每一轮做三件事：

1. **定位问题**：根据 `FAIL_*` 的 `Backtrack Target` 回到对应阶段修复。回跳映射：`FAIL_SPEC` → Research，`FAIL_DESIGN` → Design，`FAIL_ACCEPTANCE` → Acceptance，`FAIL_PLAN` → Plan，`FAIL_CODE` → Execute / Debug，`FAIL_LOG` → Execute Log，`FAIL_LEARNING` → Learning Check。
2. **修复并验证**：修复对应产物，运行 `sdd validate` 检查门禁。
3. **再次 Challenge**：修复后重新运行 `sdd challenge`，验证问题是否解决。

```text
┌──────────────┐
│  Challenge    │
│  FAIL_*      │
└──────┬───────┘
       │ Backtrack Target
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  修复产物     │────▶│  validate    │────▶│  challenge   │
│  (回跳阶段)   │     │  检查门禁     │     │  重新评审     │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                              │
                                    ┌─────────┴─────────┐
                                    │ PASS → 结束        │
                                    │ FAIL → 下一轮      │
                                    └───────────────────┘
```

**怎么结束**：

- Challenge 返回 `PASS` 或 `PASS_WITH_CONCERNS`：Cruise 结束，进入 Learning Check → Archive。
- 达到 `CRUISE_MAX_ITERATIONS`（默认 5）：必须停止，要求人工介入。
- 遇到安全、权限、计费、数据迁移、公共 API、不可逆变更：必须停止，要求人工介入。

**Engine 选择**：`--engine auto` 是默认值。策略是先复用宿主原生 loop；没有原生 loop 时，退回 prompt loop。无论使用哪个 engine，`Spec / Design / Plan / Execute Log / Learning` 都不能被宿主 workflow 文件替代。

**运行记录**：`sdd cruise --record-run --iteration N` 会追加 `<docs-root>/runs/<spec>.cruise.jsonl`，记录每轮的 iteration、engine、verdict 和停止原因，用于 Console 和人工审计。

### Learning Check

Learning Check 在 Challenge 通过后、Archive 之前执行。它不是复盘作文，而是把本次任务暴露出的可复用判断沉淀成规则。

以下情况必须创建 Learning Record：

- Execute Log 出现 `BUGFIX`、`BUGFIX_ESCALATED`、`DEVIATED_MINOR` 或 `DEVIATED_MAJOR`。
- Challenge verdict 是 `PASS_WITH_CONCERNS`。
- 任务来自 archived spec 的 reopen。
- Execute 或 Challenge 发现验收标准本身不充分。
- 同类失败模式重复出现。

创建命令：

```text
sdd new-learning <project-dir> [spec-name]
```

生成的 `learning-file` 必须填充 `Source Spec`、`Trigger`、`Observed Problem`、`Root Cause`、`Decision Rule`、`Applies When`、`Recommended Action` 和 `Evidence`。字段值和规则正文使用中文。`validate --archive-ready` 会在需要 Learning Record 时检查这些字段。

### Archive / Reopen

归档前运行：

```text
sdd validate <project-dir> --archive-ready
```

`archive` 会再次执行同一套校验，通过后把 Spec、Design、Execute Log，以及已绑定的 Learning Record 一起移动到 `<docs-root>/archive/`，并更新归档 Spec 内的引用。

修复已归档任务时使用：

```text
sdd reopen <project-dir> <task-slug> --defect "缺陷描述"
```

不要重新 `discover`，否则会切断历史上下文。

## 四、三种模式与门禁策略

SDD 用两个正交的配置轴定义一个任务怎么跑：

- **Mode**（standard / lite / micro）— 决定工作流形状：几个阶段、多少制品、设计深度。
- **GATE_POLICY**（manual / auto / advisory）— 决定治理松紧：谁来批 Plan、要不要人介入。

两个轴组合才完整描述任务运行方式——`micro + manual`（小改动但涉及关键逻辑）和 `standard + auto`（重流程但 AI 可自批）是完全合理的组合。

### Mode

| 门禁 / 产物 | standard | lite | micro |
| :--- | :---: | :---: | :---: |
| Research | 完整 | 保留 | 跳过 |
| Innovate | 至少两个方案 | 可跳过但写 Reason | 跳过 |
| Design | 独立 Technical Design | 独立 Design Note | 不单独创建 |
| Acceptance | AC-###，推荐 BDD | 轻量 AC | Plan 中的 Acceptance |
| Plan Approval | 必须 | 必须 | 必须 |
| Execute Log | 独立文件，必填，含 AC Coverage | 独立文件，必填，含 AC Coverage | 独立文件，必填，含 AC Coverage |
| Completion Verification | 四轴自查 + AC Coverage 汇总 | 四轴自查 + AC Coverage 汇总 | 四轴自查 + AC Coverage 汇总 |
| Learning | 条件必填 | 条件必填 | 条件必填 |
| Subagent | 推荐 | 可选 | 默认不用 |

模式选择建议：

- 新功能、重构、跨模块、外部契约、安全/权限/计费/数据迁移：用 standard。
- 中小改动、需求明确、影响面有限：用 lite。
- 单文件、低风险、可逆、无公共接口影响：用 micro。

当任务涉及安全、权限、计费、数据迁移、公共接口、跨模块副作用或不可逆变更，即使只改一个文件，也应升级到 lite 或 standard。

### GATE_POLICY

GATE_POLICY 控制 Plan 审批权——这是 SDD 最核心的治理门禁。默认 `GATE_POLICY="auto"`，在 `.sdd-config` 中配置。

| 策略 | Plan Approved By | Gate Evidence | Challenge 行为 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **manual** | 必须由人填写 `<user>` | 不要求 | 正常 | 核心模块、高风险、关键业务逻辑、上线后不可逆 |
| **auto** | AI 可填 `auto-gate` | **必须提供**（测试通过、lint 通过等事实依据） | 正常 | 常规开发、有测试覆盖的中低风险任务 |
| **advisory** | AI 可填 `auto-gate` | **必须提供** | Challenge 阶段额外提示人工确认 | 边界场景——不完全放心 auto，但 manual 太重 |

**auto 不是无门禁**——缺少 `Gate Evidence:` 或 `Approved At:` 都会被 `validate` 拦截。auto-gate 的核心是"AI 可以批准，但必须拿出证据"。

**advisory 的定位**：它是 auto 和 manual 之间的缓冲。适用于"技术上可以 auto，但想让 TL 多看一眼"的场景，比如第一次使用新模式、团队刚上手 SDD、或任务在边界条件附近。advisory 不增加 Plan 阶段的人工等待，只在 Challenge 时提醒。

**选择指南**：

- 不确定就用 advisory——它不会阻塞流程，只会在 Challenge 时多一次人工确认。
- 核心 / 高风险 / 不可逆 → manual。
- 有信心、有覆盖 → auto。
- 团队可以按模块设置不同策略：核心模块 `.sdd-config` 写 `GATE_POLICY="manual"`，常规模块用 auto。

**Mode × GATE_POLICY 组合示例**：

| 组合 | 含义 | 典型场景 |
| :--- | :--- | :--- |
| standard + manual | 重流程 + 人审批 | 支付系统重构、用户认证改造 |
| standard + auto | 重流程 + AI 可自批 | 有经验的常规标准任务 |
| lite + advisory | 中等流程 + 人确认 | 首次用 lite 模式、边界改动 |
| lite + auto | 中等流程 + AI 可自批 | 明确的中小改动 |
| micro + auto | 轻流程 + AI 自批 | 低风险小改动（最常见） |
| micro + manual | 轻流程 + 人审批 | 小改动但涉及关键逻辑（如配置变更） |

## 五、Subagent 策略

不采用“关键环节全部 subagent owner 化”。

推荐策略是：

- subagent 做 **evidence owner**：读取大量代码、历史 Spec、依赖文档，返回压缩证据。
- subagent 做 **work-package owner**：在大执行任务中处理局部实现包。
- subagent 做 **challenge axis owner**：分别检查 Challenge 的某个轴。
- orchestrator 做 **decision owner**：需求边界、方案选择、Plan gate、最终 verdict、归档一致性都由主上下文负责。

不可交给 subagent 直接决定的事项：

- Final Challenge verdict。
- Plan Approval。
- Completion Verification。
- 规范性产物的最终改写。

micro 默认不派发 subagent。lite 只在代码阅读量大或上下文污染风险高时派发。standard 推荐在 Research、复杂 Execute、Challenge 评审中使用。

## 六、两层方法论与方法论路由

SDD 自身只定义流程契约，具体“怎么把事做好”交给两层可加载的方法论。

### 执行质量层（vendored superpowers）

`vendored/superpowers/` 物理内置了 7 个来自 [obra/superpowers](https://github.com/obra/superpowers) 的方法论 skill，绑定到 RIPER 各阶段动作。触点映射见仓库根的 `INTEGRATIONS.md`；加载顺序为：宿主全局 skill → vendored 副本 → `SKILL.md` 内联摘要。

| Skill | 接入阶段 |
| :--- | :--- |
| `brainstorming` | Innovate（方案探索 / 设计澄清） |
| `writing-plans` | Plan（步骤粒度） |
| `test-driven-development` | Execute（TDD） |
| `systematic-debugging` | Execute（debug / BUGFIX，先定根因） |
| `verification-before-completion` | Execute（完成验证门禁） |
| `subagent-driven-development` | Subagent 派发 |
| `finishing-a-development-branch` | Archive（收尾分支） |

按 scope 政策只 vendor 方法论 markdown，不带 `scripts/` / `hooks/`（仅 `brainstorming` 的浏览器可视化伴侣因此降级为纯文本，需要时用宿主全局 superpowers）。维护流程见 `vendored/superpowers/SYNC.md`。

### 设计方法层

设计 / 架构方法论按复杂度进入 Design 或 Acceptance，不是固定模板：

| 参考 | 用在哪里 |
| :--- | :--- |
| DDD | 业务规则、领域模型、限界上下文、统一语言。 |
| C4 Model | 系统、容器、组件边界和依赖关系。 |
| ADR | 重要技术取舍和长期影响决策；写法见 `protocols/adr.md`。 |
| arc42 | standard 模式下完整技术设计结构。 |
| TOGAF | 多系统、多团队、企业级视角，按需借鉴业务/数据/应用/技术维度。 |
| 凤凰架构 | 分布式、可靠性、演进式架构、故障模式和权衡。 |
| BDD / Gherkin | 用户行为、CLI 行为、错误处理、状态变化验收。 |
| Learning Record | 执行后沉淀可复用判断规则，反哺后续 Research / Design / Plan / Challenge。 |

与执行质量层不同，设计方法层目前多为文字指引；只有 ADR 做成了本地可加载资源 `protocols/adr.md`（Nygard 极简格式，填进 Design 的 `Selected Option / ADR` 字段）。DDD / C4 / arc42 维持按需指引，不内置——符合 SDD“抽象、不绑定技术栈”的定位。

### 方法论路由

不要把所有方法论铺到每个任务。SDD 复用已有的 `mode` + `riskFlags` 信号路由设计方法：`sdd next` / `sdd cruise` / `sdd challenge` 输出 `DESIGN_METHOD` / `DESIGN_FOCUS_FIELDS` 作为 advisory 建议（micro 无 / lite→ADR / standard→ADR + arc42 + C4 / 各 risk 点亮对应 Design 字段 / 复杂领域提示 DDD）。路由是建议性的，信号确定、可被 cruise 和 Console 消费，最终由 orchestrator 拍板。

## 七、CLI 命令

| 命令 | 作用 |
| :--- | :--- |
| `init` | 初始化目录、配置和 AI 指令。 |
| `discover` | 创建 Spec、Design、Execute Log。 |
| `new-learning` | 创建并绑定 Learning Record。 |
| `resume` | 输出当前任务和阶段提示。 |
| `status` | 检查目录结构、Spec、Design、Execute Log 健康度。 |
| `next` | 输出当前 workflow 状态、下一步和回跳目标。 |
| `challenge` | 生成独立对抗评审 Prompt。 |
| `cruise` | 生成巡航控制 Prompt；支持 `--engine`、`--emit-claude-prompt`、`--record-run` 和 `--iteration`，但不直接调用模型或执行循环。 |
| `console` | 启动本地只读 Web Console，查看 Spec 阶段、状态、产物健康度和归档门禁。 |
| `validate` | 机器校验归档门禁。 |
| `review-execute` | 生成四轴 Review Prompt。 |
| `archive` | 归档 Spec 及引用产物。 |
| `reopen` | 基于归档任务创建修复 Spec 和新 Execute Log。 |
| `debug` | 生成根因分析 Prompt。 |
| `codemap` | 按需扫描源码并输出架构视图（不持久化，永不过时）。 |
| `install-skill` | 把当前包内的完整 Skill（含 `templates` / `protocols` / `vendored`）注册到 agent 环境（`--target codex\|cc-switch\|claude\|opencode\|all [--clean]`）。 |

安装后使用 `sdd` 命令执行所有操作。`next` / `cruise` / `challenge` 的输出已包含 `DESIGN_METHOD` / `DESIGN_FOCUS_FIELDS` 方法论路由建议（见第三、六节）。

## 八、Web Console

`sdd console [project-dir]` 会启动一个本地只读控制台，用于查看每个 Spec 的阶段、状态、Design / Execute Log / Learning 引用健康度和 `validate --archive-ready` 门禁问题。`project-dir` 可选；不传时在页面里输入或加载项目目录。

Web Console 是文件系统产物的 projection，不是新的 source of truth：

- 数据来源仍然是 `<docs-root>/specs/`、`<docs-root>/design/`、`<docs-root>/logs/`、`<docs-root>/learnings/`、`<docs-root>/runs/`、`<docs-root>/archive/`。
- 项目看板和 Spec 列表读取后台内存索引快照；首次加载或刷新时可能短暂显示 indexing，再自动更新。
- 阶段由最早未满足门禁推导：Research、Innovate、Design、Acceptance、Plan、Execute、Learning、Ready、Archived。
- 详情页展示 gate policy、cruise policy、challenge verdict 和 backtrack target。
- 详情页展示最新 cruise run 的 iteration、engine 和 stop reason。
- 完整归档校验只在详情页和 Validate 操作中按需执行，避免看板和列表加载被全量校验阻塞。
- 当前版本只读展示和校验，不直接编辑 Spec、Design、Execute Log 或 Learning；Edit 按钮只调用本机默认程序打开文件。
- 后续如加入 archive / reopen / discover 操作，也应调用现有命令，而不是在 Web 层直接改文件。

## 九、FAQ

### Plan 能替代技术设计吗？

不能。Design 解释为什么这样做、有哪些边界和取舍；Plan 只说明怎么按步骤执行。standard/lite 缺少 Design 时，`validate --archive-ready` 会阻止归档。

### Execute Log 为什么独立？

执行日志是事实记录，和 Spec 的规范性内容性质不同。独立后 Challenge 可以检查”计划、实现、日志”三者是否一致，Archive 也能保留完整审计链。

### Spec 还是单一真相源吗？

Spec 是控制面真相源。完整任务真相由 Spec 引用的 Design、Execute Log、Learning 等共同构成。Challenge 和 Archive 必须沿引用读取，而不是只读 Spec 文件本身。

### 什么时候用 CodeMap？

CodeMap 是按需计算视图（`sdd codemap <dir>`），不持久化、永不过时。在 Research 阶段需要架构概览时运行一次即可。架构事实变更应记录到 Learning Record。
