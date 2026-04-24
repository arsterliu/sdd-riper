# SDD-RIPER 补全计划：P0-P3 全量实现

## TL;DR

> **Quick Summary**: 补全 SDD-RIPER scaffold 与文章理念的全部差距，新增 6 个 AI 驱动命令（shell 脚本输出 Prompt）、热/温/冷上下文分层、bootstrap 升级为首版 Spec 创建器。
>
> **Deliverables**:
> - `bin/review-execute.sh` — 三轴质量筛查 Prompt 生成器（P0）
> - `protocols/` 热/温/冷分层定义 + `SKILL.md` 阶段切换上下文加载规则（P1a）
> - `bin/bootstrap.sh` 升级支持 `--create-spec` 模式（P1b）
> - `bin/create-codemap.sh` — AI 驱动代码库扫描 Prompt 生成器（P2a）
> - `bin/build-context-bundle.sh` — AI 提炼上下文包 Prompt 生成器（P2b）
> - `bin/debug.sh` — 日志驱动 Bug 定位 Prompt 生成器（P3a）
> - `bin/create-projectmap.sh` — AI 驱动 ProjectMap 生成 Prompt 生成器（P3b）
> - `sdd.sh` 新增 7 个 dispatch 条目
> - `SKILL.md` 新增上下文加载规则 + AI 驱动命令注册区
> - `tests/` 7 个对应测试文件
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 → (T2‥T7 并行) → F1‥F4

---

## Context

### Original Request
补全 SDD-RIPER 项目中 P0-P3 全部差距，使其完整对齐文章《SDD-RIPER 团队落地指南》的理念。

### Interview Summary
- **AI 驱动命令形式**：Shell 脚本 + Prompt 模板，脚本 stdout-only（输出结构化 Prompt），AI（SKILL.md）负责实际执行
- **Bootstrap 升级**：`--create-spec` 模式，接收 requirement/context/goal/constraints 参数，生成 Spec 创建 Prompt，AI 填充并写入 spec.md
- **上下文分层落地**：`protocols/` 定义热/温/冷三层，`SKILL.md` 在阶段切换节点注入加载规则
- **多项目三模式**：简化，只需 AI 自动生成 projectmap.md 覆盖项目核心内容，无需三模式

### Metis Review（已整合）
- 所有新命令必须定义明确 CLI 契约（flags / 退出码 / 输出结构）
- Prompt 输出必须有固定标题顺序，测试才能断言结构
- `sdd.sh` 现有命令行为不可改变，unknown-command 处理保持原样
- 大输入（diff / 日志 / 文档）需要截断规则（≤100 行，超出附 TRUNCATED 提示）
- 每个新命令需要 happy-path + failure-path 测试

---

## Work Objectives

### Core Objective
补全 SDD-RIPER scaffold 与文章理念的全部差距，交付 7 个新命令、上下文分层协议、bootstrap 升级，以及对应的 SKILL.md 注册和测试覆盖。

### Concrete Deliverables
- `bin/review-execute.sh`（新建）
- `bin/create-codemap.sh`（新建）
- `bin/build-context-bundle.sh`（新建）
- `bin/debug.sh`（新建）
- `bin/create-projectmap.sh`（新建）
- `bin/bootstrap.sh`（升级，新增 `--create-spec` 模式）
- `sdd.sh`（新增 6 个 dispatch 条目）
- `SKILL.md`（新增"上下文分层"注释 + "AI 驱动命令"区段）
- `protocols/sdd-riper-one.md`（新增热/温/冷定义区块）
- `protocols/sdd-riper-one-light.md`（同步热/温/冷定义）
- `tests/test_review_execute.sh`（新建）
- `tests/test_create_codemap.sh`（新建）
- `tests/test_build_context_bundle.sh`（新建）
- `tests/test_debug.sh`（新建）
- `tests/test_create_projectmap.sh`（新建）
- `tests/test_bootstrap_create_spec.sh`（新建）
- `tests/run_all.sh`（更新，注册所有新测试）

### Definition of Done
- [ ] `bash tests/run_all.sh` 全部通过（含新增测试）
- [ ] `bash sdd.sh review-execute --help` 退出 0
- [ ] `bash sdd.sh create-codemap --help` 退出 0
- [ ] `bash sdd.sh build-context-bundle --help` 退出 0
- [ ] `bash sdd.sh debug --help` 退出 0
- [ ] `bash sdd.sh create-projectmap --help` 退出 0
- [ ] `bash sdd.sh bootstrap <dir> --create-spec --requirement "..." --goal "..."` 退出 0，输出含 `## SPEC CREATION PROMPT` 标题
- [ ] `SKILL.md` 包含 `## 上下文分层加载规则` 区段
- [ ] `SKILL.md` 包含 `## AI 驱动命令` 区段
- [ ] `protocols/sdd-riper-one.md` 包含 `热层` / `温层` / `冷层` 定义

### Must Have
- 所有新 shell 脚本输出固定标题顺序的 Prompt（stdout-only）
- bootstrap `--create-spec` 模式写入 `mydocs/specs/<task-name>.md`（唯一允许文件写入的新脚本）
- 所有新命令在 `sdd.sh` dispatch 中注册
- 所有新命令在 `SKILL.md` "AI 驱动命令" 区段注册

### Must NOT Have（Guardrails）
- `SKILL.md` 禁止任何自动推进 RIPER 阶段的逻辑
- `sdd.sh` 现有命令的 dispatch 逻辑不可修改
- 新脚本禁止写入任何文件（bootstrap `--create-spec` 除外）
- 新脚本禁止调用外部 API 或网络
- Prompt 输出禁止依赖项目内可能不存在的文件（应做存在性检查后条件输出）
- 大输入（diff/log/doc）超过 100 行时必须截断并附 `[TRUNCATED: showed 100/N lines]` 提示

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES（`tests/run_all.sh` + `tests/test_*.sh` 模式）
- **Automated tests**: Tests-after（先实现，后补测试，与现有风格一致）
- **Framework**: 纯 bash（`set -euo pipefail`，pass/fail 计数器模式，与现有测试一致）

### QA Policy
每个任务包含 agent-executed QA 场景。Evidence 保存至 `.sisyphus/evidence/task-{N}-{slug}.txt`。

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — 基础/协议层):
└── T1: 热/温/冷上下文分层 (protocols/ + SKILL.md 阶段切换注释 + AI驱动命令骨架)

Wave 2 (After T1 — 6 个命令并行，每个任务独立文件):
├── T2: review-execute (P0)
├── T3: bootstrap --create-spec 升级 (P1b)
├── T4: create-codemap AI-driven (P2a)
├── T5: build-context-bundle (P2b)
├── T6: debug (P3a)
└── T7: create-projectmap AI-driven (P3b)

Wave FINAL (After ALL — 4 并行审查):
├── F1: Plan Compliance Audit (oracle)
├── F2: Code Quality Review (unspecified-high)
├── F3: Real Manual QA (unspecified-high)
└── F4: Scope Fidelity Check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix
- T1: none → T2, T3, T4, T5, T6, T7
- T2-T7: T1 → F1-F4
- F1-F4: ALL → user okay

### Agent Dispatch Summary
- Wave 1: T1 → `unspecified-high`
- Wave 2: T2,T3,T4,T5,T6,T7 → `unspecified-high` (各自独立)
- FINAL: F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs

- [x] 1. 热/温/冷上下文分层（P1a）

  **What to do**:
  - 在 `protocols/sdd-riper-one.md` 的 `## Pre-Research 阶段与上下文层级` 区块末尾追加 `### 热/温/冷三层加载规则` 区块，定义：
    - **热层（Hot）**：每轮必带——当前阶段的 Spec 区块（仅活跃区块）+ Plan（若已 Approved）
    - **温层（Warm）**：切阶段时按需加载——CodeMap（进 Research/Plan 时）、Execute Log（进 Review 时）、上一阶段产出摘要
    - **冷层（Cold）**：默认不带——历史 Spec 全文、archive 文件、其他任务 Spec、ProjectMap（仅在多仓库任务时升温）
    - 切阶段触发规则：列出每个 RIPER 阶段进入时自动预热的文件
  - 在 `protocols/sdd-riper-one-light.md` 末尾追加同样的 `### 热/温/冷三层加载规则` 精简版（Lite 模式只有热/冷两层，无温层）
  - 在 `SKILL.md` `## Workflow Mode` 的步骤 4（读取 CodeMap/ProjectMap）之后，插入 `### 上下文分层加载规则` 小节，说明 AI 在切换阶段时应如何按热/温/冷规则加载文件，以及给出各阶段进入时的预热清单
  - 在 `SKILL.md` 末尾追加 `## AI 驱动命令` 区段，创建 6 个命令的占位条目（T2-T7 将各自填充）：
    ```
    ## AI 驱动命令
    <!-- T2: review-execute -->
    <!-- T3: bootstrap --create-spec -->
    <!-- T4: create-codemap -->
    <!-- T5: build-context-bundle -->
    <!-- T6: debug -->
    <!-- T7: create-projectmap -->
    ```

  **Must NOT do**:
  - 不得修改 `SKILL.md` 中现有任何 RIPER 阶段的指令内容
  - 不得在热/温/冷规则中加入"AI 自动推进阶段"的逻辑
  - 不得修改 `protocols/` 中已有的三铁律、阶段定义等内容

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1（单独运行）
  - **Blocks**: T2, T3, T4, T5, T6, T7
  - **Blocked By**: None

  **References**:
  - `protocols/sdd-riper-one.md:8-22` — 现有"三层上下文架构"定义，热/温/冷是其操作化
  - `protocols/sdd-riper-one.md:23-80` — 各阶段定义，用于推导每阶段预热清单
  - `SKILL.md:51-65` — Workflow Mode 步骤，上下文加载规则插入位置
  - `SKILL.md:113-138` — 现有 Review Phase 和 Archive Phase，不可修改

  **Acceptance Criteria**:

  - [ ] `grep -c "热层\|温层\|冷层" protocols/sdd-riper-one.md` ≥ 3
  - [ ] `grep -c "热层\|冷层" protocols/sdd-riper-one-light.md` ≥ 2
  - [ ] `grep "上下文分层加载规则" SKILL.md` 匹配到标题
  - [ ] `grep "AI 驱动命令" SKILL.md` 匹配到标题
  - [ ] `grep "T2: review-execute" SKILL.md` 匹配到占位注释

  **QA Scenarios**:

  ```
  Scenario: protocols/sdd-riper-one.md 包含热/温/冷定义
    Tool: Bash (grep)
    Steps:
      1. grep -A 30 "热/温/冷三层加载规则" protocols/sdd-riper-one.md
      2. 验证输出包含 "热层"、"温层"、"冷层" 三个标题
    Expected Result: 3 个标题均存在，每层有 ≥1 条说明
    Evidence: .sisyphus/evidence/task-1-hot-warm-cold-protocol.txt

  Scenario: SKILL.md Workflow Mode 含上下文加载规则
    Tool: Bash (grep)
    Steps:
      1. grep -n "上下文分层加载规则" SKILL.md
      2. 验证行号在 51-80 范围内（Workflow Mode 区段内）
    Expected Result: 标题存在且位置正确
    Evidence: .sisyphus/evidence/task-1-skill-context-rules.txt

  Scenario: SKILL.md 末尾含 AI 驱动命令占位区段
    Tool: Bash (grep)
    Steps:
      1. grep -n "AI 驱动命令" SKILL.md
      2. 验证区段存在且包含 6 个 <!-- T{N}: --> 占位注释
    Expected Result: 6 个占位注释均存在
    Evidence: .sisyphus/evidence/task-1-skill-ai-commands.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-hot-warm-cold-protocol.txt
  - [ ] task-1-skill-context-rules.txt
  - [ ] task-1-skill-ai-commands.txt

  **Commit**: YES
  - Message: `feat(protocols): add hot/warm/cold context layers and SKILL.md command scaffold`
  - Files: `protocols/sdd-riper-one.md`, `protocols/sdd-riper-one-light.md`, `SKILL.md`

---

- [x] 2. review-execute — 三轴质量筛查 Prompt（P0）

  **What to do**:
  - 新建 `bin/review-execute.sh`，CLI 契约：
    ```
    Usage: review-execute.sh <project-dir> [--spec <path>] [--log <path>]
    Exit codes: 0=success, 1=missing asset, 3=param error
    ```
    逻辑：
    1. 验证 `<project-dir>/mydocs/` 存在，否则 exit 1
    2. 自动定位 LATEST_SPEC（同 bootstrap.sh 逻辑）；若 `--spec` 指定则使用指定路径
    3. 读取 Spec 的 §8 Plan 区块内容（截断至 100 行）
    4. 运行 `git diff HEAD~1 HEAD 2>/dev/null || echo "(no git diff available)"` 获取代码变更（截断至 100 行）
    5. 读取 Execute Log（从 Spec §9 或 `--log` 指定文件，截断至 100 行）
    6. 输出固定结构的三轴 Prompt：
       ```
       ## REVIEW EXECUTE PROMPT
       ### 轴1：Spec Plan
       <plan content>
       ### 轴2：Code Diff
       <git diff>
       ### 轴3：Execute Log
       <execute log>
       ### 指令
       请逐轴对照，输出：Spec vs Code 对照 / 偏差记录 / 剩余风险 / 最终 Verdict (PASS|PASS_WITH_CONCERNS|FAIL)
       ```
  - 在 `sdd.sh` dispatch case 中新增 `review-execute` 条目（pattern: `review-execute`）
  - 更新 `sdd.sh` `print_usage` 中添加 `review-execute` 命令说明
  - 在 `SKILL.md` 的 `## AI 驱动命令` 区段中，将 `<!-- T2: review-execute -->` 替换为实际内容：
    ```markdown
    ### review-execute（P0 三轴质量筛查）
    触发时机：进入 Review 阶段时
    命令：`bash "$SDD_ROOT/sdd.sh" review-execute "$_PROJECT_ROOT"`
    AI 行为：读取命令输出的 Prompt，执行三轴对照分析，填写 Review Report
    ```
  - 新建 `tests/test_review_execute.sh`：happy-path（init + new-spec → 输出含 `## REVIEW EXECUTE PROMPT`）+ failure-path（无 mydocs → exit 1）+ no-args（exit 3）
  - 在 `tests/run_all.sh` 中注册新测试

  **Must NOT do**:
  - 不得写入任何文件（stdout-only）
  - 不得修改 `SKILL.md` 中 `## Review Phase Instructions` 已有内容
  - Prompt 中的三个标题顺序固定，不可调整

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2（与 T3-T7 并行）
  - **Blocks**: F1-F4
  - **Blocked By**: T1

  **References**:
  - `bin/bootstrap.sh:22-23` — LATEST_SPEC 定位逻辑（复用相同模式）
  - `SKILL.md:113-124` — Review Phase Instructions（不可修改，仅在 AI 驱动命令区追加）
  - `tests/test_bootstrap.sh` — 测试文件结构模板（pass/fail 计数器、make_tmp、cleanup_tmp）
  - `sdd.sh:48-56` — dispatch case 模板

  **Acceptance Criteria**:

  - [ ] `bash sdd.sh review-execute --help 2>&1 | grep -q "review-execute"` exit 0
  - [ ] happy-path: init → new-spec → `bash sdd.sh review-execute <dir>` exit 0，输出含 `## REVIEW EXECUTE PROMPT`
  - [ ] failure-path: 无 mydocs 目录 → exit 1，stderr 含 `[ERROR]`
  - [ ] no-args: `bash sdd.sh review-execute` → exit 3
  - [ ] `bash tests/test_review_execute.sh` 全部 pass

  **QA Scenarios**:

  ```
  Scenario: Happy path — 输出三轴 Prompt
    Tool: Bash
    Preconditions: 已 init 项目，已 new-spec
    Steps:
      1. bash sdd.sh review-execute <tmp-dir>
      2. 验证 stdout 含 "## REVIEW EXECUTE PROMPT"
      3. 验证 stdout 含 "### 轴1：Spec Plan"
      4. 验证 stdout 含 "### 轴2：Code Diff"
      5. 验证 stdout 含 "### 轴3：Execute Log"
    Expected Result: 3 个标题全部存在，exit 0
    Evidence: .sisyphus/evidence/task-2-happy-path.txt

  Scenario: Failure path — 无 mydocs 目录
    Tool: Bash
    Steps:
      1. mkdir /tmp/no-sdd-dir
      2. bash sdd.sh review-execute /tmp/no-sdd-dir 2>&1
      3. 验证 exit code = 1，stderr 含 "[ERROR]"
    Expected Result: exit 1，[ERROR] 消息
    Evidence: .sisyphus/evidence/task-2-failure-path.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-happy-path.txt
  - [ ] task-2-failure-path.txt

  **Commit**: YES
  - Message: `feat(cmd): add review-execute prompt generator`
  - Files: `bin/review-execute.sh`, `sdd.sh`, `SKILL.md`, `tests/test_review_execute.sh`, `tests/run_all.sh`

---

- [x] 3. bootstrap --create-spec 升级（P1b）

  **What to do**:
  - 修改 `bin/bootstrap.sh`，新增 `--create-spec` 模式：
    - 当检测到 `--create-spec` flag 时，进入 Spec 创建模式
    - 接受额外参数：`--requirement <text>` `--context <text>` `--goal <text>` `--constraints <text>` `--task-name <name>`（`--task-name` 必填）
    - 若缺少 `--task-name` 则 exit 3 + 错误说明
    - 读取 `templates/spec.md`（从 `$SCAFFOLD_ROOT/templates/spec.md`）
    - 将 requirement/context/goal/constraints 填入 Spec 模板对应区块占位符
    - **写入** `<project-dir>/mydocs/specs/<task-name>.md`（这是唯一允许写文件的新功能）
    - stdout 输出：
      ```
      ## SPEC CREATION PROMPT
      ### 已填充字段
      task-name: <name>
      requirement: <text>
      goal: <text>
      constraints: <text>
      context: <text>
      ### 创建的文件
      <project-dir>/mydocs/specs/<task-name>.md
      ### AI 指令
      请读取上述 Spec 文件，根据已填充的字段完善 Research Findings 区块，并识别初始 Open Questions。
      ```
    - 原有行为（无 `--create-spec` flag）完全不变
  - 更新 `SKILL.md` `## Setup Mode` 第 4 步：在"Create your first Spec now? → If yes"分支中，改为调用 `bash "$SDD_ROOT/sdd.sh" bootstrap "$_PROJECT_ROOT" --create-spec --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>"`，然后 AI 读取输出的 Spec 文件并完善 Research 区块
  - 在 `SKILL.md` 的 `## AI 驱动命令` 区段将 `<!-- T3: bootstrap --create-spec -->` 替换为实际说明
  - 新建 `tests/test_bootstrap_create_spec.sh`：happy-path（`--create-spec --task-name foo --requirement "bar"` → 写入 spec 文件，exit 0，stdout 含 `## SPEC CREATION PROMPT`）+ missing-task-name（exit 3）+ no-mydocs（exit 1）
  - 更新 `tests/run_all.sh` 注册新测试

  **Must NOT do**:
  - 不得修改原有 bootstrap 行为（无 `--create-spec` 时完全不变）
  - 写入的 spec 文件路径必须在 `mydocs/specs/` 下，不得写入其他位置

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: T1

  **References**:
  - `bin/bootstrap.sh:1-75` — 现有逻辑，新增 flag 检测在顶部参数解析区
  - `templates/spec.md` — 需要填充的模板，读取其中占位符字段
  - `SKILL.md:43-49` — Setup Mode 现有步骤，第 4 步需要修改
  - `tests/test_bootstrap.sh` — 测试模板

  **Acceptance Criteria**:

  - [ ] `bash sdd.sh bootstrap <init-dir> --create-spec --task-name "my-task" --requirement "test req" --goal "test goal"` exit 0
  - [ ] `<init-dir>/mydocs/specs/my-task.md` 文件存在
  - [ ] stdout 含 `## SPEC CREATION PROMPT`
  - [ ] 原有 bootstrap 行为（无 `--create-spec`）仍通过所有现有测试
  - [ ] missing `--task-name` → exit 3，stderr 含 `[ERROR]`

  **QA Scenarios**:

  ```
  Scenario: Happy path — 创建 Spec 文件
    Tool: Bash
    Preconditions: 已 init 项目
    Steps:
      1. bash sdd.sh bootstrap <dir> --create-spec --task-name "my-feature" --requirement "需要登录功能" --goal "用户可以注册和登录"
      2. 验证 exit code = 0
      3. 验证 stdout 含 "## SPEC CREATION PROMPT"
      4. 验证 <dir>/mydocs/specs/my-feature.md 存在
    Expected Result: 文件创建，Prompt 输出，exit 0
    Evidence: .sisyphus/evidence/task-3-happy-path.txt

  Scenario: Failure path — 缺少 --task-name
    Tool: Bash
    Steps:
      1. bash sdd.sh bootstrap <init-dir> --create-spec --requirement "foo" 2>&1
      2. 验证 exit code = 3
    Expected Result: exit 3，[ERROR] 消息
    Evidence: .sisyphus/evidence/task-3-missing-taskname.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-happy-path.txt
  - [ ] task-3-missing-taskname.txt

  **Commit**: YES
  - Message: `feat(cmd): upgrade bootstrap with --create-spec mode`
  - Files: `bin/bootstrap.sh`, `SKILL.md`, `tests/test_bootstrap_create_spec.sh`, `tests/run_all.sh`

---

- [x] 4. create-codemap — AI 驱动代码库扫描（P2a）

  **What to do**:
  - 新建 `bin/create-codemap.sh`，CLI 契约：
    ```
    Usage: create-codemap.sh <project-dir> [--module <name>]
    Exit codes: 0=success, 1=missing asset, 3=param error
    ```
    逻辑：
    1. 验证 `<project-dir>/mydocs/` 存在，否则 exit 1
    2. 扫描项目入口文件（`find <project-dir> -maxdepth 3 -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" | grep -v node_modules | grep -v .git | head -30`）
    3. 若指定 `--module <name>`，则 `find <project-dir> -path "*<name>*" -name "*.md" -o -path "*<name>*" -name "*.ts"` 等补充模块级文件
    4. 读取 `templates/codemap.md`，作为填充目标格式说明
    5. 输出固定结构的 Prompt：
       ```
       ## CREATE CODEMAP PROMPT
       ### 项目文件树（采样）
       <file list, ≤50 lines>
       ### CodeMap 模板格式
       <codemap template excerpt>
       ### AI 指令
       请分析上述文件树，识别核心模块、调用链路、外部依赖和风险点，按模板格式输出 CodeMap 内容。
       完成后将内容写入：<project-dir>/mydocs/codemap/<module-name>.md
       ```
  - 在 `sdd.sh` dispatch 和 `print_usage` 中新增 `create-codemap`
  - 在 `SKILL.md` `## AI 驱动命令` 区段填充 `<!-- T4: create-codemap -->` 条目
  - 新建 `tests/test_create_codemap.sh`：happy-path + failure-path + no-args
  - 更新 `tests/run_all.sh`

  **Must NOT do**:
  - 脚本本身不写任何文件（stdout-only，写文件由 AI 执行）
  - 不得修改 `bin/new-codemap.sh`（现有命令保持不变）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: T1

  **References**:
  - `bin/review-execute.sh`（T2 完成后）— 参考脚本结构（参数解析 / 截断逻辑 / 固定标题输出）
  - `templates/codemap.md` — 模板格式，截取前 30 行作为 Prompt 中的格式说明
  - `tests/test_bootstrap.sh` — 测试模板

  **Acceptance Criteria**:

  - [ ] `bash sdd.sh create-codemap --help 2>&1 | grep -q "create-codemap"` exit 0
  - [ ] happy-path: init 项目 → `bash sdd.sh create-codemap <dir>` exit 0，stdout 含 `## CREATE CODEMAP PROMPT`
  - [ ] failure-path: 无 mydocs → exit 1，stderr 含 `[ERROR]`
  - [ ] `bash tests/test_create_codemap.sh` 全部 pass

  **QA Scenarios**:

  ```
  Scenario: Happy path — 输出 CodeMap Prompt
    Tool: Bash
    Preconditions: 已 init 项目
    Steps:
      1. bash sdd.sh create-codemap <tmp-dir>
      2. 验证 stdout 含 "## CREATE CODEMAP PROMPT"
      3. 验证 stdout 含 "### 项目文件树"
      4. 验证 stdout 含 "### AI 指令"
    Expected Result: 3 个标题全部存在，exit 0
    Evidence: .sisyphus/evidence/task-4-happy-path.txt

  Scenario: Failure path — 无 mydocs
    Tool: Bash
    Steps:
      1. bash sdd.sh create-codemap /tmp/no-sdd 2>&1
      2. 验证 exit 1，含 "[ERROR]"
    Expected Result: exit 1
    Evidence: .sisyphus/evidence/task-4-failure-path.txt
  ```

  **Commit**: YES
  - Message: `feat(cmd): add create-codemap AI-driven prompt generator`
  - Files: `bin/create-codemap.sh`, `sdd.sh`, `SKILL.md`, `tests/test_create_codemap.sh`, `tests/run_all.sh`

---

- [x] 5. build-context-bundle — AI 提炼上下文包（P2b）

  **What to do**:
  - 新建 `bin/build-context-bundle.sh`，CLI 契约：
    ```
    Usage: build-context-bundle.sh <project-dir> [--out <bundle-name>]
    Exit codes: 0=success, 1=missing asset, 3=param error
    ```
    逻辑：
    1. 验证 `<project-dir>/mydocs/` 存在，否则 exit 1
    2. 枚举 `mydocs/` 下所有 `.md` 文件（排除 `.gitkeep`），分组显示（specs/ codemap/ context/ archive/）
    3. 统计各目录文件数
    4. 读取 `templates/context-bundle.md` 前 20 行作为格式说明
    5. bundle 名默认 `context-bundle-$(date +%Y%m%d)`；若 `--out` 指定则使用
    6. 输出固定结构 Prompt：
       ```
       ## BUILD CONTEXT BUNDLE PROMPT
       ### mydocs 文件清单
       <grouped file list>
       ### Context Bundle 模板格式
       <template excerpt>
       ### AI 指令
       请阅读上述文件清单中与当前任务相关的文档，提炼结构化上下文包，写入：
       <project-dir>/mydocs/context/<bundle-name>.md
       ```
  - `sdd.sh` dispatch + `print_usage` 新增 `build-context-bundle`
  - `SKILL.md` `## AI 驱动命令` 区段填充 `<!-- T5: build-context-bundle -->`
  - 新建 `tests/test_build_context_bundle.sh` + 更新 `tests/run_all.sh`

  **Must NOT do**:
  - 脚本不写文件（stdout-only）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: T1

  **References**:
  - `templates/context-bundle.md` — 读取前 20 行作为格式说明
  - `bin/review-execute.sh`（T2 完成后）— 脚本结构参考
  - `tests/test_bootstrap.sh` — 测试模板

  **Acceptance Criteria**:

  - [ ] happy-path: `bash sdd.sh build-context-bundle <init-dir>` exit 0，stdout 含 `## BUILD CONTEXT BUNDLE PROMPT`
  - [ ] failure-path: 无 mydocs → exit 1
  - [ ] `bash tests/test_build_context_bundle.sh` 全部 pass

  **QA Scenarios**:

  ```
  Scenario: Happy path — 输出 Bundle Prompt
    Tool: Bash
    Steps:
      1. bash sdd.sh build-context-bundle <init-dir>
      2. 验证 stdout 含 "## BUILD CONTEXT BUNDLE PROMPT"
      3. 验证 stdout 含 "### mydocs 文件清单"
    Expected Result: 标题存在，exit 0
    Evidence: .sisyphus/evidence/task-5-happy-path.txt

  Scenario: Failure — 无 mydocs
    Tool: Bash
    Steps:
      1. bash sdd.sh build-context-bundle /tmp/no-sdd 2>&1
    Expected Result: exit 1，[ERROR]
    Evidence: .sisyphus/evidence/task-5-failure-path.txt
  ```

  **Commit**: YES
  - Message: `feat(cmd): add build-context-bundle prompt generator`
  - Files: `bin/build-context-bundle.sh`, `sdd.sh`, `SKILL.md`, `tests/test_build_context_bundle.sh`, `tests/run_all.sh`

---

- [x] 6. debug — 日志驱动 Bug 定位（P3a）

  **What to do**:
  - 新建 `bin/debug.sh`，CLI 契约：
    ```
    Usage: debug.sh <project-dir> [--log <log-file>] [--error <error-message>]
    Exit codes: 0=success, 1=missing asset, 3=param error
    ```
    逻辑：
    1. 验证 `<project-dir>/mydocs/` 存在，否则 exit 1
    2. 自动定位 LATEST_SPEC（同 bootstrap.sh 逻辑）
    3. 若 `--log <file>` 指定，读取日志文件前 100 行；否则尝试读取 `<project-dir>/mydocs/evidence/` 下最新 `.log` 文件
    4. 若 `--error <msg>` 指定，将错误消息嵌入 Prompt
    5. 从 Spec §9 Execute Log 提取最近执行步骤（截断至 50 行）
    6. 输出固定结构 Prompt：
       ```
       ## DEBUG PROMPT
       ### 错误信息
       <error message or "(未指定)">
       ### 日志内容（≤100 行）
       <log content>
       ### 最近执行步骤（来自 Spec Execute Log）
       <execute log excerpt>
       ### AI 指令
       请基于上述三项输入，定位根本原因（Root Cause），提出最小修复方案，并说明是否需要回退到 Plan 阶段。
       禁止在未明确 Root Cause 的情况下提出修复方案。
       ```
  - `sdd.sh` dispatch + `print_usage` 新增 `debug`
  - `SKILL.md` `## AI 驱动命令` 区段填充 `<!-- T6: debug -->`
  - 新建 `tests/test_debug.sh` + 更新 `tests/run_all.sh`

  **Must NOT do**:
  - 脚本不写文件（stdout-only）
  - Prompt 中"禁止在未明确 Root Cause 的情况下提出修复方案"这条指令必须保留

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: T1

  **References**:
  - `bin/bootstrap.sh:22-23` — LATEST_SPEC 定位逻辑
  - `bin/review-execute.sh`（T2 完成后）— 脚本结构参考（截断逻辑）
  - `tests/test_bootstrap.sh` — 测试模板

  **Acceptance Criteria**:

  - [ ] `bash sdd.sh debug --help 2>&1 | grep -q "debug"` exit 0
  - [ ] happy-path: init + new-spec → `bash sdd.sh debug <dir>` exit 0，stdout 含 `## DEBUG PROMPT`
  - [ ] happy-path with --error: stdout 含指定错误消息
  - [ ] failure-path: 无 mydocs → exit 1
  - [ ] `bash tests/test_debug.sh` 全部 pass

  **QA Scenarios**:

  ```
  Scenario: Happy path — 输出 Debug Prompt
    Tool: Bash
    Preconditions: 已 init + new-spec
    Steps:
      1. bash sdd.sh debug <tmp-dir> --error "TypeError: Cannot read property"
      2. 验证 stdout 含 "## DEBUG PROMPT"
      3. 验证 stdout 含 "TypeError: Cannot read property"
      4. 验证 stdout 含 "禁止在未明确 Root Cause"
    Expected Result: 4 项均存在，exit 0
    Evidence: .sisyphus/evidence/task-6-happy-path.txt

  Scenario: Failure — 无 mydocs
    Tool: Bash
    Steps:
      1. bash sdd.sh debug /tmp/no-sdd 2>&1
    Expected Result: exit 1，[ERROR]
    Evidence: .sisyphus/evidence/task-6-failure-path.txt
  ```

  **Commit**: YES
  - Message: `feat(cmd): add debug prompt generator`
  - Files: `bin/debug.sh`, `sdd.sh`, `SKILL.md`, `tests/test_debug.sh`, `tests/run_all.sh`

---

- [x] 7. create-projectmap — AI 驱动 ProjectMap 生成（P3b）

  **What to do**:
  - 新建 `bin/create-projectmap.sh`，CLI 契约：
    ```
    Usage: create-projectmap.sh <project-dir> [--repos <repo1,repo2,...>] [--force]
    Exit codes: 0=success, 1=missing asset, 2=already exists (use --force), 3=param error
    ```
    逻辑：
    1. 验证 `<project-dir>/mydocs/` 存在，否则 exit 1
    2. 若 `<project-dir>/mydocs/projectmap.md` 已存在且未指定 `--force`，exit 2 + 提示
    3. 扫描项目根目录基础信息：项目名（`basename <project-dir>`）、顶层目录列表、package.json/go.mod/pyproject.toml 等存在性
    4. 读取 `templates/projectmap.md` 前 30 行作为格式说明
    5. 输出固定结构 Prompt：
       ```
       ## CREATE PROJECTMAP PROMPT
       ### 项目基础信息
       name: <project-name>
       repos: <repos-list or "单仓库">
       top-level-dirs: <dir list>
       detected-stacks: <stack list>
       ### ProjectMap 模板格式
       <template excerpt>
       ### AI 指令
       请基于上述信息，填写 ProjectMap，重点描述：
       1. 各仓库/模块职责
       2. 跨模块接口契约
       3. 核心数据流
       完成后将内容写入：<project-dir>/mydocs/projectmap.md
       ```
  - `sdd.sh` dispatch + `print_usage` 新增 `create-projectmap`
  - `SKILL.md` `## AI 驱动命令` 区段填充 `<!-- T7: create-projectmap -->`
  - 新建 `tests/test_create_projectmap.sh` + 更新 `tests/run_all.sh`

  **Must NOT do**:
  - 脚本本身不写文件（stdout-only，写文件由 AI 执行）
  - 不得修改 `bin/new-projectmap.sh`（现有命令保持不变）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: T1

  **References**:
  - `templates/projectmap.md` — 读取前 30 行作为格式说明
  - `bin/new-projectmap.sh` — 现有命令逻辑，了解 projectmap.md 已存在检测
  - `tests/test_bootstrap.sh` — 测试模板

  **Acceptance Criteria**:

  - [ ] `bash sdd.sh create-projectmap --help 2>&1 | grep -q "create-projectmap"` exit 0
  - [ ] happy-path: init → `bash sdd.sh create-projectmap <dir>` exit 0，stdout 含 `## CREATE PROJECTMAP PROMPT`
  - [ ] already-exists: 第二次运行（无 --force）→ exit 2
  - [ ] `--force` 覆盖：重新运行带 `--force` → exit 0
  - [ ] failure-path: 无 mydocs → exit 1
  - [ ] `bash tests/test_create_projectmap.sh` 全部 pass

  **QA Scenarios**:

  ```
  Scenario: Happy path — 输出 ProjectMap Prompt
    Tool: Bash
    Preconditions: 已 init 项目，无 projectmap.md
    Steps:
      1. bash sdd.sh create-projectmap <tmp-dir>
      2. 验证 stdout 含 "## CREATE PROJECTMAP PROMPT"
      3. 验证 stdout 含 "### 项目基础信息"
      4. 验证 stdout 含 "### AI 指令"
    Expected Result: 3 个标题存在，exit 0
    Evidence: .sisyphus/evidence/task-7-happy-path.txt

  Scenario: Already exists — exit 2
    Tool: Bash
    Steps:
      1. bash sdd.sh new-projectmap <tmp-dir>（创建 projectmap.md）
      2. bash sdd.sh create-projectmap <tmp-dir> 2>&1
      3. 验证 exit 2，stderr 含 "already exists" 或 "--force"
    Expected Result: exit 2
    Evidence: .sisyphus/evidence/task-7-already-exists.txt

  Scenario: --force 覆盖
    Tool: Bash
    Steps:
      1. bash sdd.sh create-projectmap <tmp-dir> --force
      2. 验证 exit 0
    Expected Result: exit 0，正常输出 Prompt
    Evidence: .sisyphus/evidence/task-7-force.txt
  ```

  **Commit**: YES
  - Message: `feat(cmd): add create-projectmap AI-driven prompt generator`
  - Files: `bin/create-projectmap.sh`, `sdd.sh`, `SKILL.md`, `tests/test_create_projectmap.sh`, `tests/run_all.sh`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  读取本计划端到端。对每个 Must Have：验证实现存在（读文件 / 运行命令）。对每个 Must NOT Have：搜索代码库中的禁止模式。检查 evidence 文件存在。对比交付物与计划。
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  运行 `bash tests/run_all.sh`。审查所有新增脚本：变量是否用双引号、是否有 `set -euo pipefail`、是否有帮助文本、输出标题是否固定。
  Output: `Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  从 clean state 执行每个新命令的 QA 场景。依次运行所有 happy-path 和 failure-path。保存输出至 `.sisyphus/evidence/final-qa/`。
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  对每个任务：读取 "What to do"，读取实际 diff（git log/diff）。验证 1:1 — spec 中的每项都有实现，没有超出 spec 的实现。检查 Must NOT do 合规。
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- T1: `feat(protocols): add hot/warm/cold context layers and SKILL.md command scaffold`
- T2: `feat(cmd): add review-execute prompt generator`
- T3: `feat(cmd): upgrade bootstrap with --create-spec mode`
- T4: `feat(cmd): add create-codemap AI-driven prompt generator`
- T5: `feat(cmd): add build-context-bundle prompt generator`
- T6: `feat(cmd): add debug prompt generator`
- T7: `feat(cmd): add create-projectmap AI-driven prompt generator`

---

## Success Criteria

### Verification Commands
```bash
bash tests/run_all.sh           # Expected: all PASS, 0 failed
bash sdd.sh review-execute --help    # Expected: exit 0, usage printed
bash sdd.sh debug --help             # Expected: exit 0, usage printed
grep -c "热层\|温层\|冷层" protocols/sdd-riper-one.md  # Expected: ≥3
grep "AI 驱动命令" SKILL.md          # Expected: 匹配到标题行
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent  
- [ ] All tests pass
- [ ] `SKILL.md` 无自动阶段推进逻辑
- [ ] `sdd.sh` 现有命令行为不变
