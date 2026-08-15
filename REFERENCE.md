# SDD-RIPER 协议参考

这份参考文档保存 SDD-RIPER 的精确字段、门禁、调度、安全边界和命令契约，主要供维护者、集成者和 AI agent 查阅。普通使用者请先阅读 [README.md](./README.md) 和 [GUIDE.md](./GUIDE.md)。当前版本的 SDD-RIPER 是 Node CLI 和文件系统产物协议，不是模型执行 runtime；它通过 prompt、门禁和账本引导宿主 agent 或人工推进。

## 怎么使用这份参考

不建议从头背诵。先在下方“快速索引”找到你的问题，再进入对应章节查精确规则：

1. 想完成一个日常任务，先读 [GUIDE.md](./GUIDE.md)。
2. 想确认某个字段为什么必填、某次失败应该回到哪里，在本页按章节查找。
3. 想实现集成、修改模板或审查 Agent 行为，以本页的精确字段和规则为准。
4. 中英文协议原文、命令、状态值和代码块是可执行契约；章节前的“本章回答”只是阅读导航，不能替代正文。

## 快速索引

| 你要查什么 | 去哪里 |
| :--- | :--- |
| Spec、Design、Execute Log、Learning 分别负责什么 | [产物边界](#一产物边界) |
| CLI、Agent 和任务文件如何协作 | [流程架构](#二流程架构) |
| 一条任务完整经过哪些阶段 | [RIPER 流程](#三riper-流程) |
| standard、lite、micro 怎么选，任务采用哪档自治 | [任务形状与自治模式](#四任务形状与自治模式) |
| 主 Agent、审查者和可委托工作如何分工 | [编排模型](#五编排模型phase-dispatch-map) |
| TDD、BDD、ADR、C4 等方法何时使用 | [方法论路由](#六两层方法论与方法论路由) |
| 命令和参数 | [CLI 命令](#七cli-命令) |
| Console 能看什么、不能做什么 | [Web Console](#八web-console) |
| Project Profile 的确认与安全边界 | [Project Engineering Profile](#project-engineering-profile) |
| Quality Plan 的输入、输出和失败语义 | [Quality Policy Routing](#quality-policy-routing) |
| E2E 与视觉验证如何配置 | [Verification Provider](#verification-provider) |

## 常见术语

| 术语 | 用人话说 |
| :--- | :--- |
| `Spec` | 一次任务的控制页：目标、范围、计划、批准和最终结论都从这里串起来。 |
| `Design` | 较大任务的独立技术方案，解释为什么这样做以及如何兼容、验证和回退。 |
| `Execute Log` | 实际执行事实，只追加新记录，不改写过去。 |
| `Learning Record` | 从偏差、修复或复审中提炼出的可复用规则。 |
| `Gate` | 必须满足后才能进入下一阶段的检查点。 |
| `AC Coverage` | 每条验收标准由什么测试或人工证据覆盖，以及结果如何。 |
| `Challenge` | 执行完成后的独立挑刺检查，负责给出结论，不负责修改实现。 |
| `Cruise` | 有次数上限的修复导航，告诉主 Agent 应回到哪个阶段继续。 |
| `Provider` | 端到端或视觉验证所引用的具名项目配置。 |
| `fail-closed` | 信息缺失或不可信时先阻止继续，而不是猜测为通过。 |
| `realpath` | 路径解析后的真实位置，用于防止符号链接把读取带到受控目录之外。 |

## 不可跳过的授权规则

> 本章回答：什么时候必须停下来向当前用户请求授权，以及为什么已有 PASS 或批准不能代替本次授权。

当 `NEXT_ACTION: request_archive_authorization` 出现时，Agent 必须停止推进，并向当前用户请求针对本次归档的明确授权。

- 不得自行构造归档授权参数，也不得把 Ready、PASS、Plan Approval、Challenge 结论或以前的授权推断为本次许可。
- `human:<name>` 只是归档记录中的审计声明，不是身份认证。
- 归档调用必须携带当前用户给出的 `--authorized-by "human:<name>" --authorization-evidence "<text>"`；检查通过只表示任务已准备好，不授予归档权限。

## 设计理念

> 本章回答：SDD-RIPER 在 AI 开发协作中负责什么、不负责什么，以及 workflow、Cruise、宿主循环和 Challenge 如何分工。

### SDD 是控制协议层，不是 harness

harness（Claude Code、Codex CLI 等）是承载 agent 运行的运行时外壳，负责工具调用、权限、上下文窗口和模型执行循环。SDD 不做这些，也不该做。SDD 是骑在 harness 之上的**控制协议层**：它定义“做什么、何时停、出问题回退到哪”，以及一条由 Spec / Design / Execute Log / Learning 组成的产物真相链；真正的模型执行和代码修改由宿主 harness 完成。

用“是不是完备 harness”衡量 SDD 是用错了标尺。该问的是：作为 AI 交付的控制协议，它是否覆盖了 意图捕获 → 设计 → 计划 → 执行审计 → 验证门禁 → 复盘沉淀 → 归档复用 的完整链路，并在 advisory / autonomous 两种模式下都成立。

### 四个核心组件的关系

| 组件 | 角色 | 比喻 |
| :--- | :--- | :--- |
| `workflow`（内部状态引擎） | 只读分析 Spec + 门禁，输出 verdict / 回跳目标 / 下一步 / risk flags / 方法论建议 | 大脑读数 |
| `cruise`（自主巡航） | 把状态包装成循环契约：每轮修哪块、何时停、FAIL 回退到哪；自己不跑、不越权写目标阶段产物 | 循环契约书 |
| 宿主原生 loop（Claude Dynamic Workflows / Codex / opencode） | 真正一轮一轮执行 | 借来的发动机 |
| `challenge`（对抗审核） | 独立只读 reviewer，给出真正裁决 | 每轮裁判 |

关键解耦：`workflow` 只发“应该用 ADR / 回退到 Design”这类**信号/指针**，不持有方法论实体和执行循环；方法论实体在 `SKILL.md` / `protocols/` / `vendored/`，执行循环借宿主，challenge 的裁决独立于实现 agent（裁判不能是运动员）。这就是“SDD 是控制协议、不是执行器”的落地方式。

## 一、产物边界

> 本章回答：Spec、Design、Execute Log、Learning Record 和 Cruise Run 分别存在哪里、谁拥有哪一类事实。

当前版本采用 **Spec 控制面 + 独立 Design + 独立 Execute Log + 条件 Learning Record**。

| 产物 | 存放位置 | 职责 |
| :--- | :--- | :--- |
| Spec | `<docs-root>/specs/` | 需求、Research、Innovate、Acceptance Criteria、Plan、审批、Completion Verification / Challenge verdict，以及 `design-file` / `execute-log-file` / `learning-file` 引用。 |
| Design | `<docs-root>/design/` | standard 的 `Technical Design` 或 lite 的 `Design Note`。micro 不创建独立 Design。 |
| Execute Log | `<docs-root>/logs/` | 执行步骤、偏差、验证结果，append-only。 |
| Learning Record | `<docs-root>/learnings/` | 偏差、BUGFIX、concern、reopen 暴露出的可复用决策规则。 |
| Cruise Run | `<docs-root>/runs/` | 巡航 iteration、driver、verdict、回跳目标和停止原因，属于可观测性账本，不替代核心产物。 |

Spec 是控制面，不再承载完整技术设计、执行日志和经验库。这样 Challenge 和 Archive 可以分别审查规范、设计、执行事实和可复用经验。

阶段产物的模板结构保持英文，包括章节标题、人工字段标签、frontmatter 键、`design-file` / `execute-log-file` / `learning-file` 引用键、CLI 命令名、状态枚举、验证类型枚举和 `AC-###` 编号。实际填充的需求分析、方案取舍、设计说明、计划步骤、执行说明、证据和经验规则使用中文。

## 二、流程架构

> 本章回答：控制面、产出面和调度面如何协作，以及哪些命令只读、哪些操作会写入任务产物。

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

Cruise orchestrator 只负责路由与迭代边界；main agent 重入 `BACKTRACK_TARGET` 并遵守目标阶段门禁和写入边界；Challenge reviewer 始终保持 read-only。三者的职责不会因为使用原生 loop 或 prompt-loop 而合并。

## 三、RIPER 流程

> 本章回答：任务从需求确认到归档经过哪些阶段，每个阶段的进入条件、产出和失败回跳是什么。

```text
Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> (Cruise) -> Learning Check -> Archive
```

当 AC 写 `Verification: e2e` 时，必须同时声明 `Provider: <provider-id>`。已归档（archived）和历史（legacy）制品始终可读，无需迁移；读取历史制品不得静默改写它们。

Execute 内含 Completion Verification Gate（四轴自查清单 + 前序执行 Step 中的正式 AC Coverage 记录），替代了原独立的 Review 阶段。Challenge 是 Execute 之后的唯一质量门禁。`PASS_WITH_CONCERNS` 直接进入 Learning Check（不再回退到 Review）。

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
│  └─ Plan Approval ─┬─ agent: agent:<id> + Approved At + Evidence          │
│                    └─ human: human:<name> + Approved At                    │
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
│  │  │    └─ SKIPPED 专属: Reason + Approved By: human:<name> + Approved At│
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
│     ├─ Earlier execution Steps contain formal AC Coverage records         │
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
│                    --executed-by "subagent:<id>"                           │
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
│  sdd cruise <dir> [--driver auto|prompt|local-loop|claude-code|codex]      │
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
│  AUTONOMY_MODE 决定自动、监督或人工推进；迭代预算始终生效                 │
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
│  │  ├─ Plan Gate: Approved By + Approved At + Gate Evidence（agent 批准时）│    │
│  │  ├─ Challenge Verdict: 非 FAIL_*                                    │    │
│  │  ├─ Challenge Evidence: Executed By + Executed At + Evidence        │    │
│  │  │   ├─ standard/lite: Executed By 为可审计独立 reviewer             │    │
│  │  │   ├─ micro: 可 inline                                            │    │
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
│  sdd archive <dir> <spec-name> --authorized-by human:<name>                │
│    --authorization-evidence <text>                                          │
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
    ├─ nextAction: PASS → request_archive_authorization, FAIL_* → repair_<target>
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

`auto` 与已获得后续推进授权的 `supervised` 可使用巡航；`human` 只输出当前治理节点导航。是否复用宿主原生 loop 由 `--driver` 和宿主能力决定。

`sdd cruise --driver claude-code --emit-claude-prompt` 会输出包含 `ultracode:` 和 `/effort ultracode` 提示的 Claude Code workflow 启动 prompt；真正的 workflow script 由 Claude Code 自己生成和执行。`sdd cruise --record-run --iteration N` 会追加 `<docs-root>/runs/<spec>.cruise.jsonl`，用于 Console 和人工审计查看巡航状态。

### Research

目标是把”原始要求”变成可执行的 Confirmed Requirement。应产出：

- Requirement Review：歧义、隐含假设、风险、外部依赖。
- Findings：从代码、文档、历史 Spec 得到的事实。**应包含项目本身的编码惯例和约束**（如 `eslint` / `tsconfig` / `.editorconfig` 的关键规则、测试框架和覆盖率阈值、CI 流水线的阻断条件等），确保后续 Design 和 Execute 不违背项目既有规范。架构概览可按需运行 `sdd codemap <dir>`。外部材料（PRD、UI 稿、原型等）放入 `mydocs/context/<task-name>/`，`sdd discover` 自动绑定 `context-source`。
- Open Questions：必须澄清的问题。**Agent 应主动用 `AskUserQuestion` 交互式提问，而非仅列出问题等用户自行编辑。** 提问时给出 2-4 个具体选项，每个选项应是 **AI 基于上下文推理出的建议答案**，而非空占位符。不必穷举所有可能——用户始终可通过”其他”选项输入自定义答案。用户确认、微调或另给答案后，写入 spec 的 Assumptions 或 Confirmed Requirement，并从 Open Questions 中移除。
- Assumptions：暂时接受但需要追踪的假设。
- Research Gate：`Research Reviewed By` + `Research Reviewed At`，确认 Research 产出的独立审查。standard/lite 要求可审计 reviewer（`subagent:<id>`、`external-agent:<id>` 或 `human:<name>`）；micro 跳过。自动 reviewer 只有在当前 Spec 的新鲜授权明确包含 reviewer actor 时才能直接启动；否则必须暂停并请求当前用户明确授权。不得跳过门禁或伪造证据。
- Confirmed Requirement：校准后的需求边界，包含五个结构化要素：Scope Boundary（范围边界）、Irreversibility（不可逆性）、Impact Radius（影响半径）、Dependencies & Constraints（依赖与约束）、Acceptance Intent（验收意图）。

### Visual Context Guidance（按需）

- **触发事实：** Spec 的精确 Profile / `affected-units` 表明任务影响 UI，或这些事实不足以判断；Context 中存在设计图、截图、文档、文字说明或 URL。（Trigger Fact: UI impact or visual-context facts need routing.）
- **Agent 动作：** 优先从精确工程事实推导 `ui-impact`，未知时只问一次；只读运行 visual discover/inspect，根据材料可比性解释推荐 `not-required`、`direction` 或 `fidelity` 的理由，并报告 diff 状态。（Agent Action: infer first, then recommend, discover, and inspect read-only evidence.）
- **人工门禁：** `ui-impact` 无法从 exact 工程事实推导时仅询问一次；启用严格合同、批准设计方向、创建/更新/批准 baseline 均须人工决定，Agent 不得代批。视觉意图由 Agent 根据任务事实主动路由，不新增 Archive Gate。（Human Gate: ask once only when exact facts cannot establish UI impact; strict-contract, direction, and baseline decisions remain human.）
- **相关 CLI：** `sdd visual discover`、`sdd visual select`、`sdd visual init`、`sdd visual inspect`；fidelity 验证另见 `sdd verify visual`。（CLI: use the visual group and the controlled visual verifier.）

每个新 Spec 在 Research 前先确定 `ui-impact`：优先读取 Spec 绑定的精确 Profile 与 `affected-units`；仍无法判断时，SDD 只问一次“是否影响用户界面”。纯后端任务记录 `ui-impact: no` 并跳过。前端或混合任务记录 `ui-impact: yes`，必须通过 `sdd visual select` 一次性选择 `visual-context-intent`：`not-required`、`direction` 或 `fidelity`。

用户可以把本地设计图、截图、PDF/SVG、文字说明和 URL 放进同一 Context。`sdd visual discover` 只读扫描，输出候选、缺口和无法可靠推断时才需要的补问；候选不是自动确认的设计稿。Figma URL 与普通 URL 使用同一种 reference 候选，不联网读取内容、不自动批准、不启动浏览器，也不执行截图 diff。实际 Figma MCP 获取器会在后续独立 Spec 中实现。

`baseline` 是当前 Spec 冻结且经当前用户认可的目标 UI PNG，不是跨 Spec 历史基线库。新 Spec 可以直接使用最新 UI PNG；旧页面截图只是可选 Context，不是严格视觉验证的必需输入。候选图和项目默认图片均不等同于人工认可，工具也不提供 baseline 的自动创建、生成、批准、替换、版本化或管理。

Agent 必须说明推荐理由，并按以下五项精确路由视觉意图：

1. `fidelity` 的目标图必须是可解码 PNG。
2. scenario id、route（路由）、state（状态）和 viewport（视口）必须明确。
3. baseline / 目标 PNG 与 current screenshot 的像素宽度和高度必须分别完全一致；尺寸近似、缩放后相同或笼统的“可以比较”都不满足条件。
4. 测试数据、字体和资源必须稳定，可在验证环境中复现。
5. 任一条件不满足时推荐 `direction`，不得把候选图或项目默认图片视为人工批准。

合同中的 `scenario.baseline.path` 是相对当前 Spec Context 的 baseline 路径，必须同时通过 lexical（词法）containment 与 realpath containment，两项检查都须证明目标是 project-local（项目内）文件；词法越界或符号链接逃逸一律 fail-closed。`scenario.baseline.status` 只允许 `pending` 或 `approved`：`fidelity` 必须是 `approved` 且 `path` 非空，`direction` 才允许 `pending`。写入 `approved` 和合同级人工批准都只能来自当前用户的明确决定，Agent 不得代批。

`not-required` 与 `ui-impact: no` 绝不因缺少视觉材料阻塞 Plan。只有用户明确运行 `sdd visual init <dir> --spec <path> --mode fidelity|direction` 后，严格 `visual-evidence` 合同才会启用；它记录来源、路由/状态/视口、基线与人工批准。`sdd visual inspect`、普通 `validate` 和 `next` 会显示 `not-applicable`、`blocked`、`pending-approval` 或 `ready`；当已有匹配的 Visual Run 时，inspect 还会投影 `not-run`、`pass`、`fail` 或 `stale` diff 状态。`direction` 允许方向批准后先进入 Plan，并以 pending 表示首版截图待 Execute 补齐；该补齐由任务自己的 manual AC 和 Execute Log 记录。视觉合同不新增 Archive Gate。

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

- Selected Option。
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
- **E2E 环境不可用时**：AC 标记为 `SKIPPED`，必须提供三要素（`Reason` + `Approved By: human:<name>` + `Approved At`）。跳过验证是人工决策。Agent 应先尝试修复环境，无法修复时标记 BLOCKED 让人决定。
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
Plan Approved By: agent:<id> | human:<name>
Approved At: <timestamp>
Gate Evidence: <agent:<id> 时必填>
```

自治模式的详细说明见第四节。这里强调核心规则：**auto 下的 agent approval 也不是无门禁**——缺少 `Gate Evidence:` 或 `Approved At:` 都会被 validate 拦截；supervised/human 必须由人工批准 Plan。

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

E2E 环境不可用时，AC 标记为 `SKIPPED`，需人工批准三要素（Reason + `Approved By: human:<name>` + Approved At）。

AC Coverage 必须记录在前一个正式执行 Step 的 `AC Coverage:` 中；Completion Verification 只记录结果、四轴自查、验证命令和时间戳，不能将 Summary 作为 evidence：

```text
Step: execution coverage
Status: DONE
AC Coverage:
  - AC-001: PASS
    Test: tests/auth/login.test.ts
    Method: unit
  - AC-002: SKIPPED
    Reason: E2E environment unavailable
    Approved By: human:reviewer
    Approved At: 2026-01-01T00:00:00Z
---
Step: completion-verification
Status: DONE
Result: 所有执行项与 AC Coverage 已完成核验。
Four-Axis Checklist:
  - Axis 0 (Intake): aligned
  - Axis 1 (Design/Acceptance/Plan): complete
  - Axis 2 (Code Diff): within boundary
  - Axis 3 (Execute Log): faithful
Verification: node --test tests/auth/login.test.ts
Timestamp: 2026-01-01T00:01:00Z
```

`validate --archive-ready` 对有 AC Coverage 的 Execute Log 做交叉检查（L1-L4）：每个 AC 有 Coverage 记录、结果 PASS、Test 路径文件存在、Scenario 名称匹配（warning）。旧 Execute Log 无 Coverage 记录时不报错（渐进式门禁）。

### Challenge（对抗评审）

**何时触发**：Execute Completion Verification 完成后，`sdd next` 路由为 `run_challenge`。路由不等同于自动调度审查；standard/lite 如需使用子 agent，必须先取得当前用户明确授权。Review 已合并进 Execute 的 Completion Verification Gate，Challenge 是唯一独立质量门禁。

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
Challenge Executed By: subagent:<id> | external-agent:<id> | human:<name> | inline
Challenge Executed At: <ISO-8601>
Challenge Evidence: <verdict + summary from independent agent>
```

`validate --archive-ready` 强制校验三要素齐全，缺任何一项拦截归档。standard/lite 模式下 `Challenge Executed By` 必须是可审计独立 reviewer：`subagent:<id>`、`external-agent:<id>` 或 `human:<name>`。micro 模式下可以是 `inline`。自动 reviewer 只有在当前 Spec 的新鲜授权明确包含 reviewer actor 时才能直接启动；否则必须暂停并请求当前用户明确授权。不得跳过门禁或伪造证据。

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
- `FAIL_*`：阻止归档，`sdd next` 路由到对应修复阶段；仅在 Cruise 已启用且满足当前任务授权与阶段门禁时，才运行 Cruise 修复循环。

**派发规则**（standard/lite，遵循 `protocols/subagent-dispatch.md`）：

1. Brief 自足：将 spec、design 摘要、execute log 摘要和**源代码**直接贴入 brief，不让子 agent 自己找。Code Challenge 需要读代码——brief 中必须包含源代码。
2. 子 agent 只读不写：不修改任何文件，只返回 verdict。
3. 返回压缩：verdict + backtrack target + summary（≤200 词）。

### Cruise（自主巡航）

**何时触发**：Challenge 返回 `FAIL_*` verdict 后，`sdd next` 路由到其 `Backtrack Target` 对应的修复阶段；这不自动启动 Cruise。只有 Cruise 已启用且当前任务满足授权与阶段门禁时，才可运行 Cruise。如果 Challenge 返回 `PASS` 或 `PASS_WITH_CONCERNS`，不需要 Cruise。

**角色合同**：Cruise orchestrator 只读取状态、路由 `BACKTRACK_TARGET` 并控制迭代预算；main agent 进入目标阶段完成允许的修复；Challenge reviewer 只返回 verdict 与证据，保持 read-only。Cruise 不获得跨阶段写入权限。

**怎么运行**：

```text
sdd cruise <project-dir> [--driver auto|prompt|local-loop|claude-code|codex|opencode] [--emit-claude-prompt] [--record-run] [--iteration N]
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

**Driver 选择**：`--driver auto` 是默认值。策略是先复用宿主原生 loop；没有原生 loop 时，退回 prompt loop。无论使用哪个 driver，`Spec / Design / Plan / Execute Log / Learning` 都不能被宿主 workflow 文件替代。

**运行记录**：`sdd cruise --record-run --iteration N` 会追加 `<docs-root>/runs/<spec>.cruise.jsonl`，记录每轮的 iteration、driver、verdict 和停止原因，用于 Console 和人工审计。

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

- **触发事实：** Challenge 已通过、Learning Check 已完成且 `validate --archive-ready` 满足完成条件；或归档任务后来发现缺陷。（Trigger Fact: an active task is ready to archive, or an archived task has a defect.）
- **Agent 动作：** 先只读校验并在 `request_archive_authorization` 停机；归档后发现缺陷时创建有历史关联的新修复 Spec，而不改写历史产物。（Agent Action: validate, stop for authorization, and reopen defects through a new active Spec.）
- **人工门禁：** 每次 Archive 都必须取得当前用户针对本次归档的明确授权；Ready、PASS、Plan Approval、Challenge 或旧授权均不能替代。（Human Gate: every archive requires fresh, explicit current-user authorization.）
- **相关 CLI：** `sdd validate <project-dir> --archive-ready`、`sdd archive ... --authorized-by ... --authorization-evidence ...`、`sdd reopen ... --defect ...`。（CLI: validate, archive with evidence, or reopen a defect.）

归档前运行：

```text
sdd validate <project-dir> --archive-ready
```

`validate --archive-ready` 只证明完成条件满足；此时 `next` 输出 `request_archive_authorization`，`resume` 输出 `await_archive_authorization`。Agent 必须停止并取得当前用户明确授权。随后 `archive` 携带 `--authorized-by "human:<name>" --authorization-evidence "<text>"` 再次执行同一套完成校验，通过后把 Spec、Design、Execute Log，以及已绑定的 Learning Record 一起移动到 `<docs-root>/archive/`，更新归档 Spec 内的引用并记录授权审计字段。

修复已归档任务时使用：

```text
sdd reopen <project-dir> <task-slug> --defect "缺陷描述"
```

不要重新 `discover`，否则会切断历史上下文。

## 四、任务形状与自治模式

> 本章回答两个互不替代的问题：任务需要多少制品，以及 AI 可以连续推进到哪里。

SDD 用更少配置表达任务治理：

- **Mode**（standard / lite / micro）写在 Spec 上，决定工作流形状：几个阶段、多少制品、设计深度。
- **Autonomy Mode**（auto / supervised / human）在项目中提供默认值，并冻结到每个 Spec，决定哪些治理转换必须等待当前用户。
- **Independent Review** 由 Spec 中的 reviewer evidence 表达，不由审批策略表达。

新项目默认 `AUTONOMY_MODE="supervised"`。项目配置不能单独充当当前用户授权。

创建 Spec 前，AI 会先主动询问当前任务选择 `auto`、`supervised` 还是 `human`，并推荐 `supervised`。项目默认值只是推荐，不能静默替用户选择；如果用户已经明确指定模式，AI 应复述并请用户确认，不再重复询问。确认后的值通过 `discover --autonomy-mode` 冻结到该 Spec。

### Mode

| 门禁 / 产物 | standard | lite | micro |
| :--- | :---: | :---: | :---: |
| Research | 完整 | 保留 | 跳过 |
| Innovate | 至少两个方案 | 可跳过但写 Reason | 跳过 |
| Design | 独立 Technical Design | 独立 Design Note | 不单独创建 |
| Acceptance | AC-###，推荐 BDD | 轻量 AC | Plan 中的 Acceptance |
| Plan Approval | 必须 | 必须 | 必须 |
| Execute Log | 独立文件，必填，含 AC Coverage | 独立文件，必填，含 AC Coverage | 独立文件，必填，含 AC Coverage |
| Completion Verification | 四轴自查；AC Coverage 记录位于前序执行 Step | 四轴自查；AC Coverage 记录位于前序执行 Step | 四轴自查；AC Coverage 记录位于前序执行 Step |
| Learning | 条件必填 | 条件必填 | 条件必填 |
| Subagent | 推荐 | 可选 | 默认不用 |

模式选择建议：

- 新功能、重构、跨模块、外部契约、安全/权限/计费/数据迁移：用 standard。
- 中小改动、需求明确、影响面有限：用 lite。
- 单文件、低风险、可逆、无公共接口影响：用 micro。

当任务涉及安全、权限、计费、数据迁移、公共接口、跨模块副作用或不可逆变更，即使只改一个文件，也应升级到 lite 或 standard。

### AUTONOMY_MODE

- **触发事实：** 创建新 Spec、切换活动任务的自治档位，或 scope/risk/Plan digest 变化使既有授权失效。（Trigger Fact: task creation, mode changes, or authorization-invalidating digest changes.）
- **Agent 动作：** 读取 effective mode/source、authorization state、actors、digests 与 `STOP_REASON`，只在新鲜授权覆盖的范围内继续；任何 stop reason 都停止复用原生循环。（Agent Action: inspect effective autonomy facts and advance only within fresh authorization.）
- **人工门禁：** 用户确认每个 Spec 的自治档位；`supervised` / `human` 的 Plan Gate 由人批准，持续推进授权与 Plan Approval 分开审计；范围扩大、新风险及其他专用硬停机仍须人工决定。（Human Gate: mode choice, required Plan approval, and expanded-risk decisions remain human.）
- **相关 CLI：** `sdd autonomy inspect|select|migrate|authorize|activate-plan|approve-gate`，并用 `sdd next` / `sdd resume` 查看当前停机原因。（CLI: use the autonomy group plus next/resume projections.）

`.sdd-config` 只声明新 Spec 的默认协作方式：

```ini
AUTONOMY_MODE="supervised"
CRUISE_MAX_ITERATIONS="5"
```

| 模式 | Plan Gate | 连续推进授权 | 正常停止点 |
| :--- | :--- | :--- | :--- |
| `auto` | 可由 `agent:<id>` 批准，但必须有 `Approved At` 与 `Gate Evidence` | Intake/Scope 后由当前用户按 scope/risk digest 授权一次 | 最终归档授权 |
| `supervised` | 必须由 `human:<name>` 批准 | 与 Plan Approval 同次交互记录，但作为独立授权事实 | 最终归档授权 |
| `human` | 必须由 `human:<name>` 批准 | 不授予持续推进权；关键治理转换逐次记录 | 每个待确认治理节点 |

每个新 Spec 固定 `autonomy-mode` 与 `autonomy-mode-source`。活动 Spec 可通过受控命令切换，切换会使旧授权失效；归档 Spec 不可切换。项目默认值变化不会重解释已有 Spec。

写命令只接受当前活动 Spec，并使用项目级 `.sdd-autonomy.lock` 在锁内重新读取和校验 digest；非活动、归档、越界、锁冲突或摘要变化均零写入。关键命令为：

```text
sdd autonomy inspect <dir> --spec <active-spec>
sdd autonomy authorize <dir> --spec <active-spec> --expected-scope-digest <digest> [--expected-plan-digest <digest>] ...
sdd autonomy activate-plan <dir> --spec <active-spec> --expected-scope-digest <digest> --expected-risk-snapshot <digest> --expected-plan-digest <digest> --activated-by agent:<id> --evidence <text>
sdd autonomy approve-gate <dir> --spec <active-spec> --gate <gate> --expected-digest <digest> ...
```

`supervised` 的 `authorize` 必须同时匹配用户实际审阅的 Plan digest。`auto` 的任务授权只覆盖 Plan 前阶段；Plan 批准后必须追加 `plan_activation`，Plan 修订时以同一命令 rebind。只有 Scope 与风险快照均未改变才能激活；新增风险返回 `risk_changed`，范围变化返回 `scope_changed`。Cruise 在任一 `STOP_REASON` 下都不得复用原生循环，账本分别记录 `budget_exhausted` 与 `archive_authorization`。

三档都不允许旁路这些门禁：最终归档、Project Profile 精确 digest、E2E `SKIPPED`、不可逆动作、范围扩大、新风险和平台权限。自动 reviewer 仍须保持只读、独立和可审计。

旧活动配置不会被猜测映射；工作流返回 `SDD_AUTONOMY_MIGRATION_REQUIRED`，由用户明确选择新模式后运行 `sdd autonomy migrate <dir> --mode auto|supervised|human`。历史归档与旧账本仍只读可见，不会被迁移或改写。

## 五、编排模型：Phase Dispatch Map

> 本章回答：哪些决策必须由主 Agent 保留，哪些工作可以委托，哪些审查必须保持角色独立。

SDD-RIPER 的编排模型回答一个核心问题：**每个阶段内，哪些活动必须由主 agent（orchestrator）做，哪些可以委托，哪些必须委托？**

### 三类活动

| 类别 | 含义 | 示例 |
| :--- | :--- | :--- |
| **KEEP** | orchestrator 必须自己做。涉及门禁决策、用户交互或跨产物判断。 | Plan 审批、Confirmed Requirement 终审、Challenge verdict 聚合 |
| **MUST_DELEGATE** | 必须委托独立角色。角色分离是硬约束——实现者不能审查自己的工作。 | Challenge 对抗评审、Research Gate 审查 |
| **DELEGATABLE** | orchestrator 可自行决定。取决于上下文负载、任务规模和角色分离收益。 | Design 编写、代码实现、Findings 证据收集 |

三类分法的设计意图：SDD 定义**原则**（什么必须委托、什么必须保留、什么灵活可选），宿主环境决定**策略**（subagent、不同对话、人工审核等具体执行方式）。

### 各阶段 Dispatch Map

| 阶段 | 活动 | 类别 | 理由 |
| :--- | :--- | :--- | :--- |
| Research | Requirement Review | KEEP | 需要用户交互（Open Questions、Assumptions） |
| Research | Findings 证据收集 | DELEGATABLE | 代码/文档阅读量大时委托，子 agent 返回压缩证据 |
| Research | Confirmed Requirement | KEEP | 门禁决策——orchestrator 终审 |
| Research | Research Gate 审查 | MUST_DELEGATE | 角色分离——产出 Research 的人不能审查它 |
| Innovate | 方案探索 | DELEGATABLE | 子 agent 可以头脑风暴，但小任务内联也自然 |
| Innovate | 方案选择 | KEEP | 门禁决策 |
| Design / Acceptance | Design 编写 | DELEGATABLE | Brief 成本高；小任务内联，大任务按模块委托 |
| Design / Acceptance | AC 编写 | DELEGATABLE | 同 Design 的取舍 |
| Design / Acceptance | Design 审查 | MUST_DELEGATE | 通过 Challenge 阶段实现，不是独立派发 |
| Plan | Plan 编写 | KEEP | 需要完整的上游上下文（Design + AC） |
| Plan | Plan 审批 | KEEP | 门禁决策 |
| Execute | 代码实现 | DELEGATABLE | Plan 已定义边界；委托节省上下文且保护 Challenge 独立性 |
| Execute | 结果验证 | KEEP | orchestrator 重读文件、跑测试——验证不可委托 |
| Challenge | 对抗评审 | MUST_DELEGATE | 角色分离——实现者不能审查自己的工作 |
| Challenge | Verdict 聚合 | KEEP | orchestrator 应用 verdict 优先级并记录 |
| Learning Check | Learning Record 创建 | KEEP | orchestrator 决定是否存在可复用经验 |
| Learning Check | 证据收集 | DELEGATABLE | 子 agent 可收集证据，orchestrator 写规则 |
| Archive | 归档执行 | KEEP | orchestrator 拥有归档决策和执行 |

### DELEGATABLE 决策框架

当一个活动是 DELEGATABLE，orchestrator 基于三个信号决定：

| 信号 | 低 | 高 |
| :--- | :--- | :--- |
| **上下文负载** | 早期阶段，spec 小 → 内联 | 多阶段已完成，spec 大 → 委托 |
| **任务规模** | 1-2 文件，<100 行变更 → 内联 | 6+ 文件或多模块 → 委托 |
| **角色分离收益** | 下游无独立审查依赖 → 仅省上下文 | 委托保护下游审查独立性 → 双重收益 |

**关键行**：即使上下文负载低、任务规模小，如果委托能保护审查独立性（如 Execute → Challenge），也应该委托。一个内联 Execute 步骤看似无害，但会让 orchestrator 同时成为实现者和审查者——这正是导致自签 Challenge PASS 的模式。

### 子 agent 的三个约束

1. **Brief 自足**：orchestrator 将相关 Spec / Design / Execute Log 摘要直接贴入 brief，不让子 agent 自己找。
2. **子 agent 不写 SDD 产物**：Spec（控制面决策）、Design（技术设计）、Execute Log（执行事实）、Learning Record（可复用规则）由 orchestrator 写入。子 agent 可以修改代码文件，但不能创建或修改 SDD 产物。
3. **返回压缩**：verdict + summary + 证据指针 + 可选建议。禁止原始文件转储、长引用、verbose 推理链。

### 委托后验证

任何 DELEGATABLE 活动委托后，orchestrator 必须验证结果：

1. **重读变更文件**——确认变更在 Plan 步骤或 brief 范围内。
2. **运行测试**——确认子 agent 报告的测试结果与实际输出一致。
3. **记录到 Execute Log**——追加步骤结果，包含子 agent 的摘要和 orchestrator 的验证。

此验证是 KEEP 活动——不可委托。

### 模式策略

| 模式 | MUST_DELEGATE | DELEGATABLE |
| :--- | :--- | :--- |
| standard | 强制 | 默认委托（上下文负载高、产物要求多） |
| lite | 强制 | 可选（上下文量大或角色分离需要时委托） |
| micro | 不适用（跳过 Research Gate，内联 Challenge） | 默认内联 |

完整的协议细节和 Brief Schema 模式见 `protocols/subagent-dispatch.md`。

## 六、两层方法论与方法论路由

> 本章回答：执行质量方法和设计方法如何按任务风险选用，而不是把所有方法论堆到每个任务上。

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

> 本章回答：每条公开命令用来做什么；精确参数仍以命令自身的 `--help` 输出为准。

| 命令 | 作用 |
| :--- | :--- |
| `sdd init` | 初始化目录、配置和 AI 指令。 |
| `sdd discover` | 创建 Spec 与 Execute Log；standard/lite 另建独立 Design，micro 不创建独立 Design。 |
| `sdd autonomy` | 检查或受控变更任务自治模式、授权、Plan activation 与 Gate 记录；完整子命令见 [AUTONOMY_MODE](#autonomy_mode)。 |
| `sdd resume` | 输出当前任务和阶段提示。 |
| `sdd status` | 检查目录结构、Spec、Design、Execute Log 健康度。 |
| `sdd doctor` | 检查 Skill、协议引用、集成触点与安装覆盖。 |
| `sdd next` | 输出当前 workflow 状态、下一步和回跳目标。 |
| `sdd visual` | 发现、选择、创建和检查视觉上下文合同；完整边界见 [Visual Context Guidance](#visual-context-guidance按需)。 |
| `sdd challenge` | 生成独立对抗评审 Prompt，或受控记录 reviewer 结果。 |
| `sdd cruise` | 生成巡航控制 Prompt；支持 `--driver`、`--emit-claude-prompt`、`--record-run` 和 `--iteration`，但不直接调用模型或执行循环。 |
| `sdd console` | 启动本地只读 Web Console，查看全项目 Spec 态势、Profile / Quality 摘要、Verification 证据和归档门禁。 |
| `sdd install-skill` | 把当前包内的完整 Skill（含 `templates` / `protocols` / `vendored`）注册到 agent 环境（`--target codex\|cc-switch\|claude\|opencode\|all [--clean]`）。 |
| `sdd validate` | 机器校验活动任务门禁与归档就绪条件。 |
| `sdd archive` | 经本次明确人工授权后归档 Spec 及引用产物。 |
| `sdd reopen` | 基于归档任务的缺陷创建新修复 Spec 和 Execute Log。 |
| `sdd new-learning` | 创建并绑定 Learning Record。 |
| `sdd review-execute` | 生成四轴 Execute 自查 Prompt。 |
| `sdd learnings` | 查看项目 Learning，或按 Spec 召回相关规则。 |
| `sdd codemap` | 按需扫描源码并输出架构视图（不持久化，永不过时）。 |
| `sdd debug` | 生成根因分析 Prompt。 |
| `sdd verify` | 初始化具名 Provider、运行 E2E 或受控视觉验证；完整边界见 [Verification Provider](#verification-provider)。 |
| `sdd quality` | 生成基于 AC、精确 Profile 与既有 e2e readiness 的临时只读质量策略投影；当前子命令为 `sdd quality plan`。 |
| `sdd profile` | 只读检测、复核、确认、展示或检查 Project Engineering Profile；完整边界见 [Project Engineering Profile](#project-engineering-profile)。 |

安装后使用 `sdd` 命令执行所有操作。`next` / `cruise` / `challenge` 的输出已包含 `DESIGN_METHOD` / `DESIGN_FOCUS_FIELDS` 方法论路由建议（见第三、六节）。

## 八、Web Console

> 本章回答：Console 可以安全展示哪些状态和证据，以及它为什么不能替代 Agent 执行、验证或批准。

`sdd console [project-dir]` 会启动一个本地只读控制台。首屏优先展示全项目 Spec 的总量与态势板；每行固定显示 Lifecycle、Current Phase、派生 Work State 和更新时间。选择 Spec 后，详情再展示 Project Profile、Quality Plan、既有 Verification、Design / Execute Log / Learning 引用健康度和 `validate --archive-ready` 门禁问题。`project-dir` 可选；不传时在页面里输入或加载项目目录。

Web Console 是文件系统产物的 projection，不是新的 source of truth：

- 数据来源仍然是 `<docs-root>/specs/`、`<docs-root>/design/`、`<docs-root>/logs/`、`<docs-root>/learnings/`、`<docs-root>/runs/`、`<docs-root>/archive/`。
- 项目看板和 Spec 列表读取后台内存索引快照；首次加载或刷新时可能短暂显示 indexing，再自动更新。
- 阶段由最早未满足门禁推导：Research、Innovate、Design、Acceptance、Plan、Execute、Learning、Ready、Archived。
- Lifecycle（`draft | archived`）、Current Phase 和 Work State 是三层不同语义。Work State 仅是基于既有 workflow facts 的只读摘要：`Needs repair` 必须有显式失败的 Challenge verdict；普通尚未到达的 Gate 或 archive validation issue 仍是 `In progress`，不能被汇总成“Blocked Gates”。
- 项目 Profile 只读取 `profiles/current.json` 与其 immutable revision，安全显示 `confirmed` / `missing` / `invalid`、revision / digest、unit 数量和 unit id / roles。它不跑 drift detector，也不显示 sourceSnapshot、evidence、manifest、commandRefs、confirmation 或原始错误。
- Quality Plan 只对选中的活动 Spec 计算，且只使用该 Spec 固定的 exact `project-profile-revision` / `project-profile-digest` / `affected-units`；不得回退到 current Profile。归档 Spec 的 Quality 状态为 `not_applicable`。它只展示白名单的 AC、policy focus、AC mapping、E2E readiness 与脱敏诊断，始终是说明性派生物，不拥有新的通过/失败、Plan、下一步或归档指令。
- Profile、Quality 与 Verification 都由服务端只读投影；Console 不调用 `profile` / `quality` / `verify` CLI，不确认 Profile、不执行 Provider、不安装依赖或启动浏览器。
- 窄屏时，态势板、Quality / Verification 表格只在各自区域横向滚动，页面本身不产生横向溢出。
- 详情页展示 effective autonomy mode/source、authorization state、scope/risk/Plan digests、authorized actors、stop reason、challenge verdict 和 backtrack target。
- 详情页展示最新 cruise run 的 iteration、driver 和 stop reason。
- 完整归档校验只在详情页和 Validate 操作中按需执行，避免看板和列表加载被全量校验阻塞。
- 当前版本只读展示和校验，不直接编辑 Spec、Design、Execute Log 或 Learning；Edit 按钮只调用本机默认程序打开文件。
- 后续如加入 archive / reopen / discover 操作，也应调用现有命令，而不是在 Web 层直接改文件。

## 九、FAQ

> 本章回答：几个最常见的边界问题，包括 Plan 与 Design、独立 Execute Log、Spec 真相源和 CodeMap 的关系。

### Plan 能替代技术设计吗？

不能。Design 解释为什么这样做、有哪些边界和取舍；Plan 只说明怎么按步骤执行。standard/lite 缺少 Design 时，`validate --archive-ready` 会阻止归档。

### Execute Log 为什么独立？

执行日志是事实记录，和 Spec 的规范性内容性质不同。独立后 Challenge 可以检查”计划、实现、日志”三者是否一致，Archive 也能保留完整审计链。

### Spec 还是单一真相源吗？

Spec 是控制面真相源。完整任务真相由 Spec 引用的 Design、Execute Log、Learning 等共同构成。Challenge 和 Archive 必须沿引用读取，而不是只读 Spec 文件本身。

### 什么时候用 CodeMap？

CodeMap 是按需计算视图（`sdd codemap <dir>`），不持久化、永不过时。在 Research 阶段需要架构概览时运行一次即可。架构事实变更应记录到 Learning Record。
## Project Engineering Profile

- **触发事实：** 接手已有工程时缺少可靠工程事实、Spec 已绑定精确 Profile revision，或需要检查已确认画像的漂移。（Trigger Fact: engineering facts are missing, bound to a Spec, or may have drifted.）
- **Agent 动作：** 主动执行只读 detect/review/show/check，Research 始终读取 Spec 指向的 exact revision；不执行 `commandRefs`，不联网、不安装依赖。（Agent Action: collect and read exact profile evidence without executing project commands.）
- **人工门禁：** `sdd profile confirm` 前必须针对 review 输出的精确 digest 取得当前用户明确授权，Agent 不得自行确认或替换 revision。（Human Gate: exact-digest confirmation requires explicit current-user authorization.）
- **相关 CLI：** `sdd profile detect|review|confirm|show|check`；创建任务时以 `sdd discover --unit ...` 绑定影响单元。（CLI: use the profile group and bind affected units at discovery.）

> 本章回答：怎样只读识别已有工程、如何确认精确画像，以及 Profile 为什么不能执行项目命令或自动安装能力。

Project Engineering Profile 是项目级、可版本化的工程事实层，不是新的前端/后端工作流模式。一个仓库可包含多个 workspace unit；同一 unit 也可同时具有 `frontend`、`backend`、`contract`、`library`、`tool` 或 `unknown` roles。检测结果始终携带 evidence 和 confidence，未知事实保持 unknown。

### 已有项目

1. 运行 `sdd profile detect <dir> --format json` 并把 stdout 保存为项目内候选 JSON。
2. 按需修正候选；人工补充的分类使用 `confidence: human` evidence。
3. 运行 `sdd profile review <dir> --candidate <file> --format json`，取得规范化后的精确 digest。
4. Agent 暂停并向当前用户请求对该精确 digest 的明确授权。
5. 获得授权后运行 `sdd profile confirm ...`。`human:<name>` 与 evidence 是可审计声明，不提供 CLI 身份认证。
6. 创建任务时用 `sdd discover ... --unit <id...>`；保留值 `project` 表示 SDD 自身或仓库整体范围。

Spec 会固定 `project-profile-revision`、`project-profile-digest`、`affected-units`。Research 必须读取 Spec 指向的 exact revision，不能改读 `profiles/current.json`。跨多个 unit 只产生 `cross-unit` advisory，提醒检查 Interface Contract 和 Compatibility，不自动改变 mode。

### 新项目

`sdd init` 只创建 `profiles/revisions/.gitkeep`，不会运行 detector 或确认 Profile。空目录执行 detect 返回 empty 与 `create_bootstrap_spec`；先用 standard bootstrap Spec 记录产品意图，待 manifest 等工程事实出现后再 detect/review/confirm。

### 漂移与恢复

`sdd profile show` 校验并展示 current 或指定 revision；`sdd profile check` 重新只读检测，区分 clean、drifted、missing、invalid，并保留有效的 human evidence。它不自动 confirm、覆盖 current 或删除历史 revision。

confirm 使用 `.sdd-project-profile.lock` 覆盖读取、复核、写 revision、切换 current 与解锁。锁冲突立即返回 `SDD_PROFILE_CONFIRM_LOCKED`。不要按锁年龄自动清理；持续锁定时，先确认没有活动 confirm，再人工删除空锁目录。`SDD_PROFILE_CONFIRM_UNLOCK_FAILED` 表示 current/revision 可能已提交，应先检查制品再决定是否重试。

Profile 中的 `commandRefs` 只是名称引用。所有 profile 命令均不得执行工程脚本、联网、安装依赖、生成应用或自动创建 Provider；v3.4 的领域命令不提供 Profile 编辑或确认 UI。v3.6 仅在 Console 中增加 current Profile 的安全只读摘要，仍不提供 Frontend/Backend Quality Profile 或框架专属 runner。

## Quality Policy Routing

- **触发事实：** Design / Acceptance / Plan 需要把既有 AC、精确 Profile 与已有 E2E readiness 映射为测试证据建议。（Trigger Fact: acceptance work needs an evidence-capability routing projection.）
- **Agent 动作：** 主动生成临时只读 Quality Plan，解释 gaps 与 diagnostics；不创建第二套验收状态，不写回任何制品，也不运行 Provider。（Agent Action: project read-only quality guidance from current authoritative facts.）
- **人工门禁：** Quality 输出本身没有新增门禁；若建议要求修改 AC、Acceptance 或 Plan，必须回到对应制品并重新满足既有 Plan/范围/风险人工门禁。（Human Gate: contract changes use the existing acceptance, Plan, scope, and risk gates.）
- **相关 CLI：** `sdd quality plan <project-dir> [--spec ... | --name ...] [--format text|json]`。（CLI: generate the read-only quality projection.）

> 本章回答：Quality Plan 读取什么、输出什么、怎样处理路径和 Profile 绑定，以及为什么它不形成第二套验收门禁。

`sdd quality plan <project-dir> [--spec <path> | --name <slug>] [--format text|json]` 是显式、只读、临时的解释命令。它不创建 Quality Plan 文件，也不写回 Spec、Profile、Provider、Run 或业务工程；每次只根据当次读取到的输入生成投影。

AC 是唯一验收真相。Quality Plan 只读地说明“已存在的 AC 使用哪一种 evidence capability”及“已确认工程事实建议关注哪些证据”，不拥有独立的通过/失败、coverage、approval、状态迁移、下一步指令或归档资格。因此它不形成第二套门禁；任何需要改变验收契约的建议，都必须回到 Spec、Acceptance 和 Plan Gate 显式完成。

### 输入与选择

命令沿用现有活动 Spec 的选择规则：

- `--spec <path>` 选择指定 Spec；相对或绝对路径均可，但词法路径和真实路径都必须位于 `<docs-root>/specs` 内；
- `--name <slug>` 选择该任务名的最新 Spec；
- 两者都省略时选择确定性的最新活动 Spec；
- 同时提供两者是 usage error，exit 3。

输入快照由一次安全 Spec 读取构成。外部路径、指向外部文件的符号链接、docs root/specs 目录自身的真实路径逃逸均返回 `spec_path_escape` / exit 2，且命令不会读取其内容；省略 selector 时也会在读取候选 frontmatter 前逐项完成词法与 realpath 校验，任一逃逸候选均 fail-closed。词法 docs root/specs 与其 realpath root 分开判断，所以链接到项目内目标的 docs root/specs 仍是合法输入。Planner 只使用该 Spec 固定的 `project-profile-revision`、`project-profile-digest` 与 `affected-units` 调用精确 revision resolver，绝不读取或回退到 `profiles/current.json`。缺少 Profile 返回 `profile-required`；三项绑定不完整、revision/digest 损坏、未知 unit 或 `project` 与显式 unit 混用会 fail-closed（exit 2）。修复输入后重新执行该只读命令即可。

`affected-units: project` 必须单独出现，并稳定展开为绑定 Profile 的全部 unit；显式 unit 去重但不扩大范围。role 为 `frontend`、`backend`、`contract`、`library`、`tool` 时分别产生技术栈中立的关注点；`unknown` 只产生诊断，不做猜测。只有 `depends-on` relation 两端都在有效范围内才加入跨单元关注点；单端在范围内报告 `related-unit-out-of-scope`，未映射 relation 报告 attention diagnostic。

### 输出与 capability

输出 Schema 为 `schemaVersion: 1`，内建规则目录为 `policyVersion: "1"`。text 和 JSON 都包含 source（精确 Profile 与声明/有效范围）、`acFacts`、`policyFocus`、`acMappings`、可选 `e2eReadiness` 与 diagnostics；数组使用稳定顺序。它不会输出 `PHASE_HINT`、`NEXT_ACTION`、通过/失败或归档资格。

AC 的既有 `Verification` 逐项保持原义，并仅映射为一个 evidence capability：

| Verification | capability |
| :--- | :--- |
| `unit` | `unit-evidence` |
| `integration` | `integration-evidence` |
| `e2e` | `e2e-evidence` |
| `manual` | `manual-evidence` |

manual AC 的 `Manual Evidence` 原样保留为事实；Policy Focus 只展示由 role 或 relation 形成的 reason 和建议 capability，绝不宣称已经被 AC 覆盖。

### e2e readiness 与只读边界

只有所有 `Verification: e2e` AC 都绑定 `Provider:` 时，Quality Plan 才调用一次既有 readiness 并原样展示其聚合 `required`、`configured`、`blocked` 或 `ready` 快照。无 e2e、manual-only 或任一 e2e 未绑定 Provider 时，不读取 readiness，也不会把“无 e2e 时的 ready”传播为 Provider 就绪；未绑定路线只报告 gap。特别是 `configured` 仅表示已有配置，不等于 Adapter、浏览器或 workspace 实际可执行。

该命令不会初始化 Provider、安装依赖或运行验证，也不会执行 Profile detect/review/confirm、Provider/Adapter、浏览器、项目脚本或网络调用。唯一允许的既有路径是：当有 fresh e2e Run 时，经既有 readiness 间接复用固定 argv 的本地只读 Git freshness 检查；Quality 模块自身不启动子进程，也不能扩张此例外。

### Exit 语义

- exit 0：形成可审阅投影；Provider 缺失、configured、blocked、unknown role 或 relation gap 作为 diagnostics，不改变 workflow。
- exit 2：无法建立可靠输入或读取既有 freshness，例如 `profile-required`、损坏精确引用、`scope-ambiguous`、未知 unit、Spec 不可读或 `readiness-unavailable`。
- exit 3：用法错误，例如非法 `--format` 或同时提供 `--spec` 与 `--name`。

## Verification Provider

- **触发事实：** 任一 AC 声明 `Verification: e2e` 与 `Provider: <provider-id>`，或获批 fidelity 合同需要独立视觉 Provider 与 Run。（Trigger Fact: an E2E or fidelity AC requires controlled executable evidence.）
- **Agent 动作：** 在获批 Plan 的 Execute 阶段检查 readiness，按显式 Provider 运行验证并记录 Run；只读状态命令不得启动浏览器或自动降级。（Agent Action: check readiness and run only the explicitly configured provider during Execute.）
- **人工门禁：** Provider 配置写入、依赖或浏览器安装及平台权限须由用户明确允许；E2E `SKIPPED` 必须有人类批准，视觉 baseline 的创建/更新/批准也始终由人完成。（Human Gate: configuration, installation/permission, skips, and baselines require human decisions.）
- **相关 CLI：** `sdd verify init`、`sdd verify run --spec <spec>`、`sdd verify visual <dir> --spec <spec>`；readiness 由 `sdd next|status|validate` 与 Console 只读投影。（CLI: initialize or run the named provider explicitly.）

> 本章回答：E2E 与视觉验证怎样引用受控 Provider、何时产生独立 Run，以及哪些动态输入和自动安装行为被禁止。

当 AC 使用 `Verification: e2e` 时必须声明 `Provider: <provider-id>`。Provider 只包含 `adapter`、`workspaceRoot`、`packageRoot`、`config`、`projects` 等项目参数；transport、command、CLI 路径和浏览器 executable 由已注册 Adapter 决定，不能写入项目配置。

在获批 Plan 的 Execute 阶段运行 `sdd verify init` 创建 Provider，再显式运行 `sdd verify run --spec <spec>`。`next`、`status`、`validate` 与 Console 只读计算 required/configured/ready/blocked，不启动浏览器。缺少 Playwright 或匹配浏览器时会给出诊断并阻断，不自动安装、不自动降级。支持受 lockfile 管理的 npm/pnpm/Yarn node_modules workspace/hoist，不支持 Yarn PnP。

`verify init` 只使用项目级 `.sdd-verification.json.lock`，并在持锁期间完成共享配置的读取、修改、校验、临时文件写入和原子替换。同一项目不支持并发 init：锁已存在时立即返回 `SDD_VERIFY_INIT_LOCKED` / exit 2，不等待、不合并、不自动重试；调用者应稍后重试。若持续锁定，先确认没有仍在运行的 `verify init`，再人工删除项目根目录中的空锁目录并重试；不得仅按锁目录时间自动清理。若返回 `SDD_VERIFY_INIT_UNLOCK_FAILED`，配置可能已经写入，应先检查 `.sdd-verification.json` 再决定是否重试。

`playwright-test` 继续只服务 `Verification: e2e`；`playwright-visual` 是独立 Provider。对于审批完成的 fidelity 合同，只能在 Plan 获批后的 Execute 阶段显式运行：先以 `sdd verify init` 配置 `playwright-visual`，再在项目根目录维护静态 `sdd.visual.config.json`；Provider 的 scenario mapping 必须是静态且 project-local（项目内）的，每个合同 scenario id 精确映射到一个项目内 `testFile`、`testTitle`、Playwright project、有限阈值与可选静态 masks。每个 mask 都是像素矩形 `{x,y,width,height}`，用于从 diff 分母和差异图中排除动态区域；不支持 CSS 选择器或运行时表达式。随后显式运行 `sdd verify visual <dir> --spec <spec>`。命令不接受 URL、命令、选择器、阈值、掩码或环境变量透传；Reporter 只接受绑定场景的一张 PNG current screenshot，读取当前 Spec Context 中人工批准的 baseline，并要求两张 PNG 的像素宽度和高度分别完全一致，再生成 current/diff 附件并原子写入 `mydocs/runs/visual/`。Visual Run 会校验 Provider、adapter、package/lockfile、Playwright config、合同、基线与代码状态；任一变化都会将旧结果标为 stale。若执行改动了工作树，仍写入带稳定诊断的 BLOCKED Run，但不会保存 current/diff 附件。baseline 的创建、更新和批准始终由人完成。Figma MCP、Custom Adapter、统一 MCP Profile、accessibility 和 performance 接入仍延后。
