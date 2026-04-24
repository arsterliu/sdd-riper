# SDD-RIPER Skill 改造计划

## TL;DR

> **Quick Summary**: 在现有 SDD-RIPER scaffold 基础上，新增 `SKILL.md` 和 `bin/sdd-bootstrap.sh`，将 scaffold 改造为可被 OpenCode 直接加载的 skill，同时保持 shell CLI 原有功能不变。
>
> **Deliverables**:
> - `SKILL.md` — OpenCode skill 入口（Setup 模式 + Workflow 模式 + RIPER 全阶段 AI 指令）
> - `bin/sdd-bootstrap.sh` — 新子命令，输出项目上下文摘要供 skill 消费
> - `sdd.sh` — 微更新，dispatch 表添加 `bootstrap`
> - `README.md` — 新增 skill 安装章节
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — Wave 1 三路并行
> **Critical Path**: T1(SKILL.md) → T4(README) → done

---

## Context

### Original Request
用户希望将现有 SDD-RIPER scaffold 改造成 OpenCode skill，让 AI 能通过 `/sdd-riper` 命令直接协调整个 SDD-RIPER 工作流（项目初始化 + RIPER 阶段全程引导），shell CLI 保留作为执行层。

### Interview Summary
**Key Discussions**:
- **核心职责**: 项目初始化（Setup 模式）+ 工作流引导（Workflow 模式），两者都要
- **Shell 脚本**: 保留，由 SKILL.md 调用，不取代
- **粒度**: 一个大 skill（single SKILL.md）
- **安装位置**: 全局 + 项目内两者都支持，项目内覆盖全局
- **触发方式**: 显式命令 `/sdd-riper`，不主动建议
- **自动化程度**: 全程人工主导，Plan Approved 是硬门禁（AskUserQuestion 实现）
- **AI 配置**: init 时继续生成全部 4 种配置文件

**Research Findings**:
- 现有 `SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"` 路径方案在 skill 安装后天然正确，**无需改动其他 bin/*.sh**
- OpenCode 注入 `$CLAUDE_SKILL_DIR` 指向 SKILL.md 所在目录，即 scaffold root
- gstack-investigate SKILL.md 是参考模板（frontmatter + Preamble + Phase Instructions）
- 现有 37/37 测试不受改造影响

### Self-Derived Gap Analysis（Metis 超时，自行补充）
- **Gap 1**: `sdd-bootstrap.sh` 需定义明确输出格式，让 SKILL.md 的 Bash 可靠解析
- **Gap 2**: 双安装位置的优先级需明确（项目内 > 全局，且 SKILL.md preamble 必须体现此逻辑）
- **Gap 3**: `CLAUDE_SKILL_DIR` 在 Windows Git Bash 下可能为 Windows 路径格式，需处理路径分隔符
- **Gap 4**: SKILL.md 的 `description` 字段不应包含 proactive 建议词，避免触发自动推荐

---

## Work Objectives

### Core Objective
让 SDD-RIPER scaffold 同时扮演两个角色：(1) 独立 shell CLI 工具（现有功能不变），(2) OpenCode skill（AI 可直接加载并引导整个 RIPER 工作流）。

### Concrete Deliverables
- `SKILL.md`（repo 根目录，与 sdd.sh 同级）
- `bin/sdd-bootstrap.sh`（新子命令）
- `sdd.sh`（添加 bootstrap 到 dispatch）
- `README.md`（新增 skill 安装章节）

### Definition of Done
- `skill` 工具可加载 `SKILL.md`（frontmatter 合法，allowed-tools 正确）
- `bash sdd.sh bootstrap ./tmp/demo` 输出结构化摘要，exit 0
- `bash tests/run_all.sh` 仍然 37/37 通过（改造不破坏现有测试）
- `README.md` 含全局安装和项目级安装两种方式的命令

### Must Have
- SKILL.md 含合法 YAML frontmatter（name/version/description/allowed-tools）
- Preamble 正确使用 `$CLAUDE_SKILL_DIR` 定位 SDD_ROOT
- 双安装优先级：项目内 `.agents/skills/sdd-riper` > 全局 `$CLAUDE_SKILL_DIR`
- Setup 模式：调用 `sdd.sh init`，引导创建首个 Spec
- Workflow 模式：调用 `sdd.sh bootstrap` 加载上下文，检测 RIPER 阶段
- 每个 RIPER 阶段有明确 AI 指令
- Plan Approved 强制 AskUserQuestion 人工门禁（不可自行跳过）
- `bootstrap` 子命令输出机器可读的结构化摘要
- 现有 37/37 测试不破坏

### Must NOT Have (Guardrails)
- **不得** 修改其他任何 `bin/*.sh` 文件（路径已经正确，禁止不必要改动）
- **不得** 在 SKILL.md description 加 proactive 触发词（如"Proactively suggest when..."）
- **不得** 在 SKILL.md 中让 AI 自动推进 RIPER 阶段（每阶段必须人工显式触发）
- **不得** 删除或修改 `protocols/`、`templates/`、`tests/`、`examples/`
- **不得** 让 SKILL.md 直接写文件（必须通过 sdd.sh 子命令，保持 CLI 一致性）
- **不得** 在 SKILL.md 里 hardcode 路径（必须用 `$CLAUDE_SKILL_DIR`）

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES（现有 tests/ 目录，37 tests）
- **Automated tests**: Tests after（新增 sdd-bootstrap 的测试用例追加到 test_new.sh 或单独文件）
- **Framework**: bash test scripts

### QA Policy
- **CLI/Shell**: Bash — 执行 bootstrap 命令，校验输出格式和 exit code
- **SKILL.md**: 人工阅读审查（frontmatter 合法性、Phase 指令完整性）
- **集成**: 运行 `bash tests/run_all.sh`，验证无回归

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (三路并行):
├── T1: SKILL.md                              [unspecified-high]
├── T2: bin/sdd-bootstrap.sh + sdd.sh 更新    [quick]
└── T3: tests/test_bootstrap.sh（bootstrap 测试）[quick]

Wave 2 (After Wave 1):
└── T4: README.md 更新（skill 安装章节）       [writing]

Wave FINAL:
└── 运行 tests/run_all.sh 验证无回归 + 审查 SKILL.md 内容完整性
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| T1 | — | T4（README 需引用 skill 激活方式）|
| T2 | — | T3（测试需要脚本存在）|
| T3 | T2 | Final |
| T4 | T1 | — |

---

## TODOs

- [x] 1. SKILL.md — OpenCode skill 核心指令文件

  **What to do**:
  - 在 repo 根目录（与 `sdd.sh` 同级）创建 `SKILL.md`
  - **YAML frontmatter**（合法 OpenCode skill 格式）：
    ```yaml
    ---
    name: sdd-riper
    version: 1.0.0
    description: |
      SDD-RIPER: Structured development workflow. Init project structure
      and guide Research→Innovate→Plan→Execute→Review→Archive phases.
      Human gate at Plan Approved — AI cannot self-advance phases.
      Trigger with: /sdd-riper, /sdd, "setup SDD", "start sdd task".
    allowed-tools:
      - Bash
      - Read
      - Write
      - Edit
      - Grep
      - Glob
      - AskUserQuestion
    ---
    ```
  - **Preamble**（bash 代码块，首先执行）：
    - 检测 `$CLAUDE_SKILL_DIR`（OpenCode 注入，指向 SKILL.md 所在目录）
    - 检测项目是否有本地 override：`.agents/skills/sdd-riper` 优先于全局
    - 导出 `SDD_ROOT`（最终使用的 skill 目录路径）
    - 检测 `HAS_SDD`：项目根目录是否有 `mydocs/`
    - 输出：`SDD_ROOT`, `PROJECT_ROOT`, `HAS_SDD`
  - **Mode Selection**：
    - 基于 `HAS_SDD` 输出，使用 AskUserQuestion 让用户选择：
      - A) Setup Mode（初始化项目）
      - B) Workflow Mode（引导现有项目的 RIPER 任务）
  - **Setup Mode 指令**：
    - 询问目标目录和 `--mode standard|lite`
    - 执行 `bash "$SDD_ROOT/sdd.sh" init <dir> --mode <mode>`
    - 展示已创建文件清单
    - 询问是否立即创建首个 Spec（如是，询问任务名，执行 `new-spec`）
    - 说明后续使用方式（/sdd-riper 进入 Workflow 模式）
  - **Workflow Mode 指令**：
    - 执行 `bash "$SDD_ROOT/sdd.sh" bootstrap <project-dir>`
    - 读取 bootstrap 输出，加载 active spec 内容（Read 工具）
    - 询问用户当前处于哪个 RIPER 阶段（AskUserQuestion）
    - 根据选择跳转到对应阶段指令
  - **RIPER 阶段指令**（每阶段独立章节）：
    - **Research**: 必须输出四段格式（Restatement/Open Questions/Confirmed Facts/Spec Writeback）
    - **Innovate**: ≥2 方案（含 Pros/Cons/风险/推荐）；简单任务允许 Skipped + Reason
    - **Plan**: 输出原子级计划后，**必须** 使用 AskUserQuestion 等待 Plan Approved 人工确认，未确认不得进入 Execute
    - **Execute**: 严格按 Plan 执行，偏差必记录，Plan 失效时回退不得偷改
    - **Review**: 必须输出 Spec vs Code 对照 / 偏差 / 剩余风险 / Verdict
    - **Archive**: 调用 `bash "$SDD_ROOT/sdd.sh" archive <dir> <spec-name>`，展示产出文件
  - **Completion Status Protocol**（结尾章节）：
    - DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT 格式

  **Must NOT do**:
  - 不要 hardcode 任何绝对路径（全部用 `$CLAUDE_SKILL_DIR` 或 `$SDD_ROOT`）
  - 不要在 description 写"Proactively suggest when..."（会触发主动推荐）
  - 不要让 SKILL.md 直接用 Write/Edit 创建项目文件（必须通过 sdd.sh 子命令）
  - 不要在任何阶段允许 AI 自行跳到下一阶段（每步都需用户显式确认）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要深度理解 SDD-RIPER 协议，并将其转化为 OpenCode skill 指令格式
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T2、T3 并行）
  - **Parallel Group**: Wave 1
  - **Blocks**: T4（README 需引用 skill 激活方式）
  - **Blocked By**: None

  **References**:
  - `C:\Users\liuyl\.opencode\skills\gstack-investigate\SKILL.md` — frontmatter + Preamble + Phase structure 参考模板
  - `protocols/sdd-riper-one.md` — RIPER 阶段定义权威来源，SKILL.md 的 Phase 指令必须忠实于此
  - `protocols/sdd-riper-one-light.md` — lite 模式参考
  - `bin/_gen_ai_configs.sh` — 了解 AI 配置文件如何生成（Setup 模式说明中需提及）

  **Acceptance Criteria**:

  ```
  Scenario: SKILL.md frontmatter 合法
    Tool: Bash
    Steps:
      1. grep -q "^name: sdd-riper" ./SKILL.md && echo "name:PASS"
      2. grep -q "allowed-tools:" ./SKILL.md && echo "tools:PASS"
      3. grep -q "AskUserQuestion" ./SKILL.md && echo "AskUserQuestion:PASS"
    Expected Result: 全部 PASS
    Evidence: .sisyphus/evidence/skill-t1-frontmatter.txt

  Scenario: SKILL.md 含全部 6 个 RIPER 阶段指令
    Tool: Bash
    Steps:
      1. for phase in Research Innovate Plan Execute Review Archive; do grep -q "$phase" ./SKILL.md && echo "$phase:PASS" || echo "$phase:MISSING"; done
    Expected Result: 全部 PASS
    Evidence: .sisyphus/evidence/skill-t1-phases.txt

  Scenario: SKILL.md 含 Plan Approved 门禁
    Tool: Bash
    Steps:
      1. grep -q "Plan Approved" ./SKILL.md && echo "gate:PASS"
      2. grep -q "AskUserQuestion" ./SKILL.md && echo "human-gate:PASS"
    Expected Result: 全部 PASS
    Evidence: .sisyphus/evidence/skill-t1-gate.txt

  Scenario: SKILL.md 不含 hardcoded 路径
    Tool: Bash
    Steps:
      1. grep -v "CLAUDE_SKILL_DIR\|SDD_ROOT\|PROJECT_ROOT\|opencode/skills" ./SKILL.md | grep -q "/home/\|/Users/\|C:\\\\" && echo "FAIL: hardcoded path found" || echo "PASS: no hardcoded paths"
    Expected Result: PASS
    Evidence: .sisyphus/evidence/skill-t1-paths.txt
  ```

  **Commit**: YES（Wave 1 完成后统一提交）

- [x] 2. bin/sdd-bootstrap.sh + sdd.sh dispatch 更新

  **What to do**:
  - 创建 `bin/sdd-bootstrap.sh <project-dir>` — 输出结构化项目上下文摘要：
    ```
    [SDD Bootstrap] <project-dir>
    DOCS_DIR: mydocs
    ACTIVE_SPECS: <count>
    LATEST_SPEC: <path>  (最近修改的 spec 文件)
    SPEC_STATUS: draft|approved|done|none
    HAS_CODEMAP: yes|no
    HAS_PROJECTMAP: yes|no
    PHASE_HINT: research|innovate|plan|execute|review|archive|unknown
    ```
    - `PHASE_HINT` 由 spec frontmatter 的 `status:` 字段推断：
      - `status: draft` + 无 `Plan Approved By` → research/innovate/plan
      - `status: draft` + 有 `Plan Approved By` → execute
      - `status: approved` → execute/review
      - `status: done` → archive
      - 无 spec 文件 → unknown
    - 若无 `mydocs/` 目录：打印 `[ERROR] Project not initialized. Run: sdd.sh init <dir>` 并 exit 1
    - exit 0 = 成功输出摘要，exit 1 = 项目未初始化，exit 3 = 参数错误
  - 更新 `sdd.sh`：在 dispatch case 中添加 `bootstrap`（与其他子命令格式完全一致）

  **Must NOT do**:
  - 不要修改其他任何 `bin/*.sh`（只新增 bootstrap.sh）
  - 不要让 bootstrap 执行任何写操作，只读
  - `PHASE_HINT` 只做提示（hint），不做强制判断，SKILL.md 仍由用户最终选择阶段

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 逻辑清晰，参考现有 bin/*.sh 的写法即可
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T1、T3 并行）
  - **Parallel Group**: Wave 1
  - **Blocks**: T3（测试需要 bootstrap.sh 存在）
  - **Blocked By**: None

  **References**:
  - `bin/status.sh` — 参考 frontmatter 解析逻辑（awk 解析 `status:` 字段）
  - `sdd.sh` line 48-52 — dispatch case 格式，保持一致

  **Acceptance Criteria**:

  ```
  Scenario: bootstrap 输出结构化摘要（happy path）
    Tool: Bash
    Preconditions: bash sdd.sh init ./tmp/skill-demo --mode standard，并创建一个 spec
    Steps:
      1. bash sdd.sh bootstrap ./tmp/skill-demo
      2. echo "exit:$?"
      3. bash sdd.sh bootstrap ./tmp/skill-demo | grep "LATEST_SPEC:"
      4. bash sdd.sh bootstrap ./tmp/skill-demo | grep "PHASE_HINT:"
    Expected Result: exit 0，输出含 LATEST_SPEC 和 PHASE_HINT 行
    Evidence: .sisyphus/evidence/skill-t2-bootstrap-ok.txt

  Scenario: 未初始化项目返回 exit 1
    Tool: Bash
    Steps:
      1. mkdir -p ./tmp/uninit
      2. bash sdd.sh bootstrap ./tmp/uninit
      3. echo "exit:$?"
    Expected Result: exit 1，输出含 ERROR 提示
    Evidence: .sisyphus/evidence/skill-t2-bootstrap-uninit.txt

  Scenario: sdd.sh dispatch 识别 bootstrap
    Tool: Bash
    Steps:
      1. bash sdd.sh bootstrap 2>&1 | head -1
    Expected Result: 打印 ERROR（缺少参数），exit 3，而非 "Unknown command"
    Evidence: .sisyphus/evidence/skill-t2-dispatch.txt
  ```

  **Commit**: YES（Wave 1 完成后统一提交）

- [x] 3. tests/test_bootstrap.sh — bootstrap 自动化测试

  **What to do**:
  - 创建 `tests/test_bootstrap.sh`，覆盖以下场景：
    1. happy path：init 后 bootstrap，exit 0，含结构化输出字段
    2. 有 spec 文件时：LATEST_SPEC 字段正确，PHASE_HINT 不为 unknown
    3. 未初始化项目：exit 1，含 ERROR 提示
    4. 参数缺失：exit 3
  - 更新 `tests/run_all.sh`，将 `test_bootstrap.sh` 加入测试套件
  - 测试前后清理 tmp/

  **Must NOT do**:
  - 不要破坏现有 37 个测试
  - 不要修改 test_init.sh、test_new.sh、test_status.sh、test_archive.sh

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 参考现有测试文件格式即可，逻辑直接
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T1 并行，但需等 T2 完成后才能真正执行测试）
  - **Parallel Group**: Wave 1（可先写测试代码，与 T2 完成后联调）
  - **Blocks**: Final Wave
  - **Blocked By**: T2（测试依赖 bootstrap.sh 存在）

  **References**:
  - `tests/test_status.sh` — 测试文件格式参考（setup/teardown 模式）
  - `tests/run_all.sh` — 如何添加新测试套件

  **Acceptance Criteria**:

  ```
  Scenario: test_bootstrap.sh 全部通过
    Tool: Bash
    Steps:
      1. bash tests/test_bootstrap.sh
      2. echo "exit:$?"
    Expected Result: exit 0，显示 N passed, 0 failed
    Evidence: .sisyphus/evidence/skill-t3-tests.txt

  Scenario: run_all.sh 包含 bootstrap 测试且全部通过
    Tool: Bash
    Steps:
      1. bash tests/run_all.sh
      2. echo "exit:$?"
    Expected Result: exit 0，输出包含 bootstrap tests 的 SUITE PASS
    Evidence: .sisyphus/evidence/skill-t3-run-all.txt
  ```

  **Commit**: YES（Wave 1 完成后统一提交）

- [x] 4. README.md — 新增 OpenCode Skill 安装章节

  **What to do**:
  - 在 README.md 的"快速开始（5分钟）"章节**之前**插入新章节"作为 OpenCode Skill 使用"：
    - **全局安装**（推荐，一次安装所有项目可用）：
      ```bash
      cp -r sdd-riper ~/.opencode/skills/sdd-riper
      ```
    - **项目级安装**（随仓库分发，版本锁定）：
      ```bash
      cp -r sdd-riper .agents/skills/sdd-riper
      ```
    - **激活方式**：在 OpenCode 对话中输入 `/sdd-riper`
    - **两种模式说明**：
      - Setup 模式：首次使用，引导初始化项目结构
      - Workflow 模式：日常使用，引导 RIPER 任务全流程
    - **与 shell CLI 的区别**：
      - shell CLI（`sdd.sh`）：开发者命令行工具，手动操作
      - OpenCode skill：AI 作为协调者，自动调用 CLI 命令并引导工作流
    - **前置条件**：需已安装 OpenCode，bash 可用（Windows 用 Git Bash）
  - 保持 README 其余内容不变

  **Must NOT do**:
  - 不要修改现有章节内容
  - 不要承诺 skill 支持其他 AI 工具（Cursor、Claude 桌面版等 — 非此次 scope）

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: 技术文档写作，中文
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（需要 T1 完成后才知道激活方式）
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: T1（需确认 skill name 和激活命令）

  **References**:
  - `README.md` 现有章节结构（在"快速开始"前插入）
  - `SKILL.md` frontmatter 中的 `name:` 字段（确定激活命令名）

  **Acceptance Criteria**:

  ```
  Scenario: README 含 skill 安装说明
    Tool: Bash
    Steps:
      1. grep -q "\.opencode/skills" ./README.md && echo "全局安装:PASS"
      2. grep -q "\.agents/skills" ./README.md && echo "项目级安装:PASS"
      3. grep -q "/sdd-riper" ./README.md && echo "激活命令:PASS"
      4. grep -q "Setup 模式\|Workflow 模式" ./README.md && echo "模式说明:PASS"
    Expected Result: 全部 PASS
    Evidence: .sisyphus/evidence/skill-t4-readme.txt
  ```

  **Commit**: YES（Wave 2 完成后提交）

---

## Final Verification Wave

- [x] F1. **回归测试** — 运行 `bash tests/run_all.sh`，确认仍然 37/37（或 37+N）通过，exit 0
- [x] F2. **SKILL.md 完整性审查** — 逐节检查：frontmatter 合法、Preamble 路径逻辑、Setup/Workflow 模式、6个 RIPER 阶段指令、Plan Approved 门禁是否为 AskUserQuestion

---

## Commit Strategy

- Wave 1 完成后：`feat(skill): add SKILL.md and sdd-bootstrap command`
- Wave 2 完成后：`docs: add OpenCode skill installation guide to README`

---

## Success Criteria

```bash
# SKILL.md 存在且 frontmatter 合法
grep -q "name: sdd-riper" ./SKILL.md && echo "PASS"

# bootstrap 命令可执行
bash sdd.sh bootstrap ./tmp/demo  # exit 0, 含结构化输出

# 现有测试无回归
bash tests/run_all.sh  # 37/37 pass

# README 含安装说明
grep -q "\.opencode/skills" ./README.md && echo "PASS"
```
