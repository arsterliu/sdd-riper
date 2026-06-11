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
> **Windows launcher rule:** on Windows, do not call `bash "<SDD_ROOT>/sdd.sh" ...` directly. Use `& "<SDD_ROOT>/sdd.ps1" ...` instead. On macOS/Linux, keep using `bash "<SDD_ROOT>/sdd.sh" ...`.
> 
> ✅ Correct: `bash "C:/Users/liuyl/.config/opencode/skills/sdd-riper/sdd.sh" resume "D:/workspace/myproject"`
> ✅ Correct on Windows: `& "C:/Users/liuyl/.config/opencode/skills/sdd-riper/sdd.ps1" resume "D:/workspace/myproject"`
> ❌ Wrong: `bash "$SDD_ROOT/sdd.sh" resume "$_PROJECT_ROOT"`

> **Superpowers integration**: See `INTEGRATIONS.md` for the SDD ↔ superpowers integration map. The 6 inlined rules below (Step Granularity / Subagent Routing / TDD / Debug / Completion Verification / Pre-Archive Git Gate) are anchored to vendored skills under `vendored/superpowers/`; the inlined text is a fallback summary when neither global nor vendored skill is reachable.

## Mode Selection
After the preamble, output the following question in your response (as plain text, no tool call needed) and then END YOUR TURN immediately — do NOT proceed further until the user replies:

---
SDD-RIPER activated.
Project: {PROJECT_ROOT}
Status: {HAS_SDD=yes → "SDD structure found" | HAS_SDD=no → "Not yet initialized"}

{if HAS_SDD=yes → "已检测到 SDD 结构。通常应选 B 继续工作流；如需重建或修复 AI 配置，再选 A。A 会重新初始化（覆盖现有 AI 配置文件，docs 目录保留）。"}
{if HAS_SDD=no → "尚未初始化，建议先选 A 完成初始化，再选 B 开始任务。"}

请选择：
A) 重新初始化 / 修复 SDD 配置（覆盖现有 AI 配置文件；默认 docs 目录为 mydocs/，也可通过 .sdd-config 指定）
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

1. Use `AskUserQuestion` to ask for target directory (default: current project root). Store the user-selected directory as `TARGET_DIR` for all subsequent commands in this flow.
   > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user to provide target directory before continuing.
2. Run: `bash "<SDD_ROOT>/sdd.sh" init "<TARGET_DIR>"` (DO NOT use Write/Edit tools directly to create project files).
   > ⚠️ Replace `<SDD_ROOT>` and `<TARGET_DIR>` with actual paths from the preamble output / user input.
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
    - If user selects A: run `bash "<SDD_ROOT>/sdd.sh" create-codemap "<TARGET_DIR>"` (append `--module <name>` if module name was provided). Show command output. If command fails, explain the error and continue to step 5.
      > ⚠️ Replace `<SDD_ROOT>` and `<TARGET_DIR>` with actual paths from the preamble output / user input.
    - If user selects B: continue to step 5.
5. Use `AskUserQuestion`: "Create your first Spec now?"
   > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user's yes/no response.
   - If yes:
      a. Use `AskUserQuestion` to ask for task name, requirement (what needs to be built), goal, constraints (optional).
         > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user to provide all 4 items (task name, requirement, goal, constraints). If the user provides fewer than 4 items, re-ask for the missing ones — do NOT infer or skip.
      b. **Context Bundle 引导**: Use `AskUserQuestion`:
           > 开始创建 Spec 前：你是否有外部参考材料（如 PRD、设计稿、会议记录）需要一起带入任务背景？
           > A) 有，请提供目录路径：___
           > B) 没有，直接继续
           > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user's response before running any command.
             - If A (user provides path inline or in next message): run `bash "<SDD_ROOT>/sdd.sh" build-context-bundle "<TARGET_DIR>" --sources "<path>"`. Parse `SDD_OUTPUT_PATH:` from the output to get `CONTEXT_PATH`. Then follow the AI 指令 printed in the output: read the listed source files and use the Write tool to create the context bundle at `CONTEXT_PATH`. If the command fails, explain the error and proceed without `--context`.
             > ⚠️ Replace `<SDD_ROOT>` and `<TARGET_DIR>` with actual paths from the preamble output / user input.
             - If B: proceed without `--context`.
      c. Output to user and END YOUR TURN:

---
请为本次 Spec 指定版本号（格式 vN.M，如 v1.0）：
---

         **⚠️ HUMAN GATE — END YOUR TURN HERE. Wait for user response.**
         - Once user provides a version (matches `v\d+\.\d+`): run `bash "<SDD_ROOT>/sdd.sh" discover "<TARGET_DIR>" --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>" --version "<user-version>" [--context "<path>"]`
           > ⚠️ Replace `<SDD_ROOT>` and `<TARGET_DIR>` with actual paths from the preamble output / user input.
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
   - Use `AskUserQuestion`:
     > 上一个任务已归档，准备开始新任务。
     > 请提供以下信息（或选 C 退出）：
     > - task name（kebab-case，如 user-login）
     > - requirement：这次要做什么
     > - goal：最终要达到什么结果
     > - constraints：约束；没有就写 none
     >
     > C) 暂时不需要，结束本次会话
     > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user to provide all 4 items or select C. If user selects C: end the session. If fewer than 4 items provided, re-ask for missing ones — do NOT infer or skip.
   - Once all 4 items received: **Context Bundle 引导**: Use `AskUserQuestion`:
     > 开始创建 Spec 前：你是否有外部参考材料（如 PRD、设计稿、会议记录）需要一起带入任务背景？
     > A) 有，请提供目录路径：___
     > B) 没有，直接继续
     > **← HUMAN GATE**: STOP. Make no further tool calls. Wait for user's response before running any command.
       - If A (user provides path inline or in next message): run `bash "<SDD_ROOT>/sdd.sh" build-context-bundle "<PROJECT_ROOT>" --sources "<path>"`. Parse `SDD_OUTPUT_PATH:` from the output to get `CONTEXT_PATH`. Then follow the AI 指令 printed in the output: read the listed source files and use the Write tool to create the context bundle at `CONTEXT_PATH`. If command fails, proceed without context.
         > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
       - If B: proceed without `--context`.
    - Once context decision is made: output to user and END YOUR TURN:

---
请为本次 Spec 指定版本号（格式 vN.M，如 v1.0）：
---

      **⚠️ HUMAN GATE — END YOUR TURN HERE. Wait for user response.**
      - Once user provides a version: run `bash "<SDD_ROOT>/sdd.sh" discover "<PROJECT_ROOT>" --task-name "<name>" --requirement "<req>" --goal "<goal>" --constraints "<constraints>" --version "<user-version>" [--context "<CONTEXT_PATH>"]`
        > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
     Read the created Spec and help fill Research Findings.
5. Otherwise (active spec found): **按需读取 Spec，不要全量加载**。
   - 先只读 `## Summary` 区块（热区，3-5行）确认当前阶段与目标。
   - 再按 `SECTIONS_HINT` 列表读取对应区块（`resume` 输出中的 `SECTIONS_HINT` 字段）。
   - 仅在确实需要完整内容时才读完整 Spec（如 Review 阶段）。
   - 若 Spec 尚无 `## Summary` 区块（旧 Spec），则完整读取一次，并在本轮结束后补写 Summary。
   - **Micro 模式**：读取 `mode:` frontmatter 字段确认为 `micro` 后，跳过 Research / Innovate 阶段指令，直接路由到 Plan → Execute → Review（仅 Axis2）。
6. Also read CodeMap if HAS_CODEMAP=yes, ProjectMap if HAS_PROJECTMAP=yes.
   **CodeMap 复用规则**:
   - 若 HAS_CODEMAP=yes：优先读取现有 CodeMap，并判断其是否仍能正确描述当前模块；不要默认重建。
   - 若当前任务复杂且 HAS_CODEMAP=no：在进入深入 Research / Plan 前，建议调用 `create-codemap` 为相关模块补建 CodeMap。
   - 若已有 CodeMap 但发现入口点、核心调用链、外部依赖或风险描述已失真：在任务收尾时更新现有 CodeMap，而不是新建另一份同模块地图。
   **上下文分层加载规则**（热/温/冷三层）:
   - **热层**（每轮必带）: `## Summary` 区块（如存在）+ `SECTIONS_HINT` 指定区块
   - **温层**（切阶段时按需，对应 `SECTIONS_HINT` 的完整定义）:
     - Research: `Invocation` + `Research` + CodeMap（若存在）+ context bundle（若 `context-source:` 非空）
     - Plan: `Invocation` + `Research` + `Innovate Options` + CodeMap
     - Execute: `Plan` + `Execute Log` + CodeMap
     - Review: `Plan` + `Execute Log` + `Review Verdict/Summary`
     - Archive: `Execute Log` + `Review Verdict/Summary`
   - **冷层**（默认不带）: 历史 Spec 全文、archive 具体文件、其他任务 Spec、context 目录内容（例外：`context-source:` 指向的 bundle 在 Research Pre-load 阶段按需加载）
   - **archive/index.md 例外**：需查历史上下文时，先只读 `archive/index.md`（单行索引），按需再打开具体归档文件；不要直接列目录遍历所有归档文件。
7. **Phase Routing** — based on `PHASE_HINT`:
   - If `PHASE_HINT` is one of `execute`, `archive`:
      > Note: `resume` 已先完成内容驱动的状态映射。例如：`status: archived → new_task`；Plan Approved + Review 有内容 → `archive`；Plan Approved + Review 空 → `execute`；未填写 Plan Approved By → `research_or_plan`。这里处理的是映射后的 `PHASE_HINT`，不是原始 `status`。
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
8. Jump to the chosen phase's instruction section below.
   > **Micro 模式快捷路由**：若 Spec `mode: micro`，无论 PHASE_HINT 如何，始终跳过 Research / Innovate，直接进入 Plan（未审批）或 Execute（已审批）或 Review / Archive。

## Research Phase Instructions
- **Goal**: Clarify requirements, surface unknowns, align on Spec
- **Pre-load（Research 开始前必须完成，输出 Confirmed Requirement 之前）**:
  1. 读 Spec frontmatter 的 `context-source:` 字段
     - 非空：用 Read tool 加载该 bundle 文件，将其内容作为 Research 的背景底料
     - 空：跳过
  2. 检查 `HAS_CODEMAP`（来自 `resume` 输出）
     - `yes`：读取对应 CodeMap，判断是否仍能正确描述当前模块
     - `no` + 任务涉及陌生或复杂模块：先运行 `create-codemap`，再继续
  > 以上两项完成前，不得输出任何 Research 内容（包括 Findings 和 Confirmed Requirement）。
- **Requirement Review — document-first with gate**（Pre-load 后、Findings 前必做）:
  - AI 对原始 requirement 做一次完整苏格拉底式审视，**不进行实时一次一题追问**（避免主上下文被 12 turns 的 Q&A 污染）
  - 6 维度全部分析后，按模板规定格式（维度状态表 / Open Question + Tentative Assumption + Impact-if-wrong / Premise List）写入 Spec `### Requirement Review` 区块
  - 写入完成后，**触发门禁** `AskUserQuestion`：
    > Requirement Review identified N open issues (⚠️ M dimensions, ❌ K dimensions).
    > A) STOP — 我去线下澄清/重定义需求，Spec 保持 draft
    > B) CONTINUE — 接受当前 Tentative Assumptions，自动复制到 ### Assumptions，进入 Findings
  - 若所有 6 维度都为 ✅ Clear，可省略门禁直接进入 Findings；但 Premise List 仍要写入
  - 用户选 STOP → END YOUR TURN，等待用户更新 Spec 后再回到 Research
  - 用户选 CONTINUE → orchestrator 把 Tentative Assumptions 复制到 `### Assumptions`，然后进入 Findings
- **Subagent Routing — 多源调研** (from `protocols/subagent-dispatch.md`):
  - When Research requires reading > 3 files or > 500 lines of raw code / docs (typical for unfamiliar modules), **do not read them in the main orchestrator context**. Dispatch one or more subagents per source category:
    - **Codebase Scanner subagent** — greps + reads relevant code files, returns entry points / call chains / external deps (feeds `### Findings`)
    - **Archive History Reader subagent** — reads related archived specs in `<docs-root>/archive/`, returns historical decisions and known gotchas (feeds `### Findings` and `### Open Questions`)
    - **CodeMap / Convention Checker subagent** — reads existing CodeMap and project conventions, returns applicable constraints (feeds `### Assumptions`)
  - Each brief MUST paste the current Requirement (from Spec `## Invocation`) and the specific question to investigate. Subagents MUST NOT read the Spec file themselves.
  - Subagents return per Return Schema (`verdict`, `summary ≤ 200 words`, `evidence: [file:line]`). Orchestrator integrates results in main context and writes to Spec `## Research`.
  - **Requirement Review** and **Confirmed Requirement** are NEVER dispatched — both are orchestrator's main synthesis (Requirement Review is document-first analysis owned by orchestrator; Confirmed Requirement is orchestrator's research-validated understanding, written after Findings / Open Questions / Assumptions).
  - **Micro mode**: skip subagent dispatch (Research itself is skipped in micro).
- **Mandatory output format (4 sections — 按认知层次顺序输出)**:
  1. **Findings** — 先采集原始事实：代码位置、调用链、依赖关系、已确认的行为 → write back to `### Findings`
  2. **Open Questions** — 从 Findings 中识别出的未知，阻碍进一步判断的疑点 → write back to `### Open Questions`
  3. **Assumptions** — Open Questions 暂无答案时的前提填充，需明确标注"待验证" → write back to `### Assumptions`
  4. **Confirmed Requirement** — 基于以上三项的综合判断，用自己的话复述需求 → write back to `### Confirmed Requirement`

  > 顺序强制：不得在 Findings 输出前写 Confirmed Requirement；不得在 Open Questions 输出前写 Assumptions。
  > **Confirmed Requirement 冻结规则**：第一轮写入的 `### Confirmed Requirement` 视为基准版本，后续轮次**不得覆写**。若有修订，追加为 `### Confirmed Requirement (Revised — Round N)`，并注明修订原因。Invocation Alignment Check 永远与**最早一版**对比。
  > Lite mode has no `## Research` wrapper. The 5 Research subsections (Requirement Review / Findings / Open Questions / Assumptions / Confirmed Requirement) appear as flat `##` top-level sections in the same order as standard. `## Open Questions` stays at top level so status.sh's lite check still matches it. `## Invocation` holds the goal / requirement / constraints summary; `## Innovate Options` / `## Plan` / `## Execute Log` / `## Review Summary` are identical to standard.
  > “Spec Writeback” is not a separate heading — it means actually editing the Spec file with the above content after each Research round.
- **Mode Recommendation Gate** (Confirmed Requirement 写完、第一轮 Research 末尾必触发;**micro 模式跳过**):
  - **为什么需要**: mode 应跟随 spec 实际复杂度,不应是项目级默认值。用户的原始 Requirement 可能就一句话,但 Confirmed Requirement 已经综合 Findings / OQ / Assumptions,能更准确反映任务范围
  - **5 维度复杂度打分**(每维 0/1/2):
    | 维度 | 0 (low) | 1 (med) | 2 (high) |
    |:---|:---|:---|:---|
    | Scope(涉及模块/文件数) | 1 个 | 2-3 个 | 4+ 个 |
    | Architecture impact(入口点/调用链/外部依赖) | 无 | 间接 | 直接变化 |
    | Cross-cutting(auth/security/perf/data/API 契约) | 无 | 1 项 | 2+ 项 |
    | Test surface(新增测试需求) | 现有测试覆盖 | 需补 1-2 测试 | 全新测试套件 |
    | Uncertainty(未解决的 Open Questions) | 0 | 1-2 | 3+ |
  - **总分 → mode 映射**: 0-2 micro / 3-5 lite / 6+ standard
  - **输出格式**:
    ```
    ### Mode Recommendation
    基于 Confirmed Requirement + Findings 评估:
    - Scope: <具体观察> → N
    - Architecture impact: <具体观察> → N
    - Cross-cutting: <具体观察> → N
    - Test surface: <具体观察> → N
    - Uncertainty: <具体观察> → N
    Total: X → 推荐 <mode>
    理由: <一句话总结>
    ```
  - 触发 **AskUserQuestion**:
    > A) **接受推荐** <mode> — 走该 mode 的默认门禁
    > B) **升级** → <mode+1> — 任务比评估的更重(需理由)
    > C) **降级** → <mode-1> — 任务比评估的更轻(需理由)
    > D) **回 Research** — Confirmed Requirement 不准,需重做
  - 用户选完后,用 **Edit 工具更新 Spec frontmatter 的 `mode:` 字段**为选定值(micro 模式已是终态,不再回退)
  - **不依赖 raw `### Requirement` 字符数**: 用户原始输入可能简短,但 Confirmed Requirement 经过 Findings 验证,可能揭示多模块关联;**复杂度信号来自研究结果,不是文本长度**
  - lite 模式的特例: 触发本门禁时,如果 Recommended 落在 micro 范围(0-2),提示"原始 lite 选择可能过重,考虑降到 micro";反之亦然
- **CodeMap 检查**:若任务涉及陌生或复杂模块,先检查是否已有对应 CodeMap。已有则优先复用;没有且结构复杂,再调用 `create-codemap`。Research 结束时要明确记录”本次是否依赖了 CodeMap / 是否需要在任务结束后回写 CodeMap”。
- **Next steps**: Offer to update the `## Research` section (Spec Findings).
- **Invocation Alignment Check** (从第二轮 Research 开始，每轮结束时输出；第一轮不输出，因为 Confirmed Requirement 是本轮产物):
  ```
  ### Invocation Alignment Check
  - **Confirmed Requirement 基准（来自 Spec `### Confirmed Requirement` 最早一版）**: [复述首轮写入的版本，不引用 Revised 版本]
  - **Current research direction**: [1-2 sentence summary of what was just researched]
  - **Verdict**: ALIGNED | DRIFTED
  - **If DRIFTED**: [describe the gap; research may continue but deviation is logged]
  ```
  Drift does NOT block Research. Log it and continue. No extra human confirmation required.
- **Completion gate**: 满足以下全部条件才可标记 Research 完成，否则继续迭代。DO NOT auto-advance.
  1. All Open Questions resolved or explicitly deferred（每条须有结论或明确注明"deferred: 原因"）
  2. Findings 必须覆盖与 Confirmed Requirement 直接相关的代码位置 / 调用链 / 依赖关系；若 Findings 仅有泛化描述（如"代码在 src/ 下"）或为空，不得标记完成

## Innovate Phase Instructions
- **Goal**: Generate and compare solution options
- **Pre-load（Innovate 开始前，若未经由 Research 直接进入本阶段）**:
  1. 读 Spec frontmatter 的 `context-source:` 字段 — 非空则 Read bundle 文件
  2. 检查 `HAS_CODEMAP` — `yes` 则读取对应 CodeMap
  > 若本轮已完成 Research Pre-load，跳过此步骤。
- **Rules**:
  - Complex tasks: ≥2 options, each with Pros / Cons / Risk / Recommendation
  - Simple tasks: allowed `Innovate: Skipped, Reason: <why>`
- **Next steps**: Ask developer which option they choose.
- Update the `## Innovate Options` section in Spec with the chosen approach. DO NOT auto-advance.

## Plan Phase Instructions — HUMAN GATE ⚠️
- **Goal**: Atomic execution plan
- **CodeMap 检查**：若 Plan 涉及的模块已有 CodeMap，先核对计划是否仍符合该地图；若你预期本次实现会改变入口点、核心调用链、外部依赖或风险项，请在 Plan 中明确加入“更新 CodeMap”的收尾步骤。
- **Output format**:
  ```markdown
  ## Plan
  - [ ] Step 1: <file path> — <what to change> — <acceptance condition>
  - [ ] Step 2: ...
  ```
- **Step Granularity Rule** (see `vendored/superpowers/writing-plans/SKILL.md` — read on demand; prefer global skill if loaded):
  - 每步粒度为 **2–5 分钟的单一动作**；若步骤超过5分钟，拆分为更小步骤
  - 每步必须包含：① 完整文件路径 ② 具体变更内容（非"加验证"等模糊描述） ③ 验收条件（可运行的命令或可观察的结果）
  - 若任务涉及 TDD：每个"写测试 → 确认红 → 写实现 → 确认绿"四步各为独立 Plan Step，不合并为单步
  - Plan 头部建议包含一行 Goal 摘要，供 Execute 阶段快速核对边界
- **Spec Coverage Gate** (run before requesting Plan Approved):
  > **Micro 模式**：跳过 Coverage Gate，由人工在 Plan Review Gate 中目测覆盖情况。
  Output a Coverage Matrix table. List every requirement and constraint bullet from:
  - `## Invocation` section (standard: `### Requirement` + `### Constraints`; lite: combined `## Invocation` content)
  - `### Assumptions` section（Research 阶段补录的约束与前提，同样纳入检查）
  Mark each as:
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
- ONLY proceed if user selects A. Write `Plan Approved By: <user>` + `Approved At: <timestamp>` to the `## Plan` section in Spec. DO NOT auto-advance.

## Execute Phase Instructions
- **Goal**: Strict plan implementation
- **Subagent Routing** (see `vendored/superpowers/subagent-driven-development/SKILL.md` and `protocols/subagent-dispatch.md` — read on demand; prefer global skill if loaded): 在开始执行前，根据 Plan 规模或上下文污染风险选择执行模式：
  - **单 Agent 模式**（默认）：Plan ≤ 5 步且改动集中在单一模块 且 单步实现读取量 ≤ 3 文件 / 500 行 → 直接在当前上下文按步执行
  - **Subagent 模式**：满足以下任一条件即派发 → Plan > 5 步；或跨越 2 个以上模块/目录；或某步实现需读取 > 3 文件或 > 500 行（上下文污染风险）。按如下方式派发：
    1. 完整读取所有 Plan Steps，创建执行队列
    2. 每步派发独立 implementer subagent，携带：该步完整文本 + 相关文件路径 + 验收条件（不让 subagent 自己读 plan 文件）
    3. 实现完成后，派发 **Spec Compliance Reviewer**（检查该步是否满足 Plan 声明的验收条件）；通过后，再派发 **Code Quality Reviewer**；两轮顺序强制，不得并行或跳过
    4. 某步失败 → 派发 fix subagent 附带具体指令，不在 orchestrator 层直接修（防止上下文污染）
    5. 全部 Steps 完成后调用 **Completion Verification Gate**（见下文）
  - **Micro 模式**：始终使用单 Agent 模式，不派发 subagent
- **TDD Rule** (see `vendored/superpowers/test-driven-development/SKILL.md` — read on demand; prefer global skill if loaded; applies when writing production code):
  - **铁律**：没有失败测试，不得写任何生产代码
  - 顺序强制：① 写一个失败测试 → 运行并确认它因正确原因失败（RED） → ② 写最少代码使其通过（GREEN，不过度实现） → ③ 重构清理（不新增行为）
  - 若发现代码是在测试之前写的：**删掉代码重来**，不允许保留为"参考"
  - 测试使用真实代码；仅在确实无法避免时才用 mock
  - 以下理由全部无效，不得以此绕过 TDD：太简单了不用测、事后补测试、已手动验证过、时间紧、这次就算了
- **Rules**:
  - Follow Plan steps in order
  - Record every deviation in Execute Log
  - **Defect vs Deviation vs Enhancement**:
    - **Defect**: implementation result is wrong, but the current Step goal and original task intent still hold → enter `BUGFIX`
    - **Deviation**: implementing or fixing the Step would require changes outside the current Step's explicitly declared file / directory / module boundary, or would invalidate downstream Plan steps → escalate to `DEVIATED_MAJOR`
    - **Enhancement / New Requirement**: request changes original task intent, expands archived scope, or adds new acceptance criteria → MUST NOT be handled via `BUGFIX`; return to Research / Plan or start a new task
  - **BUGFIX entry**: if the current Step hits a runtime error, assertion failure, test failure, or other defect while the Step goal remains valid, enter `BUGFIX`
  - **BUGFIX Step Scope Rule**: every Plan Step must explicitly declare file paths, directory boundaries, or module boundaries; `BUGFIX` may modify only that declared boundary. If the Step lacks an explicit boundary, the Plan is incomplete → return to Plan before continuing.
   - **Subagent Routing — Debug Investigation** (from `protocols/subagent-dispatch.md`):
     - Each `debug` invocation in the BUGFIX loop reads DEBUG PROMPT (error info + ≤100 lines log + Execute Log excerpt) and then performs deep investigation (probing, reading reference implementations, isolating variables). This is **high context pollution**, multiplied by up to 3 retries.
     - **Dispatch a Debug Investigator subagent** instead of running the investigation in the main orchestrator context. Brief contents (paste, do not reference paths):
       - Full DEBUG PROMPT text (from `sdd.sh debug` output)
       - Current Step boundary (file paths / directory / module from Plan)
       - Failed assertion or error message summary
       - Spec excerpts of the current Plan Step and last 2-3 Execute Log entries
     - Subagent returns per schema: `verdict: ROOT_CAUSE_FOUND | NEEDS_MORE_PROBES | NEEDS_HUMAN`, root cause (≤ 200 words), `fix_points: [file:line]`, optional minimal patch.
     - **Orchestrator verifies** the fix_points by reading them itself before applying any fix, then decides: apply fix → next BUGFIX step | escalate `DEVIATED_MAJOR` | escalate `BUGFIX_ESCALATED`.
     - **Micro mode**: skip subagent dispatch; run debug investigation in main context.
   - **BUGFIX loop**:
     1. Before **every** retry, run `bash "<SDD_ROOT>/sdd.sh" debug "<PROJECT_ROOT>" [--log <log-file>] [--error "<error-msg>"]`
        > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
     2. Read the `## DEBUG PROMPT` output; trace data flow backward to establish Root Cause **before** proposing any fix (see `vendored/superpowers/systematic-debugging/SKILL.md` — read on demand; prefer global skill if loaded):
        - 在每个组件边界加诊断探针，逐层追踪，不跳过任何层级
        - 找到可工作的参考实现后**完整阅读**（不允许略读），列出每处差异
        - 一次只改**一个变量**验证一个假设
     3. Apply the smallest fix that stays within the current Step boundary
     4. If `debug` is inconclusive, fails, or the required fix crosses the current Step boundary → escalate immediately to `DEVIATED_MAJOR`
     5. Maximum **3 BUGFIX retries** per defect instance; if still failing after 3 retries → log `[BUGFIX_ESCALATED]`, STOP, and require human intervention — do NOT attempt a 4th retry
  - **BUGFIX status semantics**:
    - `BUGFIX`: a defect was found and fixed within the current Step boundary
    - `BUGFIX_ESCALATED`: the defect could not be resolved autonomously within 3 retries
  - **DEVIATED_MINOR**: Step goal is still achievable via a different implementation approach → log to `execute.log` with `[DEVIATED_MINOR]` tag and continue to next step
  - **DEVIATED_MAJOR**: Step goal is no longer valid, OR achieving it would require changes to other Plan steps → STOP immediately, log with `[DEVIATED_MAJOR]` tag, return to Plan phase, explicitly state which downstream steps are affected
  - Rubric: If in doubt, escalate to DEVIATED_MAJOR
  - NEVER silently deviate from Plan
  - Do not update CodeMap in the middle of unstable implementation; first make the code stable, then decide whether CodeMap needs reverse sync
- **After each step**: brief log entry AND append to `## Execute Log` in the active Spec file (append-only):
  ```
  ---
  Step N: {步骤描述}
  Status: DONE | BUGFIX | BUGFIX_ESCALATED | DEVIATED_MINOR | DEVIATED_MAJOR | BLOCKED
  Output: {命令输出摘要或关键变更}
  Deviation: {若有偏差，说明原因} | none
  Timestamp: {ISO 8601, e.g. 2026-04-20T10:30:00Z}
  ---
  ```
  Where `{spec-slug}` = current Spec filename without `.md` (e.g. `v1.1-user-login`). Used for log entry headers only — records go into the Spec, not a separate file.
- **When complete**: summarize Change Summary + Deviations from Plan. DO NOT auto-advance.
- **Completion Verification Gate** (see `vendored/superpowers/verification-before-completion/SKILL.md` — read on demand; prefer global skill if loaded):
  - 宣布 Execute 完成前，必须完成以下 5 步，不得跳过：
    1. 确认能证明完成的命令（测试套件 / linter / 构建命令）
    2. **新鲜运行**该命令（不使用缓存或之前的输出）
    3. 读取完整输出，检查 exit code
    4. 确认输出与声明一致（零失败、零报错）
    5. 只有上述全部通过，才可输出"完成"
  - 禁止使用：should、probably、seems to、应该能工作等词
  - 禁止行为：在验证前表达满意（"Great!"、"Done!"）；依赖 subagent 的成功报告而不自行验证
  - 没有例外（即使有把握、时间紧、刚改了一行也不行）

## Review Phase Instructions
- **Goal**: Verify implementation against Spec. Review is a **judge, not a programmer** — it reads and verdicts. It does NOT fix code in-place.
- **Micro 模式**：仅运行 Axis2（Code Diff Scope）。输出简版 Review：改动是否在 Plan 声明边界内，verdict 为 `PASS` / `PASS_WITH_CONCERNS` / `FAIL_CODE`。Axis0 / Axis1 / Axis3 跳过。Archive 摘要可省略，直接归档。
- **Write permissions during Review**:
  - ✅ MAY write: `## Review Verdict` (standard) or `## Review Summary` (lite) in Spec (verdict + timestamp + pass number, append-only)
  - ✅ MAY write: CodeMap — ONLY if this task changed entry points, core call chain, external dependencies, or risk items (update CodeMap BEFORE issuing verdict, note the sync in the report)
  - ❌ MUST NOT write: code files, new features, bug fixes, Plan steps
- **Trigger**: Run `bash "<SDD_ROOT>/sdd.sh" review-execute "<PROJECT_ROOT>"`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **Subagent Routing — 四轴独立派发** (from `protocols/subagent-dispatch.md`):
  - The REVIEW EXECUTE PROMPT from `review-execute` can ingest up to 780 lines of structured content (Invocation 80 + Plan 100 + Diff ≤500 + Execute Log 100). **Do not process four axes in a single orchestrator pass**.
  - Dispatch one subagent per axis (briefs are extractable from the prompt's `<!-- AXIS N BRIEF START/END -->` blocks):
    - **Axis 0 Investigator** — brief: Invocation excerpts + diff summary. Returns `ALIGNED | DRIFTED | VIOLATED | UNVERIFIABLE`.
    - **Axis 1 Investigator** — brief: Plan steps + diff summary. Returns `FULL | PARTIAL | MISSING` + per-step coverage list.
    - **Axis 2 Investigator** `[PRIMARY]` — brief: full diff + declared Plan boundaries. Returns `IN_SCOPE | OUT_OF_SCOPE_MINOR | OUT_OF_SCOPE_MAJOR`.
    - **Axis 3 Investigator** — brief: Execute Log + diff summary. Returns `FAITHFUL | DISCREPANCY`.
  - The four briefs are independent → may dispatch in parallel; this is a side benefit, not the goal.
  - **Orchestrator MUST own the final verdict**:
    1. Collect all four axis findings.
    2. Apply verdict precedence: FAIL_SPEC > FAIL_PLAN > FAIL_CODE.
    3. For PRIMARY (Axis 2), read evidence pointers itself to confirm the finding before issuing verdict.
    4. Write final verdict to Spec `## Review Verdict` (standard) / `## Review Summary` (lite). No axis subagent writes Spec.
  - **Micro mode**: only Axis 2 is run, so subagent dispatch is optional (single-agent execution is fine).
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
- **Pass numbering**: Each Review run increments N. Append to `## Review Verdict` (standard) / `## Review Summary` (lite) as `Review Pass N — <ISO-8601 timestamp> — <VERDICT>`. Do NOT overwrite previous passes.
- **After verdict**: Offer to update `## Review Verdict` / `## Review Summary` with the full report. DO NOT auto-advance to Archive.

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
1. **Before each retry**: run `bash "<SDD_ROOT>/sdd.sh" debug "<PROJECT_ROOT>" --error "<FAIL_CODE finding summary>"` and read the Debug Prompt output. Do NOT retry Execute without first establishing Root Cause via `debug`. The investigation itself should be dispatched to a **Debug Investigator subagent** per `protocols/subagent-dispatch.md` to preserve orchestrator context (skip dispatch in Micro mode).
   > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
2. Orchestrator re-invokes Execute phase for the specific steps listed in the FAIL_CODE Rollback Instruction
3. After Execute completes the fix, Review runs again (new Pass N+1)
4. Maximum **3 auto-remediation retries** (each preceded by `debug`)
5. If still `FAIL_CODE` after 3 retries → output `FAIL_CODE_ESCALATED` and require human intervention
6. `FAIL_PLAN` and `FAIL_SPEC` are **never auto-remediated** — always require human decision. Use `reopen` only after the task has been fully archived.


## Archive Phase Instructions
1. **缺陷兜底出口**：若收到缺陷反馈（用户描述问题、报错或不符合预期的行为），**暂停归档**，重新进入 Execute → Review 循环修复后再回到 Archive。不要在 Archive 阶段就地修代码。
2. **Pre-Archive Git Gate** (see `vendored/superpowers/finishing-a-development-branch/SKILL.md` — read on demand; prefer global skill if loaded):
   - 运行测试套件，若有失败 → **停止归档**，展示失败清单，不得继续
   - 确认无未提交的变更（`git status` 干净）
   - 若测试全部通过，向用户呈现分支处理选项：
     > 代码已就绪，请选择分支处理方式：
     > A) 合并回 base branch（本地）
     > B) 推送并创建 Pull Request
     > C) 保留分支，暂不处理
     > D) 丢弃本分支（需手动输入 `discard` 确认）
   - **← HUMAN GATE**: 等待用户选择后再继续
   - 选 A/B：merge/push 后再次运行测试验证；选 D：须用户明确输入 `discard`
   - **Micro 模式**：若任务仅为单文件修复且无独立分支，跳过分支选项，仅确认测试通过即可
3. **Run**: `bash "<SDD_ROOT>/sdd.sh" archive "<PROJECT_ROOT>" "<spec-name>"` — marks source Spec as `status: archived`, appends summary scaffolding, then moves the file to `archive/`. Note the `[ARCHIVE]` and `[INDEX]` paths in output.
   > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
   > **Micro 模式**：`archive` 命令执行后跳过摘要填充（步骤5-6），直接执行步骤7（Verify）和步骤8（Confirm status）。
4. **Read** the archive file (the path printed as `[ARCHIVE] ...`).
5. **Review and enrich** — the archive file is the original Spec with summary sections appended at the bottom. Use Edit tool to:
   - Replace any remaining `<!-- (未填充) -->` placeholders with real content
   - Enrich summaries where auto-scaffolded content is sparse:
     - `## 目标摘要`: confirm it reflects the actual goal achieved
     - `## 最终方案`: confirm the chosen Innovate option and rationale are captured
     - `## 关键约束`: verify constraints and assumptions are accurate
     - `## 坑点与风险`: add any resolved Open Questions and gotchas
   - The existing `## Execute Log`, `## Review Verdict` / `## Review Summary` sections are already in the file from the original Spec — verify they are complete.
6. **Update `archive/index.md` verdict** — the `archive` command wrote a placeholder verdict row. If the actual Review verdict is now known (e.g. `PASS` / `FAIL` / one-line summary), update that row in `archive/index.md` to reflect it.
7. **Verify**: confirm the archive file contains no remaining `<!-- (未填充) -->` comments. Show the file.
8. **Confirm status**: the archive command already set `status: archived` — verify it in the file frontmatter.

## Completion Status Protocol
When completing any phase or the full workflow, report status:
- **DONE** — All steps completed, evidence provided
- **DONE_WITH_CONCERNS** — Completed with issues to note. List each.
- **BLOCKED** — Cannot proceed. State what blocks and what was tried.
- **NEEDS_CONTEXT** — Missing info needed. State exactly what.

**每次阶段切换时更新 `## Summary` 区块**（热区维护规则）：
- 在完成当前阶段、准备进入下一阶段之前，用 Edit tool 更新 Spec 的 `## Summary` 区块。
- Summary 格式（3-5行，不超过100字）：
  ```
  当前阶段: <Research|Innovate|Plan|Execute|Review|Archive>
  目标: <一句话描述本任务要实现什么>
  关键约束: <最重要的1-2条约束>
  最新进展: <本阶段结论或当前卡点>
  ```
- 这确保下次 resume 时 AI 能只读 Summary 快速定位，无需重新加载整个 Spec。

## AI 驱动命令

以下命令由 shell 脚本生成结构化 Prompt，AI 读取后执行对应分析/填写任务。

### 产出物命名规则

所有产出物均采用 `v{N}.{M}-{name}.md` 格式（kebab-case），版本号自动递增：

| 产出物 | 路径 | 命名示例 |
|---|---|---|
| Spec | `<docs-root>/specs/` | `v1.0-user-login.md`, `v1.1-user-login.md` |
| CodeMap | `<docs-root>/codemap/` | `v1.0-auth.md`, `v1.1-auth.md` |
| Context Bundle | `<docs-root>/context/` | `v1.0-context-bundle.md` |
| Archive | `<docs-root>/archive/` | `v1.1-user-login.md`（Spec 移入 + summary 追加） |
| ProjectMap | `<docs-root>/projectmap.md` | 固定单文件，不版本化 |

- `<docs-root>` 默认为 `mydocs/`；若项目根存在 `.sdd-config` 且声明了 `DOCS_DIR=...`，则应改用该目录。

- **版本由用户指定**：`discover`、`new-codemap`、`build-context-bundle` 均要求 `--version v{N}.{M}`，不自动递增
- **archive**：自动继承来源 Spec 的版本号，无需手动指定
- **reopen**：patch spec 版本号与来源 archived spec 完全一致（不递增）
- **旧版保留**：旧文件不删除，历史可追溯
- **resume**：自动读取最近修改任务的最高版本 Spec

### review-execute（P0 四轴质量筛查）
- **触发时机**：进入 Review 阶段时
- **命令**：
  ```bash
  bash "<SDD_ROOT>/sdd.sh" review-execute "<PROJECT_ROOT>"
  ```
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
  支持可选参数：`--spec <path>`、`--diff-base <rev>`。
- **AI 行为**：读取命令输出的结构化 Prompt，执行四轴对照分析，填写 Spec `## Review Verdict`（standard）/ `## Review Summary`（lite）
- **四轴**：轴0=Invocation Integrity / 轴1=Spec Plan / 轴2=Code Diff / 轴3=Execute Log（来自 Spec `## Execute Log` 区块）

### discover（P1b 首版 Spec 创建 / Pre-Research 入口）
- **触发时机**：Setup Mode 中用户选择"创建首个 Spec"时
- **命令**：`bash "<SDD_ROOT>/sdd.sh" discover "<PROJECT_ROOT>" --task-name "<name>" --version v{N}.{M} --requirement "<req>" --goal "<goal>" --constraints "<constraints>" [--mode standard|lite|micro]`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **AI 行为**：读取命令输出的 `## SPEC CREATION PROMPT`，读取创建的 Spec 文件，填写 Research Findings 区块和初始 Open Questions
- **注意**：`--task-name` 和 `--version` 均为必填参数；此命令会写入 `<docs-root>/specs/v{N}.{M}-<task-name>.md`（`<docs-root>` 默认为 `mydocs/`，可由 `.sdd-config` 指定）

### create-codemap（P2a AI 驱动代码库扫描）
- **触发时机**：Research 或 Plan 阶段，需要建立代码库架构视图时
- **命令**：`bash "<SDD_ROOT>/sdd.sh" create-codemap "<PROJECT_ROOT>" [--module <name>]`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **AI 行为**：读取 Prompt 中的文件树和 CodeMap 模板，分析代码库结构，填写 CodeMap 并写入 `<docs-root>/codemap/<module>.md`
- **治理规则**：若目标模块已有 CodeMap，优先进入 UPDATE 模式，对现有地图做增量更新；不要为同一模块重复创建多份 CodeMap。

### build-context-bundle（P2b AI 提炼上下文包）
- **触发时机**：任务开始前，用户手头有外部材料（如 UI 稿、PRD、会议记录）需要带入任务背景时；典型触发如”我有设计稿要放进去””PRD 文档怎么带进 context”。Skill 会在每次创建 Spec 前主动询问，用户选择提供路径后触发。
- **命令**：`bash "<SDD_ROOT>/sdd.sh" build-context-bundle "<PROJECT_ROOT>" --version v{N}.{M} [--out <name>] [--sources <dir>]`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **AI 行为**：读取 Prompt 中列出的外部 source materials（若提供 `--sources <dir>`）以及 docs-root 项目背景文件，按 Context Bundle 模板做两层提炼：先吸收外部材料，再补齐项目文档背景，写入 `<docs-root>/context/v{N}.{M}-<bundle-name>.md`（版本由用户通过 `--version` 指定）
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
- **命令**：`bash "<SDD_ROOT>/sdd.sh" reopen "<PROJECT_ROOT>" "<task-slug>" [--defect "<defect-summary>"] [--mode standard|lite|micro]`
  > ⚠️ Replace `<SDD_ROOT>` and `<PROJECT_ROOT>` with actual paths from the preamble output.
- **默认模式**：`micro`。patch 任务天然轻量（边界清晰、不需要重新 Innovate），仅在缺陷修复范围较大时才传 `--mode standard` 或 `--mode lite` 覆盖。
- **前置条件**：
  - 源 Spec 的 `status` 必须为 `archived`
  - `<docs-root>/archive/` 中必须存在对应的归档文件 `vN.M-<task-slug>.md`
  - `<docs-root>/specs/` 中不得已存在同 slug 的更高版本且 `status != archived` 的 patch Spec；若存在，改为运行 `resume`
- **AI 行为**：命令成功后，读取新建 patch Spec 的 `reopened-from` 与 `context-source` 元数据，运行 `resume` 载入该 patch Spec，再在 `## Research` 区块中记录归档上下文来源与缺陷来源。`reopen` 只用于 defect patch，不得借此扩大范围或引入新功能。
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
