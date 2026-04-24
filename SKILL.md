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

```bash
# Locate SDD-RIPER root — project-level override takes priority over global skill
_PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SDD_ROOT="${CLAUDE_SKILL_DIR:-}"
[ -d "$_PROJECT_ROOT/.agents/skills/sdd-riper" ] && SDD_ROOT="$_PROJECT_ROOT/.agents/skills/sdd-riper"
[ -z "$SDD_ROOT" ] && echo "[WARN] SDD_ROOT not found via CLAUDE_SKILL_DIR; using script location" || true
SDD_ROOT="${SDD_ROOT:-$(cd "$(dirname "$0")" 2>/dev/null && pwd || pwd)}"
echo "SDD_ROOT: $SDD_ROOT"
echo "PROJECT_ROOT: $_PROJECT_ROOT"
HAS_SDD=$([ -d "$_PROJECT_ROOT/mydocs" ] && echo "yes" || echo "no")
echo "HAS_SDD: $HAS_SDD"
```

> **⚠️ PATH SUBSTITUTION RULE (CRITICAL)**
> The preamble above runs in an isolated shell. `$SDD_ROOT` and `$_PROJECT_ROOT` are NOT available as shell variables in subsequent Bash tool calls.
> 
> After running the preamble, read the output values and store them as literal strings:
> - `SDD_ROOT: <value>` → use this exact path string in all subsequent bash commands
> - `PROJECT_ROOT: <value>` → use this exact path string in all subsequent bash commands
> 
> **Always substitute the actual path directly into every command. Never use `$SDD_ROOT` or `$_PROJECT_ROOT` as variable references.**
> 
> ✅ Correct: `bash "C:/Users/liuyl/.config/opencode/skills/sdd-riper/sdd.sh" resume "D:/workspace/myproject"`
> ❌ Wrong: `bash "$SDD_ROOT/sdd.sh" resume "$_PROJECT_ROOT"`

## Mode Selection
After the preamble, output the following question in your response (as plain text, no tool call needed) and then END YOUR TURN immediately — do NOT proceed further until the user replies:

---
SDD-RIPER activated.
Project: {PROJECT_ROOT}
Status: {HAS_SDD=yes → "SDD structure found" | HAS_SDD=no → "Not yet initialized"}

请选择：
A) 初始化项目 SDD 结构（创建 mydocs/、AI 配置文件）
B) 开始或继续 RIPER 工作流任务
---

**⚠️ HUMAN GATE — END YOUR TURN HERE. Output the question above and stop. Do NOT call any tools. Do NOT write A/B handling logic. Do NOT proceed to Setup Mode or Workflow Mode. Wait for the user to reply with A or B in the next message.**

## Setup Mode (if A selected)
> ⚠️ **SYSTEM DIRECTIVE — NO AUTO-ADVANCE**
> Do **NOT** use `TodoWrite` anywhere in this flow. Register **zero** todos.
> Every step in Setup Mode is a human gate. After **each** `AskUserQuestion`, you MUST:
> - Make **no further tool calls**
> - Execute **no commands**
> - Produce **no reasoning toward the next step**
> - **STOP and wait** for the user to respond in a new turn.
> Violating this rule causes all subsequent human gates to be bypassed by `TODO_CONTINUATION`.

1. Use `AskUserQuestion` to ask for target directory (default: current project root) and mode (standard or lite). Store the user-selected directory as `TARGET_DIR` for all subsequent commands in this flow.
   > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user to provide target directory and mode before continuing.
2. Run: `bash "$SDD_ROOT/sdd.sh" init "$TARGET_DIR" --mode <mode>` (DO NOT use Write/Edit tools directly to create project files).
3. Show created files.
4. **CodeMap 引导（仅当满足条件时）**: Check whether the `init` command output contains `[SDD-RIPER]`, and whether `$TARGET_DIR/mydocs/codemap/` **already has** `.md` files (excluding `.gitkeep`).
   - If init output does **not** contain `[SDD-RIPER]`, OR `$TARGET_DIR/mydocs/codemap/` **already has** `.md` files (excluding `.gitkeep`): skip this step and go to step 5.
   - If init output **contains** `[SDD-RIPER]` AND `$TARGET_DIR/mydocs/codemap/` has **no** `.md` files: use `AskUserQuestion`:
      > 检测到目标项目已有较多源码文件，尚未建立 CodeMap。
      > 是否现在建立 CodeMap 以帮助 AI 快速理解模块结构？
      > （可选）模块名称（留空则扫描整个项目）: ___
      > A) 是，立即建立
      > B) 否，跳过
   > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user's A/B response before running any command.
    - If user selects A: run `bash "$SDD_ROOT/sdd.sh" create-codemap "$TARGET_DIR"` (append `--module <name>` if module name was provided). Show command output. If command fails, explain the error and continue to step 5.
    - If user selects B: continue to step 5.
5. Use `AskUserQuestion`: "Create your first Spec now?"
   > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user's yes/no response.
   - If yes:
      a. Use `AskUserQuestion` to ask for task name, requirement (what needs to be built), goal, and constraints (optional).
         > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user to provide all 4 items (task name, requirement, goal, constraints). If the user provides fewer than 4 items, re-ask for the missing ones — do NOT infer or skip.
      b. **Context Bundle 引导**: Check whether `$TARGET_DIR/mydocs/context/` is missing or has **no** `.md` files (excluding `.gitkeep`).
         - If `$TARGET_DIR/mydocs/context/` is missing or has **no** `.md` files (excluding `.gitkeep`): use `AskUserQuestion`:
           > `mydocs/context/` 目录为空，尚无 Context Bundle。
           > Context Bundle 可将当前 Spec、CodeMap 及关联文件打包，作为 discover 的 `--context` 背景材料，帮助 AI 更准确理解任务背景。
           > 是否现在构建 Context Bundle？
           > A) 是，立即构建
           > B) 否，跳过
           > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user's A/B response before running any command.
            - If A: run `bash "$SDD_ROOT/sdd.sh" build-context-bundle "$TARGET_DIR"`. Parse `SDD_OUTPUT_PATH:` from the output to get `CONTEXT_PATH`. Then follow the AI 指令 printed in the output: read the listed source files and use the Write tool to create the context bundle at `CONTEXT_PATH`. If the command fails, explain the error and proceed without `--context`.
           - If B: proceed without `--context`.
         - If `$TARGET_DIR/mydocs/context/` **already has** `.md` files: use the most recently modified `.md` file path as `--context <path>` in the discover command below.
      c. Check `$TARGET_DIR/mydocs/specs/` for existing files matching `*-<task-name>.md` to determine the next auto-incremented version (v1.0 if none exist, otherwise v{N}.{M+1}). Output to user and END YOUR TURN:

---
即将创建 Spec：**v{N.M}-{task-name}.md**
如需修改版本号，请输入（格式 vN.M，如 v2.0）；否则直接回复"继续"。
---

         **⚠️ HUMAN GATE — END YOUR TURN HERE. Wait for user response.**
         - If user provides a version (matches `v\d+\.\d+`): run `bash "$SDD_ROOT/sdd.sh" discover "$TARGET_DIR" --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>" --version "<user-version>" [--context "<path>"]`
         - If user says "继续" or anything else: run `bash "$SDD_ROOT/sdd.sh" discover "$TARGET_DIR" --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>" [--context "<path>"]`
         Read the `## SPEC CREATION PROMPT` output and the created Spec file. Help the user fill in Research Findings and initial Open Questions.
6. Explain: "Run /sdd-riper again to enter Workflow Mode for this task"

## Workflow Mode (if B selected)
1. Run: `bash "$SDD_ROOT/sdd.sh" resume "$_PROJECT_ROOT"`
2. Read the `LATEST_SPEC` and `PHASE_HINT` values from the resume output.
3. **If `PHASE_HINT=new_task` or `LATEST_SPEC=none`**: the previous task is fully archived or no spec exists.
   - **Context Bundle 更新**：Check whether `$_PROJECT_ROOT/mydocs/archive/` contains any `.md` files (excluding `.gitkeep`).
     - If archive has files: run `bash "$SDD_ROOT/sdd.sh" build-context-bundle "$_PROJECT_ROOT"`. Parse `SDD_OUTPUT_PATH:` from the output to get `CONTEXT_PATH`. Then follow the AI 指令 printed in the output: read the listed source files and use the Write tool to create the context bundle at `CONTEXT_PATH`. If command fails, proceed without context.
     - If archive is empty: check if `$_PROJECT_ROOT/mydocs/context/` has any `.md` files; if yes use the most recently modified one as `CONTEXT_PATH`; if no, proceed without context.
   - Use `AskUserQuestion`:
     > 上一个任务已归档，Context Bundle 已更新。准备开始新任务。
     > 请提供以下信息：
     > - task name（kebab-case，如 user-login）
     > - requirement：这次要做什么
     > - goal：最终要达到什么结果
     > - constraints：约束；没有就写 none
     > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user to provide all 4 items. If fewer than 4 provided, re-ask for missing ones — do NOT infer or skip.
   - Once all 4 items received: check `$_PROJECT_ROOT/mydocs/specs/` for existing files matching `*-<task-name>.md` to determine the next auto-incremented version. Output to user and END YOUR TURN:

---
即将创建 Spec：**v{N.M}-{task-name}.md**
如需修改版本号，请输入（格式 vN.M，如 v2.0）；否则直接回复"继续"。
---

     **⚠️ HUMAN GATE — END YOUR TURN HERE. Wait for user response.**
     - If user provides a version: run `bash "$SDD_ROOT/sdd.sh" discover "$_PROJECT_ROOT" --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>" --version "<user-version>" [--context "<CONTEXT_PATH>"]`
     - If user says "继续" or anything else: run `bash "$SDD_ROOT/sdd.sh" discover "$_PROJECT_ROOT" --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>" [--context "<CONTEXT_PATH>"]`
     Read the created Spec and help fill Research Findings.
   - If user says they don't want a new task: end the session.
4. Otherwise (active spec found): Read the spec file content using the Read tool.
5. Also read CodeMap if HAS_CODEMAP=yes, ProjectMap if HAS_PROJECTMAP=yes.
   **CodeMap 复用规则**:
   - 若 HAS_CODEMAP=yes：优先读取现有 CodeMap，并判断其是否仍能正确描述当前模块；不要默认重建。
   - 若当前任务复杂且 HAS_CODEMAP=no：在进入深入 Research / Plan 前，建议调用 `create-codemap` 为相关模块补建 CodeMap。
   - 若已有 CodeMap 但发现入口点、核心调用链、外部依赖或风险描述已失真：在任务收尾时更新现有 CodeMap，而不是新建另一份同模块地图。
   **上下文分层加载规则**（热/温/冷三层）:
   - **热层**（每轮必带）: 当前阶段活跃 Spec 区块 + Plan（若已 Approved）
   - **温层**（切阶段时按需）: 每个阶段进入时参照以下预热清单自动加载
     - Research: CodeMap（若存在）
     - Plan: CodeMap + Innovate Options
     - Execute: Plan 全文 + CodeMap
     - Review: Plan 全文 + Execute Log
     - Archive: Review Summary
   - **冷层**（默认不带）: 历史 Spec 全文、archive 文件、其他任务 Spec、context 目录内容
6. **Phase Routing** — based on `PHASE_HINT`:
   - If `PHASE_HINT` is one of `research`, `innovate`, `plan`, `execute`, `review`, `archive`:
     Output to user (plain text, no tool call):
     > Context loaded: {spec name}, Phase hint: {PHASE_HINT}
     > 当前阶段已自动识别为 **{PHASE_HINT}**，直接进入该阶段。如需切换阶段，请告知。

     Then **immediately jump to that phase's instruction section** — do NOT show the A-F menu, do NOT call `AskUserQuestion`.

   - If `PHASE_HINT` is empty, unknown, or ambiguous: Use `AskUserQuestion`:
     > Context loaded: {spec name}, Phase hint: {PHASE_HINT}
     > Which RIPER phase are you working on?
     > A) Research — clarify requirements  
     > B) Innovate — explore solution options  
     > C) Plan — atomic execution plan (human gate required)  
     > D) Execute — implement approved plan  
     > E) Review — verify against Spec  
     > F) Archive — finalize and archive

     Then jump to the chosen phase's instruction section.
7. Jump to the chosen phase's instruction section below.

## Research Phase Instructions
- **Goal**: Clarify requirements, surface unknowns, align on Spec
- **Mandatory output format (4 sections)**:
  1. **Requirement Restatement** — restate in your own words
  2. **Open Questions** — unknowns that block progress
  3. **Confirmed Facts** — what you know for certain
  4. **Spec Writeback** — what to add back to the Spec
- **CodeMap 检查**：若任务涉及陌生或复杂模块，先检查是否已有对应 CodeMap。已有则优先复用；没有且结构复杂，再调用 `create-codemap`。Research 结束时要明确记录“本次是否依赖了 CodeMap / 是否需要在任务结束后回写 CodeMap”。
- **Next steps**: Offer to update Spec §6 Research Findings.
- **Completion gate**: All Open Questions resolved or explicitly deferred. DO NOT auto-advance.

## Innovate Phase Instructions
- **Goal**: Generate and compare solution options
- **Rules**:
  - Complex tasks: ≥2 options, each with Pros / Cons / Risk / Recommendation
  - Simple tasks: allowed `Innovate: Skipped, Reason: <why>`
- **Next steps**: Ask developer which option they choose.
- Update Spec §7 Innovate Options with the chosen approach. DO NOT auto-advance.

## Plan Phase Instructions — HUMAN GATE ⚠️
- **Goal**: Atomic execution plan
- **CodeMap 检查**：若 Plan 涉及的模块已有 CodeMap，先核对计划是否仍符合该地图；若你预期本次实现会改变入口点、核心调用链、外部依赖或风险项，请在 Plan 中明确加入“更新 CodeMap”的收尾步骤。
- **Output format**:
  ```markdown
  ## Plan
  - [ ] Step 1: <file path> — <what to change> — <acceptance condition>
  - [ ] Step 2: ...
  ```
- After generating plan, **MANDATORY** AskUserQuestion:
  > ⚠️ Plan Review Gate
  > Review each step carefully. Once approved, Execute follows the plan exactly.
  > No silent deviations allowed.
  >
  > A) **Plan Approved** — I have reviewed it. Begin Execute.
  > B) **Revise Plan** — [I will describe what needs to change]
  > C) **Abort** — Stop here
- ONLY proceed if user selects A. Write `Plan Approved By: <user>` + `Approved At: <timestamp>` to Spec §8. DO NOT auto-advance.

## Execute Phase Instructions
- **Goal**: Strict plan implementation
- **Rules**:
  - Follow Plan steps in order
  - Record every deviation in Execute Log
  - If a step is found to be invalid: STOP, return to Plan phase
  - NEVER silently deviate from Plan
  - Do not update CodeMap in the middle of unstable implementation; first make the code stable, then decide whether CodeMap needs reverse sync
- **After each step**: brief log entry AND append to `mydocs/evidence/{spec-slug}/execute.log` (append-only):
  ```
  ---
  Step N: {步骤描述}
  Status: DONE | DEVIATED | BLOCKED
  Output: {命令输出摘要或关键变更}
  Deviation: {若有偏差，说明原因} | none
  Timestamp: {ISO 8601, e.g. 2026-04-20T10:30:00Z}
  ---
  ```
  Where `{spec-slug}` = current Spec filename without `.md` (e.g. `v1.1-user-login`). Create the directory if it doesn't exist.
- **When complete**: summarize Change Summary + Deviations from Plan. DO NOT auto-advance.

## Review Phase Instructions
- **Goal**: Verify implementation against Spec
- **Mandatory output**:
  ```markdown
  ## Review Report
  Spec vs Code: [comparison]
  Deviations: [list or "none"]
  Remaining Risks: [list or "none"]
  Verdict: PASS | PASS_WITH_CONCERNS | FAIL
  ```
- **CodeMap reverse-sync check**: Before final verdict, explicitly answer: did this task change entry points, core call chain, external dependencies, or module risks? If yes, update the corresponding CodeMap first and mention that sync in the review summary.
- **Forbidden**: "looks good" or vague summaries without evidence
- **Next steps**: Offer to update Spec §10 Review Verdict. DO NOT auto-advance.

## Archive Phase Instructions
1. **Run**: `bash "$SDD_ROOT/sdd.sh" archive "$_PROJECT_ROOT" "<spec-name>"` — creates skeleton files from templates. Note the `Original spec preserved:` path in output.
2. **Read** the source Spec file (the path printed as `Original spec preserved: ...`).
3. **Fill `_human.md`** — use Edit/Write tool to replace every `<!-- ... -->` placeholder with real content extracted from the Spec:
   - `## 目标摘要`: 1-sentence summary from Spec `goal` frontmatter or Requirement Restatement section.
   - `## 最终方案`: which Innovate option was chosen and why (from Innovate Options section).
   - `## 关键决策`: key technical/product decisions and rationale (from Plan / key decision points).
   - `## 执行摘要`: what was actually done — condensed summary, not a step-by-step log (from Execute Log).
   - `## Review 结论`: final verdict and any residual risks (from Review Summary / Verdict section).
4. **Fill `_llm.md`** — use Edit/Write tool to replace every `<!-- ... -->` placeholder:
   - `## 项目背景（高密度）`: key constraints, boundaries, known limitations (from Spec constraints + Assumptions).
   - `## 核心数据结构`: critical interfaces, data formats, field conventions mentioned in Plan or Execute Log.
   - `## 调用链路摘要`: compressed description of the key execution path (from Plan steps + Execute Log).
   - `## 坑点与风险`: resolved Open Questions, issues hit during Execute, non-obvious gotchas.
   - `## 约束清单`: what must NOT be changed — from Spec constraints field + Plan "Must NOT" items.
5. **Verify**: confirm neither file contains any remaining `<!-- ... -->` placeholder comments. Show both files.

## Completion Status Protocol
When completing any phase or the full workflow, report status:
- **DONE** — All steps completed, evidence provided
- **DONE_WITH_CONCERNS** — Completed with issues to note. List each.
- **BLOCKED** — Cannot proceed. State what blocks and what was tried.
- **NEEDS_CONTEXT** — Missing info needed. State exactly what.

## AI 驱动命令

以下命令由 shell 脚本生成结构化 Prompt，AI 读取后执行对应分析/填写任务。

### 产出物命名规则

所有产出物均采用 `v{N}.{M}-{name}.md` 格式（kebab-case），版本号自动递增：

| 产出物 | 路径 | 命名示例 |
|---|---|---|
| Spec | `mydocs/specs/` | `v1.0-user-login.md`, `v1.1-user-login.md` |
| CodeMap | `mydocs/codemap/` | `v1.0-auth.md`, `v1.1-auth.md` |
| Context Bundle | `mydocs/context/` | `v1.0-context-bundle.md` |
| Archive | `mydocs/archive/` | `v1.1-user-login-human.md`, `v1.1-user-login-llm.md` |
| Evidence | `mydocs/evidence/` | `{spec-slug}/execute.log`（append-only） |
| ProjectMap | `mydocs/projectmap.md` | 固定单文件，不版本化 |

- **版本递增**：每次对同名产出物执行创建命令时，minor 自动 +1（`v1.9 → v1.10`，不进位）
- **手动指定**：`discover`、`new-codemap`、`build-context-bundle` 支持 `--version v{N}.{M}` 覆盖
- **archive**：自动继承来源 Spec 的版本号，无需手动指定
- **旧版保留**：递增时旧文件不删除，历史可追溯
- **resume**：自动读取最近修改任务的最高版本 Spec

### review-execute（P0 三轴质量筛查）
- **触发时机**：进入 Review 阶段时
- **命令**：
  ```bash
  bash "$SDD_ROOT/sdd.sh" review-execute "$_PROJECT_ROOT" \
    --log "$_PROJECT_ROOT/mydocs/evidence/{spec-slug}/execute.log"
  ```
  其中 `{spec-slug}` = 当前 Spec 文件名去掉 `.md`（如 `v1.1-user-login`）。若不传 `--log`，脚本将自动推断路径；若 log 文件不存在，降级读取 Spec 内 Execute Log 区块。
- **AI 行为**：读取命令输出的结构化 Prompt，执行三轴对照分析，填写 Spec §10 Review Report
- **三轴**：轴1=Spec Plan / 轴2=Code Diff / 轴3=Execute Log（来自 `evidence/{spec-slug}/execute.log`）

### discover（P1b 首版 Spec 创建 / Pre-Research 入口）
- **触发时机**：Setup Mode 中用户选择"创建首个 Spec"时
- **命令**：`bash "$SDD_ROOT/sdd.sh" discover "$_PROJECT_ROOT" --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>"`
- **AI 行为**：读取命令输出的 `## SPEC CREATION PROMPT`，读取创建的 Spec 文件，填写 Research Findings 区块和初始 Open Questions
- **注意**：`--task-name` 为必填参数；此命令会写入 `mydocs/specs/v{N}.{M}-<task-name>.md`（版本自动递增）；支持 `--version v{N}.{M}` 手动指定

### create-codemap（P2a AI 驱动代码库扫描）
- **触发时机**：Research 或 Plan 阶段，需要建立代码库架构视图时
- **命令**：`bash "$SDD_ROOT/sdd.sh" create-codemap "$_PROJECT_ROOT" [--module <name>]`
- **AI 行为**：读取 Prompt 中的文件树和 CodeMap 模板，分析代码库结构，填写 CodeMap 并写入 `mydocs/codemap/<module>.md`
- **治理规则**：若目标模块已有 CodeMap，优先进入 UPDATE 模式，对现有地图做增量更新；不要为同一模块重复创建多份 CodeMap。

### build-context-bundle（P2b AI 提炼上下文包）
- **触发时机**：任务开始前，需要从历史文档中提炼上下文时
- **命令**：`bash "$SDD_ROOT/sdd.sh" build-context-bundle "$_PROJECT_ROOT" [--out <name>]`
- **AI 行为**：读取 Prompt 中的 mydocs 文件清单，阅读相关文档，按 Context Bundle 模板提炼结构化上下文，写入 `mydocs/context/v{N}.{M}-<bundle-name>.md`（版本自动递增）

### debug（P3a 日志驱动 Bug 定位）
- **触发时机**：Execute 阶段遇到 Bug，需要定位根本原因时
- **命令**：`bash "$SDD_ROOT/sdd.sh" debug "$_PROJECT_ROOT" [--log <log-file>] [--error "<error-msg>"]`
- **AI 行为**：读取输出的 `## DEBUG PROMPT`，分析错误信息、日志和执行步骤，定位 Root Cause 后提出最小修复方案
- **铁律**：禁止在未明确 Root Cause 的情况下提出修复方案

### create-projectmap（P3b AI 驱动 ProjectMap 生成）
- **触发时机**：任务涉及多仓库/多模块，需要建立全局地图时
- **命令**：`bash "$SDD_ROOT/sdd.sh" create-projectmap "$_PROJECT_ROOT" [--repos <repo1,repo2>] [--force]`
- **AI 行为**：读取输出的 `## CREATE PROJECTMAP PROMPT`，根据项目信息和模板格式，填写 ProjectMap 并写入 `mydocs/projectmap.md`
- **注意**：若 `mydocs/projectmap.md` 已存在，需加 `--force` 才能覆盖（exit 2 提示）
