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
CONFIG_DOCS_DIR=$(grep '^DOCS_DIR=' "$_PROJECT_ROOT/.sdd-config" 2>/dev/null | head -1 | sed 's/^DOCS_DIR=//; s/\r$//' | sed 's/^"//; s/"$//' || true)
[ -n "$CONFIG_DOCS_DIR" ] && [ -d "$_PROJECT_ROOT/$CONFIG_DOCS_DIR" ] && HAS_SDD=yes
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
A) 初始化项目 SDD 结构（默认创建 mydocs/，也可通过 .sdd-config 指定 docs 目录，并生成 AI 配置文件）
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
4. **CodeMap 引导（仅当满足条件时）**: Determine the project's docs root from `.sdd-config` if present; otherwise use `mydocs/`. Then check whether the `init` command output contains `[SDD-RIPER]`, and whether `<DOCS_ROOT>/codemap/` **already has** `.md` files (excluding `.gitkeep`).
   - If init output does **not** contain `[SDD-RIPER]`, OR `<DOCS_ROOT>/codemap/` **already has** `.md` files (excluding `.gitkeep`): skip this step and go to step 5.
   - If init output **contains** `[SDD-RIPER]` AND `<DOCS_ROOT>/codemap/` has **no** `.md` files: use `AskUserQuestion`:
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
      b. **Context Bundle 引导**: Determine the docs root from `.sdd-config` if present; otherwise use `mydocs/`. Check whether `<DOCS_ROOT>/context/` is missing or has **no** `.md` files (excluding `.gitkeep`).
         - If `<DOCS_ROOT>/context/` is missing or has **no** `.md` files (excluding `.gitkeep`): use `AskUserQuestion`:
           > 当前 docs 目录下的 `context/` 为空，尚无 Context Bundle。
           > Context Bundle 可将当前 Spec、CodeMap 及关联文件打包，作为 discover 的 `--context` 背景材料，帮助 AI 更准确理解任务背景。
           > 是否现在构建 Context Bundle？
           > A) 是，立即构建
           > B) 否，跳过
           > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user's A/B response before running any command.
             - If A: run `bash "$SDD_ROOT/sdd.sh" build-context-bundle "$TARGET_DIR"`. Parse `SDD_OUTPUT_PATH:` from the output to get `CONTEXT_PATH`. Then follow the AI 指令 printed in the output: read the listed source files and use the Write tool to create the context bundle at `CONTEXT_PATH`. If the command fails, explain the error and proceed without `--context`.
            - If B: proceed without `--context`.
         - If `<DOCS_ROOT>/context/` **already has** `.md` files: use the most recently modified `.md` file path as `--context <path>` in the discover command below.
      c. Determine the docs root from `.sdd-config` if present; otherwise use `mydocs/`. Check `<DOCS_ROOT>/specs/` for existing files matching `*-<task-name>.md` to determine the next auto-incremented version (v1.0 if none exist, otherwise v{N}.{M+1}). Output to user and END YOUR TURN:

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
1. Run: `bash "<SDD_ROOT>/sdd.sh" resume "<PROJECT_ROOT>"`
   > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
2. Read the `LATEST_SPEC` and `PHASE_HINT` values from the resume output.
3. **Health Check** (optional): Run `bash "<SDD_ROOT>/sdd.sh" status "<PROJECT_ROOT>"` to verify project structure integrity at the start of a workflow session.
   > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
4. **If `PHASE_HINT=new_task` or `LATEST_SPEC=none`**: the previous task is fully archived or no spec exists.
    - **Defect vs new task routing**：如果是归档后人工发现的缺陷修复，**不要**直接按新任务创建 Spec。唯一入口是 `bash "<SDD_ROOT>/sdd.sh" reopen "<PROJECT_ROOT>" "<task-slug>"`，由它创建 patch Spec 并关联归档上下文。
      > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
    - 只有在这是一个真正的新需求 / 新任务时，才继续下面的新任务创建流程。
    - **Context Bundle 更新**：Determine the docs root from `.sdd-config` if present; otherwise use `mydocs/`. Check whether `<DOCS_ROOT>/archive/` contains any `.md` files (excluding `.gitkeep`).
      - If archive has files: run `bash "<SDD_ROOT>/sdd.sh" build-context-bundle "<PROJECT_ROOT>"`. Parse `SDD_OUTPUT_PATH:` from the output to get `CONTEXT_PATH`. Then follow the AI 指令 printed in the output: read the listed source files and use the Write tool to create the context bundle at `CONTEXT_PATH`. If command fails, proceed without context.
         > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
      - If archive is empty: check if `<DOCS_ROOT>/context/` has any `.md` files; if yes use the most recently modified one as `CONTEXT_PATH`; if no, proceed without context.
   - Use `AskUserQuestion`:
     > 上一个任务已归档，Context Bundle 已更新。准备开始新任务。
     > 请提供以下信息：
     > - task name（kebab-case，如 user-login）
     > - requirement：这次要做什么
     > - goal：最终要达到什么结果
     > - constraints：约束；没有就写 none
     > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user to provide all 4 items. If fewer than 4 provided, re-ask for missing ones — do NOT infer or skip.
    - Once all 4 items received: determine the docs root from `.sdd-config` if present; otherwise use `mydocs/`. Check `<DOCS_ROOT>/specs/` for existing files matching `*-<task-name>.md` to determine the next auto-incremented version. Output to user and END YOUR TURN:

---
即将创建 Spec：**v{N.M}-{task-name}.md**
如需修改版本号，请输入（格式 vN.M，如 v2.0）；否则直接回复"继续"。
---

      **⚠️ HUMAN GATE — END YOUR TURN HERE. Wait for user response.**
      - If user provides a version: run `bash "<SDD_ROOT>/sdd.sh" discover "<PROJECT_ROOT>" --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>" --version "<user-version>" [--context "<CONTEXT_PATH>"]`
        > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
      - If user says "继续" or anything else: run `bash "<SDD_ROOT>/sdd.sh" discover "<PROJECT_ROOT>" --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>" [--context "<CONTEXT_PATH>"]`
        > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
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
   - If `PHASE_HINT` is one of `execute`, `review`, `archive`:
      > Note: `resume` 已先完成状态映射。例如 `status: approved → review`、`status: done → archive`、`draft + Plan Approved By → execute`。这里处理的是映射后的 `PHASE_HINT`，不是原始 `status`。
       Output to user (plain text, no tool call):
      > Context loaded: {spec name}, Phase hint: {PHASE_HINT}
      > 当前阶段已自动识别为 **{PHASE_HINT}**，直接进入该阶段。如需切换阶段，请告知。

      Then **immediately jump to that phase's instruction section** — do NOT show the A-F menu, do NOT call `AskUserQuestion`.

   - If `PHASE_HINT` is `research_or_plan`:
      Use `AskUserQuestion`:
      > Context loaded: {spec name}, Phase hint: research_or_plan
      > 当前任务尚处于前期收敛阶段。请选择接下来要进入的环节：
      > A) Research — clarify requirements and open questions
      > B) Innovate — compare solution options
      > C) Plan — draft an atomic execution plan

      Then jump to the chosen phase's instruction section.

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
- **§5 Invocation Alignment Check** (output at the end of EVERY Research round, not just phase end):
  ```
  ### §5 Invocation Alignment Check
  - **Original invocation intent** (from opening message): [1-2 sentence restatement]
  - **Current research direction**: [1-2 sentence summary of what was just researched]
  - **Verdict**: ALIGNED | DRIFTED
  - **If DRIFTED**: [describe the gap; research may continue but deviation is logged]
  ```
  Drift does NOT block Research. Log it and continue. No extra human confirmation required.
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
- **Spec Coverage Gate** (run before requesting Plan Approved):
  Output a Coverage Matrix table. List every bullet from §2 Requirement Restatement and §3 Constraints in the Spec. Mark each as:
  - `✅` Covered by the plan
  - `❌` Not covered (BLOCKS plan approval — must be addressed before requesting Plan Approved)
  - `⚠️` Partially covered (note what's missing)
  If any `❌` exists, the plan is **BLOCKED**. Revise the plan to cover the missing items, then re-output the Coverage Matrix.
  Human can override a BLOCK by explicitly saying "Approve anyway".
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
  - **Defect vs Deviation vs Enhancement**:
    - **Defect**: implementation result is wrong, but the current Step goal and original task intent still hold → enter `BUGFIX`
    - **Deviation**: implementing or fixing the Step would require changes outside the current Step's explicitly declared file / directory / module boundary, or would invalidate downstream Plan steps → escalate to `DEVIATED_MAJOR`
    - **Enhancement / New Requirement**: request changes original task intent, expands archived scope, or adds new acceptance criteria → MUST NOT be handled via `BUGFIX`; return to Research / Plan or start a new task
  - **BUGFIX entry**: if the current Step hits a runtime error, assertion failure, test failure, or other defect while the Step goal remains valid, enter `BUGFIX`
  - **BUGFIX Step Scope Rule**: every Plan Step must explicitly declare file paths, directory boundaries, or module boundaries; `BUGFIX` may modify only that declared boundary. If the Step lacks an explicit boundary, the Plan is incomplete → return to Plan before continuing.
   - **BUGFIX loop**:
     1. Before **every** retry, run `bash "<SDD_ROOT>/sdd.sh" debug "<PROJECT_ROOT>" [--log <log-file>] [--error "<error-msg>"]`
        > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
     2. Read the `## DEBUG PROMPT` output, identify Root Cause, and apply the smallest fix that stays within the current Step boundary
    3. If `debug` is inconclusive, fails, or the required fix crosses the current Step boundary → escalate immediately to `DEVIATED_MAJOR`
    4. Maximum **3 BUGFIX retries** per defect instance
    5. If still failing after 3 retries → log `[BUGFIX_ESCALATED]`, stop, and require human intervention
  - **BUGFIX status semantics**:
    - `BUGFIX`: a defect was found and fixed within the current Step boundary
    - `BUGFIX_ESCALATED`: the defect could not be resolved autonomously within 3 retries
  - **DEVIATED_MINOR**: Step goal is still achievable via a different implementation approach → log to `execute.log` with `[DEVIATED_MINOR]` tag and continue to next step
  - **DEVIATED_MAJOR**: Step goal is no longer valid, OR achieving it would require changes to other Plan steps → STOP immediately, log with `[DEVIATED_MAJOR]` tag, return to Plan phase, explicitly state which downstream steps are affected
  - Rubric: If in doubt, escalate to DEVIATED_MAJOR
  - NEVER silently deviate from Plan
  - Do not update CodeMap in the middle of unstable implementation; first make the code stable, then decide whether CodeMap needs reverse sync
- **After each step**: brief log entry AND append to `<docs-root>/evidence/{spec-slug}/execute.log` (append-only; docs root defaults to `mydocs/`, or the directory configured in `.sdd-config`):
  ```
  ---
  Step N: {步骤描述}
  Status: DONE | BUGFIX | BUGFIX_ESCALATED | DEVIATED_MINOR | DEVIATED_MAJOR | BLOCKED
  Output: {命令输出摘要或关键变更}
  Deviation: {若有偏差，说明原因} | none
  Timestamp: {ISO 8601, e.g. 2026-04-20T10:30:00Z}
  ---
  ```
  Where `{spec-slug}` = current Spec filename without `.md` (e.g. `v1.1-user-login`). Create the directory if it doesn't exist.
- **When complete**: summarize Change Summary + Deviations from Plan. DO NOT auto-advance.

## Review Phase Instructions
- **Goal**: Verify implementation against Spec. Review is a **judge, not a programmer** — it reads and verdicts. It does NOT fix code in-place.
- **Write permissions during Review**:
  - ✅ MAY write: §10 Review Verdict in Spec (verdict + timestamp + pass number, append-only)
  - ✅ MAY write: CodeMap — ONLY if this task changed entry points, core call chain, external dependencies, or risk items (update CodeMap BEFORE issuing verdict, note the sync in the report)
  - ❌ MUST NOT write: code files, new features, bug fixes, Plan steps
- **Trigger**: Run `bash "<SDD_ROOT>/sdd.sh" review-execute "<PROJECT_ROOT>" --log "<PROJECT_ROOT>/<docs-root>/evidence/{spec-slug}/execute.log"`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **Mandatory 4-axis output format**:
  ```markdown
  ## Review Report (Pass N — YYYY-MM-DDTHH:MM:SSZ)

  ### Axis 0 — Invocation Integrity
  Assessment: [does implementation serve original requirement/constraints?]
  Finding: ALIGNED | DRIFTED | VIOLATED | UNVERIFIABLE

  ### Axis 1 — Spec Plan Coverage
  [Per Plan step: ✅ implemented / ❌ missing / ⚠️ partial]
  Finding: FULL | PARTIAL | MISSING

  ### Axis 2 — Code Diff Scope
  [Within-Plan changes vs. out-of-Plan changes]
  Finding: IN_SCOPE | OUT_OF_SCOPE_MINOR | OUT_OF_SCOPE_MAJOR

  ### Axis 3 — Execute Log Fidelity
  [Log deviations vs. actual code — match?]
  Finding: FAITHFUL | DISCREPANCY

  ### Defect Table
  | Defect | Axis | Severity | Rollback Target |
  |--------|------|----------|-----------------|

  ### Verdict
  PASS | PASS_WITH_CONCERNS | FAIL_CODE | FAIL_PLAN | FAIL_SPEC
  (Precedence if multiple failures: FAIL_SPEC > FAIL_PLAN > FAIL_CODE)

  ### Rollback Instruction (if FAIL)
  - FAIL_CODE → Developer reopens Execute. Re-execute steps: [list]
  - FAIL_PLAN → Developer reopens Plan. Issues: [describe]
  - FAIL_SPEC → Developer reopens Research + Plan. Concern: [describe]

  ### Risk Register (if PASS_WITH_CONCERNS)
  | Risk | Axis | Severity | Mitigation |
  |------|------|----------|------------|
  ```
- **CodeMap reverse-sync check**: Before issuing verdict, explicitly answer: did this task change entry points, core call chain, external dependencies, or module risks? If yes → update the corresponding CodeMap first, then note the sync in the report.
- **Forbidden**: vague summaries ("looks good"), auto-fixing code, auto-advancing to Archive
- **Pass numbering**: Each Review run increments N. Append to §10 as `Review Pass N — <ISO-8601 timestamp> — <VERDICT>`. Do NOT overwrite previous passes.
- **After verdict**: Offer to update §10 Review Verdict with the full report. DO NOT auto-advance to Archive.

#### Axis Roles
- **Axis 2 — Code Diff Scope** `[PRIMARY]`: This is Review's PRIMARY responsibility — the full diff audit that can ONLY be done here. Treat any Axis 2 finding with the highest weight.
  > ⚠️ Known limitation: Code Diff covers only HEAD~1..HEAD (last commit). For multi-commit tasks, provide a broader diff. Full-task diff support is a future enhancement.
- **Axis 0 — Invocation Integrity** `[CONFIRMATION]`: Safety net. If this fails at Review, it means Gate 1 (Invocation Alignment Check in Research) did not catch the drift.
- **Axis 1 — Spec Plan Coverage** `[CONFIRMATION]`: Safety net. If this fails at Review, it means Gate 2 (Spec Coverage Gate in Plan) did not catch the gap.
- **Axis 3 — Execute Log Fidelity** `[CONFIRMATION]`: Safety net. If this fails at Review, it means Gate 3 (DEVIATED_MAJOR logging in Execute) did not catch the discrepancy.

When Axis 0, 1, or 3 produces a FAIL finding, append to your verdict output:
> ⚠️ UPSTREAM GATE FAILURE: This Axis [N] failure indicates the corresponding upstream gate (Gate [1/2/3]) did not catch this issue during [Research/Plan/Execute]. Recommend a retrospective review of the upstream gate's effectiveness.

Verdict mapping for upstream FAIL:
- Axis 0 FAIL → `FAIL_SPEC`
- Axis 1 FAIL → `FAIL_PLAN`
- Axis 3 FAIL → `FAIL_CODE`

#### FAIL_CODE Auto-Remediation Loop
When verdict is `FAIL_CODE`, the orchestrator **automatically** re-invokes Execute phase (targeting only the failed steps identified in the verdict), then re-runs Review:
1. **Before each retry**: run `bash "<SDD_ROOT>/sdd.sh" debug "<PROJECT_ROOT>" --error "<FAIL_CODE finding summary>"` and read the Debug Prompt output. Do NOT retry Execute without first establishing Root Cause via `debug`.
   > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
2. Orchestrator re-invokes Execute phase for the specific steps listed in the FAIL_CODE Rollback Instruction
3. After Execute completes the fix, Review runs again (new Pass N+1)
4. Maximum **3 auto-remediation retries** (each preceded by `debug`)
5. If still `FAIL_CODE` after 3 retries → output `FAIL_CODE_ESCALATED` and require human intervention
6. `FAIL_PLAN` and `FAIL_SPEC` are **never auto-remediated** — always require human decision. Use `reopen` only after the task has been fully archived.


## Archive Phase Instructions
1. **Run**: `bash "<SDD_ROOT>/sdd.sh" archive "<PROJECT_ROOT>" "<spec-name>"` — creates skeleton files from templates. Note the `Original spec preserved:` path in output.
   > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
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
6. **Write back source spec status**: after both archive files are created and verified, update the source Spec frontmatter to `status: archived`. This state writeback happens last so half-finished archive artifacts never masquerade as a fully archived task.

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
| Spec | `<docs-root>/specs/` | `v1.0-user-login.md`, `v1.1-user-login.md` |
| CodeMap | `<docs-root>/codemap/` | `v1.0-auth.md`, `v1.1-auth.md` |
| Context Bundle | `<docs-root>/context/` | `v1.0-context-bundle.md` |
| Archive | `<docs-root>/archive/` | `v1.1-user-login-human.md`, `v1.1-user-login-llm.md` |
| Evidence | `<docs-root>/evidence/` | `{spec-slug}/execute.log`（append-only） |
| ProjectMap | `<docs-root>/projectmap.md` | 固定单文件，不版本化 |

- `<docs-root>` 默认为 `mydocs/`；若项目根存在 `.sdd-config` 且声明了 `DOCS_DIR=...`，则应改用该目录。

- **版本递增**：每次对同名产出物执行创建命令时，minor 自动 +1（`v1.9 → v1.10`，不进位）
- **手动指定**：`discover`、`new-codemap`、`build-context-bundle` 支持 `--version v{N}.{M}` 覆盖
- **archive**：自动继承来源 Spec 的版本号，无需手动指定
- **旧版保留**：递增时旧文件不删除，历史可追溯
- **resume**：自动读取最近修改任务的最高版本 Spec

### review-execute（P0 四轴质量筛查）
- **触发时机**：进入 Review 阶段时
- **命令**：
  ```bash
  bash "<SDD_ROOT>/sdd.sh" review-execute "<PROJECT_ROOT>" \
    --log "<PROJECT_ROOT>/<docs-root>/evidence/{spec-slug}/execute.log"
  ```
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
  支持可选参数：`--spec <path>`、`--log <path>`、`--diff-base <rev>`。
  其中 `{spec-slug}` = 当前 Spec 文件名去掉 `.md`（如 `v1.1-user-login`）。若不传 `--log`，脚本将自动推断路径；若 log 文件不存在，降级读取 Spec 内 Execute Log 区块。
- **AI 行为**：读取命令输出的结构化 Prompt，执行四轴对照分析，填写 Spec §10 Review Report
- **四轴**：轴0=Invocation Integrity / 轴1=Spec Plan / 轴2=Code Diff / 轴3=Execute Log（来自 `evidence/{spec-slug}/execute.log`）

### discover（P1b 首版 Spec 创建 / Pre-Research 入口）
- **触发时机**：Setup Mode 中用户选择"创建首个 Spec"时
- **命令**：`bash "<SDD_ROOT>/sdd.sh" discover "<PROJECT_ROOT>" --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>"`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **AI 行为**：读取命令输出的 `## SPEC CREATION PROMPT`，读取创建的 Spec 文件，填写 Research Findings 区块和初始 Open Questions
- **注意**：`--task-name` 为必填参数；此命令会写入 `<docs-root>/specs/v{N}.{M}-<task-name>.md`（版本自动递增，`<docs-root>` 默认为 `mydocs/`，可由 `.sdd-config` 指定）；支持 `--version v{N}.{M}` 手动指定

### create-codemap（P2a AI 驱动代码库扫描）
- **触发时机**：Research 或 Plan 阶段，需要建立代码库架构视图时
- **命令**：`bash "<SDD_ROOT>/sdd.sh" create-codemap "<PROJECT_ROOT>" [--module <name>]`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **AI 行为**：读取 Prompt 中的文件树和 CodeMap 模板，分析代码库结构，填写 CodeMap 并写入 `<docs-root>/codemap/<module>.md`
- **治理规则**：若目标模块已有 CodeMap，优先进入 UPDATE 模式，对现有地图做增量更新；不要为同一模块重复创建多份 CodeMap。

### build-context-bundle（P2b AI 提炼上下文包）
- **触发时机**：任务开始前，用户手头有外部材料（如 UI 稿、PRD、会议记录）或需要从项目文档提炼上下文时；典型触发如“我有设计稿要放进去”“PRD 文档怎么带进 context”
- **命令**：`bash "<SDD_ROOT>/sdd.sh" build-context-bundle "<PROJECT_ROOT>" [--out <name>] [--sources <dir>]`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **AI 行为**：读取 Prompt 中列出的外部 source materials（若提供 `--sources <dir>`）以及 docs-root 项目背景文件，按 Context Bundle 模板做两层提炼：先吸收外部材料，再补齐项目文档背景，写入 `<docs-root>/context/v{N}.{M}-<bundle-name>.md`（版本自动递增；支持 `--version v{N}.{M}` 手动指定）
- **跟进引导**：生成完成后，可询问用户是否要把该 Context Bundle 路径回填到当前 Spec 的 `context-source:` 字段；这是 skill 引导动作，不是 CLI 参数。

### debug（P3a 日志驱动 Bug 定位）
- **触发时机**：Execute 阶段进入 `BUGFIX`，或 Review 阶段触发 `FAIL_CODE` 自动修复重试时；每次 retry 前都必须先运行 `debug` 定位根本原因
- **命令**：`bash "<SDD_ROOT>/sdd.sh" debug "<PROJECT_ROOT>" [--log <log-file>] [--error "<error-msg>"]`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **AI 行为**：读取输出的 `## DEBUG PROMPT`，分析错误信息、日志和执行步骤，定位 Root Cause 后提出最小修复方案；若无法建立 Root Cause，则不得继续 BUGFIX / FAIL_CODE 重试
- **铁律**：禁止在未明确 Root Cause 的情况下提出修复方案

### create-projectmap（P3b AI 驱动 ProjectMap 生成）
- **触发时机**：任务涉及多仓库/多模块，需要建立全局地图时
- **命令**：`bash "<SDD_ROOT>/sdd.sh" create-projectmap "<PROJECT_ROOT>" [--repos <repo1,repo2>] [--force]`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **AI 行为**：读取输出的 `## CREATE PROJECTMAP PROMPT`，根据项目信息和模板格式，填写 ProjectMap 并写入 `<docs-root>/projectmap.md`
- **注意**：若 `<docs-root>/projectmap.md` 已存在，需加 `--force` 才能覆盖（exit 2 提示）

### reopen（P4 归档后缺陷回溯入口）
- **触发时机**：任务已 Archive 完成，随后由人工测试或后续验证发现 defect，需要在不改变原始任务意图的前提下创建 patch Spec 继续修复时
- **命令**：`bash "<SDD_ROOT>/sdd.sh" reopen "<PROJECT_ROOT>" "<task-slug>" [--defect "<defect-summary>"]`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **前置条件**：
  - 源 Spec 的 `status` 必须为 `archived`
  - `<docs-root>/archive/` 中必须存在对应的 `-llm.md` 或 `-human.md` 归档文件（优先使用 `-llm.md`，缺失则回退到 `-human.md`）
  - `<docs-root>/specs/` 中不得已存在同 slug 的更高版本且 `status != archived` 的 patch Spec；若存在，改为运行 `resume`
- **AI 行为**：命令成功后，读取新建 patch Spec 的 `reopened-from` 与 `context-source` 元数据，运行 `resume` 载入该 patch Spec，再在 §6 Research Findings 中记录归档上下文来源与缺陷来源。`reopen` 只用于 defect patch，不得借此扩大范围或引入新功能。
- **失败处理**：若输出提示 `Open patch spec already exists`，不要重复 reopen，改为运行 `bash "<SDD_ROOT>/sdd.sh" resume "<PROJECT_ROOT>"` 继续已有 patch Spec。
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.

### new-codemap（P5 空白 CodeMap 模板）
- **触发时机**：你只想先创建一个空白的版本化 CodeMap 文件，而不是让 AI 立即扫描代码库时
- **命令**：`bash "<SDD_ROOT>/sdd.sh" new-codemap "<PROJECT_ROOT>" "<module>" [--version v{N}.{M}] [--force]`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **AI 行为**：不扫描代码，不生成 Prompt；仅从模板创建空白文件，供后续人工或 AI 填写。

### new-projectmap（P6 空白 ProjectMap 模板）
- **触发时机**：你只想先创建一个空白的 ProjectMap 文件，而不是让 AI 立即生成完整全局地图时
- **命令**：`bash "<SDD_ROOT>/sdd.sh" new-projectmap "<PROJECT_ROOT>" [--repos <repo1,repo2>] [--force]`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **AI 行为**：不扫描多仓，不生成 Prompt；仅从模板创建空白 `projectmap.md`。
