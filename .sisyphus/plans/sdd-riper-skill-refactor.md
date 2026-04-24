# SDD-RIPER SKILL.md 架构重构

## TL;DR

> **Quick Summary**: 将 `SKILL.md` 从补丁式单文件重构为 6-Block 架构，核心变化是新增共享子流程层（Sub-flow A/B），消除 Setup/Workflow Mode 间的逻辑重复，统一路径变量，补充跨平台兼容，压缩冗余文档层。
>
> **Deliverables**:
> - 重构后的 `C:/Users/liuyl/.config/opencode/skills/sdd-riper/SKILL.md`（~299行，6-Block 结构）
>
> **Estimated Effort**: Short  
> **Parallel Execution**: YES - 2 waves  
> **Critical Path**: T1 → T3 → T4 → T5 → T7（组装验证）

---

## Context

### Original Request
检查 sdd-riper skill 的优化空间，发现 5 类架构问题后，确定整体重构方案而非补丁修复。

### 核心约束（行为不变清单）
以下内容**语义不变**，只允许做 `PROJECT_DIR` 变量名替换：
- `## Mode Selection` 的 A/B 门禁文本和行为
- `## Research/Innovate/Plan/Execute/Review/Archive Phase Instructions` 的主流程逻辑
- 所有 `AskUserQuestion` 触发点和 Human Gate 位置
- 命令集合、命令参数语义、退出码定义

### 禁止事项（Guardrails）
- 不新增 mode、phase、命令、helper 层级
- 不修改命令触发条件或参数语义
- Sub-flow 只允许新增 2 个（A: Context Bundle 加载，B: Spec 版本检测）
- 不扩展到 README 或其他文件
- 不把跨平台 preamble 扩展成完整的环境管理框架

### 路径信息
- **目标文件（活跃）**: `C:/Users/liuyl/.config/opencode/skills/sdd-riper/SKILL.md`
- **备份（今日）**: `C:/Users/liuyl/.config/opencode/skills/sdd-riper.bak-20260423-142348/SKILL.md`
- 两个文件内容相同（334行），可安全覆盖活跃版本

### 旧路径变量去留策略
| 旧变量 | 新变量 | 处理方式 |
|--------|--------|---------|
| `$_PROJECT_ROOT` | `PROJECT_DIR` | 全部替换 |
| `$TARGET_DIR` | `PROJECT_DIR` | 全部替换（Setup Mode 中用户指定目录时直接覆盖 PROJECT_DIR） |
| `$SDD_ROOT` | `SDD_ROOT` | 保留（其含义独立，不与项目路径混淆） |

---

## Work Objectives

### Core Objective
重写 `SKILL.md` 为 6-Block 架构，消除结构性缺陷，保持全部行为语义不变。

### Concrete Deliverables
- `C:/Users/liuyl/.config/opencode/skills/sdd-riper/SKILL.md`：6-Block 结构，~299行

### Definition of Done
- [ ] 新文件包含且仅包含 7 个 Block 标题（BLOCK 0–6），顺序正确
- [ ] `grep "PROJECT_DIR"` 命中数 > 0，`grep "_PROJECT_ROOT\|TARGET_DIR"` 命中数 = 0
- [ ] BLOCK 3 / BLOCK 4 中不再出现内联的 Context Bundle 检测逻辑，改为调用 Sub-flow A/B
- [ ] BLOCK 5 中 Phase Instructions 主体与原文语义等价
- [ ] BLOCK 6 为纯签名表（无长段解释性段落）
- [ ] 新文件行数 ≤ 330 行

### Must Have
- BLOCK 0: bash 检测 + 单一 `PROJECT_DIR` + `BASH_OK: no` 时的明确提示
- BLOCK 2: Sub-flow A（Context Bundle 加载）+ Sub-flow B（Spec 版本检测与确认）
- BLOCK 3/4: 显式调用 `→ 执行 Sub-flow A` / `→ 执行 Sub-flow B`，移除内联重复
- BLOCK 5: 新增 Completion Status 输出规则（三阶段输出渠道表 + execute.log 追加格式）
- BLOCK 6: 纯签名表（命令名、签名、必填、可选），保留产出物命名规则

### Must NOT Have
- 任何形式的 `$_PROJECT_ROOT` 或 `$TARGET_DIR` 变量引用
- BLOCK 3 或 BLOCK 4 中内联的 Context Bundle 检测逻辑（必须通过 Sub-flow A 引用）
- BLOCK 3 或 BLOCK 4 中内联的 Spec 版本检测逻辑（必须通过 Sub-flow B 引用）
- BLOCK 6 中出现的 "AI 行为"、"触发时机" 等行为描述段落
- 任何新增的 mode、phase 或命令
- Sub-flow 数量超过 2 个

---

## Verification Strategy

### Test Decision
- **Automated tests**: None（Markdown 文件，无运行时测试）
- **Agent-Executed QA**: 每个 Task 包含 Grep/Read 验证场景

### QA Policy
每个 Task 结束后，执行对应验收场景，证据以注释形式记录在 execute.log。

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (可并行启动):
├── T1: BLOCK 0 重写（Preamble，独立）
└── T2: BLOCK 2 新增（Sub-flow A/B，独立）

Wave 2 (依赖 T2):
├── T3: BLOCK 3 重写（Setup Mode，依赖 T2 的 Sub-flow 定义）
└── T4: BLOCK 4 重写（Workflow Mode，依赖 T2 的 Sub-flow 定义）

Wave 3 (独立):
├── T5: BLOCK 5 更新（Phase Instructions，追加 Completion Status 规则）
└── T6: BLOCK 6 压缩（Command Reference，独立）

Wave FINAL:
└── T7: 组装全文件 + 结构验证
```

### Dependency Matrix
- T1: 无依赖 → T7
- T2: 无依赖 → T3, T4
- T3: T2 → T7
- T4: T2 → T7
- T5: 无依赖 → T7
- T6: 无依赖 → T7
- T7: T1, T2, T3, T4, T5, T6

### Agent Dispatch Summary
- Wave 1: T1 → `quick`, T2 → `quick`
- Wave 2: T3 → `quick`, T4 → `quick`
- Wave 3: T5 → `quick`, T6 → `quick`
- Final: T7 → `unspecified-high`

---

## TODOs

- [x] 1. 重写 BLOCK 0 — 跨平台 Preamble

  **What to do**:
  替换原 preamble bash 脚本（原文第 19–30 行），新内容：
  ```bash
  # Step 1: 检测 bash 是否可用
  _BASH_OK=$(bash --version 2>/dev/null && echo "yes" || echo "no")

  # Step 2: 解析 PROJECT_DIR（统一替换 $_PROJECT_ROOT）
  PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

  # Step 3: 解析 SDD_ROOT
  SDD_ROOT="${CLAUDE_SKILL_DIR:-}"
  [ -d "$PROJECT_DIR/.agents/skills/sdd-riper" ] && SDD_ROOT="$PROJECT_DIR/.agents/skills/sdd-riper"
  SDD_ROOT="${SDD_ROOT:-$(cd "$(dirname "$0")" 2>/dev/null && pwd || pwd)}"

  # Step 4: 检测初始化状态
  STATE=$([ -d "$PROJECT_DIR/mydocs" ] && echo "initialized" || echo "not_initialized")

  echo "BASH_OK: $_BASH_OK"
  echo "PROJECT_DIR: $PROJECT_DIR"
  echo "SDD_ROOT: $SDD_ROOT"
  echo "STATE: $STATE"
  ```

  替换原 PATH SUBSTITUTION RULE（原文第 32–43 行），精简为：
  - 保留"隔离 shell"说明
  - 变量从两个（SDD_ROOT + PROJECT_ROOT）改为两个（SDD_ROOT + PROJECT_DIR），并更新示例
  - 新增 `BASH_OK: no` 分支说明：若输出 no，向用户说明需要 Git Bash / sdd.ps1，并终止本次 skill 执行

  将 Mode Selection 部分的 `{HAS_SDD=yes/no}` 改为 `{STATE=initialized/not_initialized}`。

  **Must NOT do**:
  - 不得引入除 `SDD_ROOT` 和 `PROJECT_DIR` 之外的第三个路径变量
  - 不得把 bash 检测扩展为完整的多平台 shell 适配框架
  - 不得修改 Mode Selection 的 A/B 选项文本

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1（与 T2 并行）
  - **Blocks**: T7
  - **Blocked By**: None

  **References**:
  - 原文 BLOCK 0 范围：`C:/Users/liuyl/.config/opencode/skills/sdd-riper/SKILL.md` 第 19–57 行
  - 原 PATH SUBSTITUTION RULE 示例（第 41–42 行）：更新路径变量名即可，格式保留

  **Acceptance Criteria**:

  ```
  Scenario: BASH_OK 检测输出存在
    Tool: Bash (grep)
    Steps:
      1. grep "BASH_OK" target SKILL.md
    Expected Result: 命中 ≥1 行
    Evidence: 终端输出

  Scenario: 旧变量名消失
    Tool: Bash (grep)
    Steps:
      1. grep "_BASH_OK\|_PROJECT_ROOT\|HAS_SDD" target SKILL.md
         （注：_BASH_OK 是脚本内部中间变量，可保留；重点检查 _PROJECT_ROOT 和 HAS_SDD）
    Expected Result: _PROJECT_ROOT 命中数 = 0，HAS_SDD 命中数 = 0
    Evidence: 终端输出

  Scenario: STATE 变量替换 HAS_SDD
    Tool: Grep
    Steps:
      1. grep "STATE" target SKILL.md
    Expected Result: 命中 ≥2 行（定义处 + Mode Selection 引用处）
    Evidence: 终端输出
  ```

  **Commit**: NO（与 T2–T6 合并到 T7 统一 commit）

- [x] 2. 新增 BLOCK 2 — Shared Sub-flows

  **What to do**:
  在 BLOCK 1（Mode Selection）之后、BLOCK 3（Setup Mode）之前，插入新章节 `## BLOCK 2 — Shared Sub-flows`，包含：

  **Sub-flow A: Context Bundle 加载**
  ```
  调用方：Setup Mode Step 5b、Workflow Mode Step 3a
  输入：PROJECT_DIR
  输出：CONTEXT_PATH（空字符串表示无可用 context）

  Step 1：检查 PROJECT_DIR/mydocs/archive/ 是否存在 .md 文件（排除 .gitkeep）
    → 有文件：
        运行：bash "$SDD_ROOT/sdd.sh" build-context-bundle "$PROJECT_DIR"
        解析输出中的 SDD_OUTPUT_PATH → CONTEXT_PATH
        按输出的 AI 指令读取源文件，用 Write 工具写入 context bundle
        若命令失败：CONTEXT_PATH="" 并继续
    → 无文件：进入 Step 2

  Step 2：检查 PROJECT_DIR/mydocs/context/ 是否存在 .md 文件（排除 .gitkeep）
    → 有文件：CONTEXT_PATH = 该目录中最近修改的 .md 文件路径
    → 无文件：CONTEXT_PATH=""

  输出：CONTEXT_PATH
  用法：若 CONTEXT_PATH 非空，后续 discover 命令追加 --context "$CONTEXT_PATH"
  ```

  **Sub-flow B: Spec 版本检测与确认**
  ```
  调用方：Setup Mode Step 5c、Workflow Mode Step 3c
  输入：PROJECT_DIR、TASK_NAME
  输出：SPEC_VERSION（如 v1.0、v1.2）

  Step 1：扫描 PROJECT_DIR/mydocs/specs/ 中匹配 *-{TASK_NAME}.md 的文件
    → 无匹配：proposed_version = "v1.0"
    → 有匹配：提取最高版本号 vN.M，proposed_version = "v{N}.{M+1}"
      （v1.9 → v1.10，不进位）

  Step 2：输出以下文本后立即结束本轮：
  ---
  即将创建 Spec：v{N.M}-{TASK_NAME}.md
  如需修改版本号，请输入（格式 vN.M，如 v2.0）；否则直接回复"继续"。
  ---
  ⚠️ HUMAN GATE — 结束本轮，等待用户回复。

  Step 3：处理用户回复
    → 匹配 v\d+\.\d+：SPEC_VERSION = 用户输入
    → 其他任何内容（含"继续"）：SPEC_VERSION = proposed_version

  输出：SPEC_VERSION
  ```

  **Must NOT do**:
  - 不得新增第三个 Sub-flow
  - Sub-flow 内部不得新增 Human Gate（Sub-flow B 的 HUMAN GATE 是原有逻辑的提取，不是新增）
  - 不得改变 Context Bundle 的文件命名规则或构建逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1（与 T1 并行）
  - **Blocks**: T3, T4
  - **Blocked By**: None

  **References**:
  - 原 Context Bundle 逻辑（Setup Mode）：原文第 89–98 行
  - 原 Context Bundle 逻辑（Workflow Mode）：原文第 117–119 行
  - 原 Spec 版本检测逻辑（Setup Mode）：原文第 100–109 行
  - 原 Spec 版本检测逻辑（Workflow Mode）：原文第 128–137 行

  **Acceptance Criteria**:

  ```
  Scenario: Sub-flow A 定义存在
    Tool: Grep
    Steps:
      1. grep "Sub-flow A" target SKILL.md
    Expected Result: 命中 ≥3 行（标题定义 + BLOCK 3 引用 + BLOCK 4 引用）
    Evidence: 终端输出

  Scenario: Sub-flow B 定义存在
    Tool: Grep
    Steps:
      1. grep "Sub-flow B" target SKILL.md
    Expected Result: 命中 ≥3 行（标题定义 + BLOCK 3 引用 + BLOCK 4 引用）
    Evidence: 终端输出

  Scenario: BLOCK 2 标题位于正确位置
    Tool: Read
    Steps:
      1. 读取 SKILL.md，检查 ## BLOCK 2 出现在 ## BLOCK 1 之后、## BLOCK 3 之前
    Expected Result: 顺序正确
    Evidence: 终端输出
  ```

  **Commit**: NO

- [x] 3. 重写 BLOCK 3 — Setup Mode

  **What to do**:
  替换原 `## Setup Mode (if A selected)` 章节（原文第 59–111 行），重写为以下结构（Step 编号与原文对应）：

  ```
  > ⚠️ SYSTEM DIRECTIVE：禁止使用 TodoWrite。每个 AskUserQuestion 后必须停止等待，不得预判下一步。

  Step 1：AskUserQuestion
    问：目标目录（默认：{PROJECT_DIR}）和模式（standard 或 lite）？
    ⚠️ HUMAN GATE

  Step 2：用户回复后
    若用户指定了目录：PROJECT_DIR = 用户指定目录（覆盖 preamble 值）
    运行：bash "$SDD_ROOT/sdd.sh" init "$PROJECT_DIR" --mode <mode>
    展示创建的文件列表

  Step 3：CodeMap 引导（条件触发，两个条件同时满足才触发）
    条件1：init 输出中包含 [SDD-RIPER]
    条件2：PROJECT_DIR/mydocs/codemap/ 中无 .md 文件（排除 .gitkeep）
    → 触发时：AskUserQuestion
        "检测到目标项目已有较多源码文件，尚未建立 CodeMap。
         是否现在建立？（可选）模块名称（留空扫描整个项目）:___
         A) 是  B) 否"
        ⚠️ HUMAN GATE
        → A：运行 bash "$SDD_ROOT/sdd.sh" create-codemap "$PROJECT_DIR" [--module <name>]
             展示命令输出。若失败，说明错误并继续
        → B：继续
    → 未触发时：直接进入 Step 4

  Step 4：AskUserQuestion："是否现在创建首个 Spec？"
    ⚠️ HUMAN GATE
    → 否：进入 Step 6
    → 是：进入 Step 5

  Step 5：创建首个 Spec
    5a. AskUserQuestion：task name（kebab-case）、requirement、goal、constraints（可选）
        ⚠️ HUMAN GATE（若用户提供少于 4 项，补问缺失项，不得推断或跳过）
    5b. → 执行 Sub-flow A（PROJECT_DIR）→ 获得 CONTEXT_PATH
    5c. → 执行 Sub-flow B（PROJECT_DIR, TASK_NAME）→ 获得 SPEC_VERSION
        ⚠️ HUMAN GATE（Sub-flow B 内部）
    5d. 运行：
        bash "$SDD_ROOT/sdd.sh" discover "$PROJECT_DIR" \
          --task-name "<name>" --requirement "<req>" \
          --goal "<goal>" --constraints "<constraints>" \
          --version "<SPEC_VERSION>" [--context "<CONTEXT_PATH>"]
    5e. 读取 ## SPEC CREATION PROMPT 输出和创建的 Spec 文件
        帮助填写 Research Findings 和初始 Open Questions

  Step 6：提示用户
    "初始化完成。再次运行 /sdd-riper 进入 Workflow Mode 开始任务。"
  ```

  **Must NOT do**:
  - 不得内联任何 Context Bundle 检测逻辑（必须通过 `→ 执行 Sub-flow A` 调用）
  - 不得内联任何 Spec 版本检测逻辑（必须通过 `→ 执行 Sub-flow B` 调用）
  - 不得修改 CodeMap 引导的触发条件或 AskUserQuestion 文本语义

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T4 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: T7
  - **Blocked By**: T2

  **References**:
  - 原 Setup Mode（原文第 59–111 行）：提取结构，移除内联逻辑
  - Sub-flow A 定义：BLOCK 2（T2 产出）
  - Sub-flow B 定义：BLOCK 2（T2 产出）

  **Acceptance Criteria**:

  ```
  Scenario: BLOCK 3 不含内联 Context Bundle 逻辑
    Tool: Grep
    Steps:
      1. 在 SKILL.md 的 BLOCK 3 范围内 grep "build-context-bundle"
    Expected Result: 命中数 = 0（该命令只应出现在 BLOCK 2 Sub-flow A 中）
    Evidence: 终端输出

  Scenario: BLOCK 3 显式调用 Sub-flow A 和 Sub-flow B
    Tool: Grep
    Steps:
      1. grep "Sub-flow A\|Sub-flow B" target SKILL.md（限 BLOCK 3 范围）
    Expected Result: 各命中 ≥1 行
    Evidence: 终端输出
  ```

  **Commit**: NO

- [x] 4. 重写 BLOCK 4 — Workflow Mode

  **What to do**:
  替换原 `## Workflow Mode (if B selected)` 章节（原文第 113–174 行），重写为以下结构：

  ```
  Step 1：运行 bash "$SDD_ROOT/sdd.sh" resume "$PROJECT_DIR"
          读取输出中的 LATEST_SPEC 和 PHASE_HINT

  Step 2：分支判断
    → PHASE_HINT=new_task 或 LATEST_SPEC=none：进入 Step 3
    → 否则（有活跃 Spec）：进入 Step 4

  Step 3：开始新任务
    3a. → 执行 Sub-flow A（PROJECT_DIR）→ 获得 CONTEXT_PATH
    3b. AskUserQuestion：
        "上一个任务已归档，准备开始新任务。
         请提供：task name（kebab-case）、requirement、goal、constraints"
        ⚠️ HUMAN GATE（若用户提供少于 4 项，补问缺失项，不得推断）
    3c. → 执行 Sub-flow B（PROJECT_DIR, TASK_NAME）→ 获得 SPEC_VERSION
        ⚠️ HUMAN GATE（Sub-flow B 内部）
    3d. 运行：
        bash "$SDD_ROOT/sdd.sh" discover "$PROJECT_DIR" \
          --task-name "<name>" --requirement "<req>" \
          --goal "<goal>" --constraints "<constraints>" \
          --version "<SPEC_VERSION>" [--context "<CONTEXT_PATH>"]
    3e. 读取创建的 Spec 文件，帮助填写 Research Findings

  Step 4：加载已有任务上下文
    4a. 用 Read 工具读取 LATEST_SPEC 文件
    4b. 按热/温/冷三层规则加载附加上下文：
        热层（每轮必带）：当前阶段活跃 Spec 区块 + Plan（若已 Approved）
        温层（切阶段时按需）：
          Research → CodeMap（若存在）
          Plan → CodeMap + Innovate Options
          Execute → Plan 全文 + CodeMap
          Review → Plan 全文 + Execute Log
          Archive → Review Summary
        冷层（默认不带）：历史 Spec 全文、archive 文件、其他任务 Spec、context 目录
    4c. Phase Routing：
        → PHASE_HINT ∈ {research, innovate, plan, execute, review, archive}：
            输出："Context loaded: {spec name}，Phase: {PHASE_HINT}，直接进入该阶段。如需切换请告知。"
            立即跳转对应阶段指令，不显示 A-F 菜单
        → PHASE_HINT 为空或未知：
            AskUserQuestion：显示 A-F 阶段菜单
            ⚠️ HUMAN GATE
            跳转用户选择的阶段指令
  ```

  **Must NOT do**:
  - 不得内联任何 Context Bundle 检测逻辑（必须通过 `→ 执行 Sub-flow A` 调用）
  - 不得内联任何 Spec 版本检测逻辑（必须通过 `→ 执行 Sub-flow B` 调用）
  - 热/温/冷三层加载规则内容不得修改

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T3 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: T7
  - **Blocked By**: T2

  **References**:
  - 原 Workflow Mode（原文第 113–174 行）
  - Sub-flow A/B 定义：BLOCK 2（T2 产出）

  **Acceptance Criteria**:

  ```
  Scenario: BLOCK 4 不含内联 Context Bundle 逻辑
    Tool: Grep
    Steps:
      1. 在 SKILL.md 的 BLOCK 4 范围内 grep "build-context-bundle\|mydocs/archive"
    Expected Result: 命中数 = 0
    Evidence: 终端输出

  Scenario: BLOCK 4 显式调用 Sub-flow A 和 Sub-flow B
    Tool: Grep
    Steps:
      1. grep "Sub-flow A\|Sub-flow B" target SKILL.md（限 BLOCK 4 范围）
    Expected Result: 各命中 ≥1 行
    Evidence: 终端输出
  ```

  **Commit**: NO

- [x] 5. 更新 BLOCK 5 — Phase Instructions + Completion Status 规则

  **What to do**:
  保留原 Phase Instructions 章节全部内容（原文第 176–265 行）语义不变，**仅**在原 `## Completion Status Protocol` 章节（原文第 266–271 行）末尾追加：

  ```markdown
  **输出渠道规则**：

  | 状态 | 输出到对话 | 追加 execute.log |
  |------|-----------|-----------------|
  | DONE（Execute 阶段） | ✅ | ✅ |
  | DONE_WITH_CONCERNS（Execute 阶段） | ✅ | ✅ |
  | DONE（其他阶段） | ✅ | ❌ |
  | DONE_WITH_CONCERNS（其他阶段） | ✅ | ❌ |
  | BLOCKED | ✅ | ❌（等待人工介入） |
  | NEEDS_CONTEXT | ✅ | ❌（等待人工介入） |

  **execute.log 追加格式**（仅 Execute 阶段 DONE/DONE_WITH_CONCERNS 时，追加在当前 Step 条目之后）：
  ```
  ---
  Phase End Status: DONE | DONE_WITH_CONCERNS
  Summary: {1-2句话，说明完成了什么、有无偏差}
  Timestamp: {ISO 8601}
  ---
  ```

  **每个阶段结束必须输出状态，不得省略。**
  ```

  同时，将 Phase Instructions 中若有 `$_PROJECT_ROOT` 引用，全部替换为 `PROJECT_DIR`。

  **Must NOT do**:
  - 不得修改任何 Phase 的主流程逻辑
  - 不得修改 phase 完成条件和 Human Gate 位置
  - 不得修改 Archive Phase 步骤和文件填写规则

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 3，与 T6 并行）
  - **Blocks**: T7
  - **Blocked By**: None

  **References**:
  - 原 Phase Instructions：原文第 176–271 行

  **Acceptance Criteria**:

  ```
  Scenario: Completion Status 输出渠道表存在
    Tool: Grep
    Steps:
      1. grep "输出渠道规则\|execute.log 追加格式" target SKILL.md
    Expected Result: 各命中 ≥1 行
    Evidence: 终端输出

  Scenario: Phase Instructions 关键词保留
    Tool: Grep
    Steps:
      1. grep "Plan Approved By\|NEEDS_CONTEXT\|Remaining Risks\|DONE_WITH_CONCERNS" target SKILL.md
    Expected Result: 四个关键词均命中
    Evidence: 终端输出
  ```

  **Commit**: NO

- [x] 6. 压缩 BLOCK 6 — Command Reference Table

  **What to do**:
  替换原"AI 驱动命令"章节（原文第 273–334 行），新章节标题为 `## BLOCK 6 — Command Reference`，内容为：

  **产出物命名规则**（保留原表，格式不变）：
  - 格式说明：`v{N}.{M}-{name}.md`，minor 自动 +1，v1.9→v1.10 不进位

  | 产出物 | 路径 | 示例 |
  |--------|------|------|
  | Spec | mydocs/specs/ | v1.0-user-login.md |
  | CodeMap | mydocs/codemap/ | v1.0-auth.md |
  | Context Bundle | mydocs/context/ | v1.0-context-bundle.md |
  | Archive | mydocs/archive/ | v1.1-user-login-human.md |
  | Evidence | mydocs/evidence/{spec-slug}/ | execute.log |
  | ProjectMap | mydocs/projectmap.md | 单文件，不版本化 |

  **命令签名速查**（11条命令，纯表格）：

  | 命令 | 签名 | 必填 | 可选 |
  |------|------|------|------|
  | init | sdd init \<dir\> | dir | --mode standard\|lite, --force, --docs-dir \<name\> |
  | discover | sdd discover \<dir\> | --task-name | --requirement, --goal, --constraints, --context, --version |
  | resume | sdd resume \<dir\> | dir | — |
  | review-execute | sdd review-execute \<dir\> | dir | --spec \<path\>, --log \<path\> |
  | create-codemap | sdd create-codemap \<dir\> | dir | --module \<name\> |
  | build-context-bundle | sdd build-context-bundle \<dir\> | dir | --out \<name\> |
  | debug | sdd debug \<dir\> | dir | --log \<file\>, --error "\<msg\>" |
  | create-projectmap | sdd create-projectmap \<dir\> | dir | --repos \<r1,r2\>, --force |
  | archive | sdd archive \<dir\> \<spec-name\> | dir, spec-name | --force |
  | new-codemap | sdd new-codemap \<dir\> \<module\> | dir, module | --force |
  | status | sdd status \<dir\> | dir | — |

  **退出码**：`0`=成功 | `1`=缺失必需资产 | `2`=引用损坏 | `3`=参数/环境错误

  **Must NOT do**:
  - 不得添加"AI 行为"、"触发时机"、"典型用法"等行为描述段落
  - 不得修改命令集合（不增不减，共 11 条）
  - 不得删除产出物命名规则部分

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 3，与 T5 并行）
  - **Blocks**: T7
  - **Blocked By**: None

  **References**:
  - 原"AI 驱动命令"章节：原文第 273–334 行

  **Acceptance Criteria**:

  ```
  Scenario: BLOCK 6 无行为描述段落
    Tool: Grep
    Steps:
      1. grep "AI 行为\|触发时机\|典型用法" target SKILL.md
    Expected Result: 命中数 = 0
    Evidence: 终端输出

  Scenario: 命令签名表包含全部 11 条命令
    Tool: Grep
    Steps:
      1. grep "new-codemap\|review-execute\|build-context-bundle" target SKILL.md
    Expected Result: 三个命令均命中（覆盖最易遗漏的命令）
    Evidence: 终端输出
  ```

  **Commit**: NO

- [x] 7. 组装最终 SKILL.md + 全文结构验证

  **What to do**:
  将 T1–T6 的各 Block 内容组装为完整新文件，写入：
  `C:/Users/liuyl/.config/opencode/skills/sdd-riper/SKILL.md`

  **组装顺序**：
  ```
  1. frontmatter（原文第 1–17 行，allowed-tools 保持不变）
  2. BLOCK 0: Preamble（T1 产出）
  3. PATH SUBSTITUTION RULE（T1 精简版）
  4. BLOCK 1: Mode Selection（原文第 44–57 行，仅替换 STATE 变量引用）
  5. BLOCK 2: Shared Sub-flows（T2 产出）
  6. BLOCK 3: Setup Mode（T3 产出）
  7. BLOCK 4: Workflow Mode（T4 产出）
  8. BLOCK 5: Phase Instructions（原文 + T5 追加的输出规则）
  9. BLOCK 6: Command Reference（T6 产出）
  ```

  写入后执行全文验证（参见 Acceptance Criteria）。

  **Must NOT do**:
  - 不得遗漏 frontmatter
  - 不得改变 BLOCK 顺序
  - 不得引入任何原设计之外的新内容

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave FINAL（串行）
  - **Blocks**: F1, F2
  - **Blocked By**: T1, T2, T3, T4, T5, T6

  **References**:
  - 原 frontmatter：原文第 1–17 行
  - 原 BLOCK 1 Mode Selection：原文第 44–57 行
  - 备份文件（对比参考）：`C:/Users/liuyl/.config/opencode/skills/sdd-riper.bak-20260423-142348/SKILL.md`

  **Acceptance Criteria**:

  ```
  Scenario: Block 标题完整且有序（共 7 个）
    Tool: Bash (grep/PowerShell)
    Steps:
      1. grep "^## BLOCK" SKILL.md | 统计行数
    Expected Result: 7 行，内容为 BLOCK 0 至 BLOCK 6，顺序正确
    Evidence: 终端输出

  Scenario: 旧路径变量归零
    Tool: Bash (grep)
    Steps:
      1. grep -c "_PROJECT_ROOT\|HAS_SDD" SKILL.md
    Expected Result: 命中数 = 0
    Evidence: 终端输出

  Scenario: Sub-flow 引用分布正确
    Tool: Bash (grep)
    Steps:
      1. grep -n "Sub-flow A\|Sub-flow B" SKILL.md
    Expected Result: BLOCK 2 各定义 1 次（行号在 BLOCK 2 范围内）
                    BLOCK 3/4 各引用 ≥1 次（行号在对应 BLOCK 范围内）
    Evidence: 终端输出（含行号）

  Scenario: 行数在目标范围内
    Tool: Bash (PowerShell)
    Steps:
      1. (Get-Content SKILL.md).Count
    Expected Result: 结果 ≤ 330
    Evidence: 终端输出
  ```

  **Commit**: YES
  - Message: `refactor(skill): restructure SKILL.md into 6-block architecture`
  - Files: `C:/Users/liuyl/.config/opencode/skills/sdd-riper/SKILL.md`

---

## Final Verification Wave

- [x] F1. **结构完整性验证** — `quick`
  用 Read 读取新 SKILL.md，确认 BLOCK 0–6 标题按序存在（共 7 个）。用 Grep 检查 `_PROJECT_ROOT` 和 `TARGET_DIR` 命中数为 0，`PROJECT_DIR` 命中数 > 5。用 Grep 检查 `Sub-flow A` 和 `Sub-flow B` 各在 BLOCK 2 定义一次，在 BLOCK 3/4 各引用至少一次。
  Output: `Block结构 [7/7] | 旧变量 [0] | Sub-flow引用 [OK] | VERDICT: APPROVE/REJECT`

- [x] F2. **行为保真性验证** — `quick`
  逐段对比新旧文件中 Mode Selection 文本、Phase Instructions 主流程。检查所有 `AskUserQuestion` 位置和 `⚠️ HUMAN GATE` 标记是否保留。检查所有 sdd.sh 命令调用（init/discover/resume/archive等）是否语义不变。
  Output: `Human Gates [N/N保留] | 命令调用 [N/N保留] | 新增内容 [仅允许项] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy
- **1**: `refactor(skill): restructure SKILL.md into 6-block architecture` — SKILL.md

## Success Criteria

### Verification Commands
```bash
# 检查 Block 标题存在
grep -c "^## BLOCK" SKILL.md  # Expected: 7

# 检查旧变量名消失
grep -c "_PROJECT_ROOT\|TARGET_DIR" SKILL.md  # Expected: 0

# 检查 Sub-flow 引用
grep -c "Sub-flow A\|Sub-flow B" SKILL.md  # Expected: ≥6

# 检查行数
wc -l SKILL.md  # Expected: ≤330
```

### Final Checklist
- [ ] 7个 Block 标题按序存在
- [ ] 旧路径变量归零
- [ ] Sub-flow A/B 各定义一次、各引用 ≥1 次
- [ ] BLOCK 5 Phase Instructions 语义与原文等价
- [ ] BLOCK 6 无行为描述段落
- [ ] 行数 ≤ 330
