# Layered Gate Architecture for SDD-RIPER

## TL;DR

> **Quick Summary**: Upgrade SDD-RIPER from single-point Review checks to a 4-checkpoint layered gate system: Gate 1 after Research (Invocation Alignment), Gate 2 before Plan approval (Spec Coverage), Gate 3 per Execute step (DEVIATED_MINOR/MAJOR split), and Gate 4 (existing Review) with clarified axis roles + upstream failure warnings.
>
> **Deliverables**:
> - `SKILL.md` — 4 phase sections updated
> - `protocols/sdd-riper-one.md` — same 4 phase descriptions synchronized
> - `bin/review-execute.sh` — Axis role labels (`[PRIMARY]`/`[CONFIRMATION]`) + upstream gate failure warning block
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (SKILL.md) → Task 3 (review-execute.sh) → Final Verification

---

## Context

### Original Request
升级 SDD-RIPER 检查架构：当前 Review 是唯一检查点，事后补救成本高。目标：在 Research 后、Plan Approved 前、Execute 逐步、Final Review 四个位置各置一道检查门，形成分层防御体系。

### Interview Summary
- **Gate 1 时机**: Research 阶段结束时，输出第 5 段 Invocation Alignment Check；每轮 Research 都执行一次（不等阶段结束），漂移记录后可继续，无需额外人工确认
- **Gate 2 粒度**: 识别 Spec §2 Requirement Restatement + §3 Constraints 中的每个 bullet 为一个需求项，Coverage Matrix 用 `✅/❌/⚠️` 标注；有 `❌` 必须补全才能过门
- **Gate 3 DEVIATED_MINOR/MAJOR rubric**: 步骤目标仍可达 = MINOR（记录后继续）；步骤目标已不成立或影响后续步骤 = MAJOR（STOP，返回 Plan）
- **Gate 4 轴角色**: Axis 2 是 `[PRIMARY]`（全量 diff 审计，唯一只能在这里做的），Axis 0/1/3 降为 `[CONFIRMATION]`（安全网）；Axis 0/1/3 在 Review 触发 FAIL 时，追加"上游门禁失效"警告
- **Output persistence**: Gate 1/2 输出仅作为 prompt 文本，不写回 Spec frontmatter
- **Axis 2 last-commit 限制**: 接受现状，在文档中明确注明（full-task diff 是后续独立任务）
- **Axis 0/1/3 FAIL verdict 映射**: Axis 0 FAIL → `FAIL_SPEC`，Axis 1 FAIL → `FAIL_PLAN`，Axis 3 FAIL → `FAIL_CODE`
- **Lite 模式**: 本轮不动
- **Forward-only**: 新规则仅适用于新任务，旧 Spec/Log 祖父化

### Metis Review
**Identified Gaps** (addressed):
- Gate 1 触发时机歧义 → 明确为"每轮 Research 输出末尾追加第 5 段"
- Gate 2 需求识别粒度 → 明确为"Spec §2 + §3 每个 bullet 为一项"
- DEVIATED_MAJOR 判定标准不清 → 写入明确 rubric（目标可达 vs 不成立）
- 轴角色标注方式 → 使用 `[PRIMARY]` / `[CONFIRMATION]` 内联标签

---

## Work Objectives

### Core Objective
在 SKILL.md + 协议文档 + review 脚本中落地 4 道分层检查门，使 SDD-RIPER 从"事后 Review"升级为"全流程防御"。

### Concrete Deliverables
- `SKILL.md`：Research / Plan / Execute / Review 四段 Phase Instructions 均已更新
- `protocols/sdd-riper-one.md`：同上四段协议描述同步
- `bin/review-execute.sh`：Axis 角色标注 + 上游门禁失效警告 block 已注入

### Definition of Done
- [ ] `grep -n "Invocation Alignment" SKILL.md` → 返回 Research 章节中的命中行
- [ ] `grep -n "Coverage Gate" SKILL.md` → 返回 Plan 章节中的命中行
- [ ] `grep -n "DEVIATED_MINOR\|DEVIATED_MAJOR" SKILL.md` → 返回 Execute 章节命中行
- [ ] `grep -n "PRIMARY\|CONFIRMATION" bin/review-execute.sh` → 返回 4 轴标注行
- [ ] `grep -n "upstream gate failure" bin/review-execute.sh` → 返回警告 block 行
- [ ] `grep -n "FAIL_CODE_ESCALATED\|auto-remediation\|Auto-Remediation" SKILL.md` → 返回 Review 章节命中行
- [ ] `grep -n "FAIL_CODE_ESCALATED\|auto-remediation\|Auto-Remediation" protocols/sdd-riper-one.md` → 协议文档同步确认

### Must Have
- Gate 1: Research 每轮输出末尾第 5 段，内容含"原始意图复述 vs 当前方向对比 + ALIGNED/DRIFTED 判断"
- Gate 2: Plan Approved 前输出 Coverage Matrix（§2+§3 每个 bullet → `✅/❌/⚠️`），有 `❌` 则 BLOCK
- Gate 3: Execute 逐步偏差分类为 DEVIATED_MINOR（继续）vs DEVIATED_MAJOR（STOP，返回 Plan），MAJOR 须明确说明哪个 Plan 步骤受影响
- Gate 4: `bin/review-execute.sh` 每轴标注 `[PRIMARY]` 或 `[CONFIRMATION]`；Axis 0/1/3 触发 FAIL 时追加上游门禁失效警告段落
- **FAIL_CODE 自动修复循环**：Review 输出 `FAIL_CODE` 时，Orchestrator 自动返回 Execute 修复，最多重试 3 次；超出后升级为需人工介入；`FAIL_PLAN` / `FAIL_SPEC` 仍需人工决策
- 所有变更同步至 `protocols/sdd-riper-one.md`

### Must NOT Have (Guardrails)
- Gate 1/2 不写入 Spec frontmatter，不修改 `templates/spec.md`
- `bin/_workflow_core.sh`、`README`、`tests/` 本轮不动
- Review 阶段不就地修复代码（裁判定位不变）
- 不为 Axis 2 last-commit 限制实现 full-task diff（后续独立任务）
- Lite 模式不动
- 不做旧 Spec/Log 迁移

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (`tests/test_review_execute.sh`)
- **Automated tests**: NO — `tests/` 本轮 OUT scope，不改测试文件
- **Framework**: bun/bash

### QA Policy
每个任务包含 Agent-Executed QA Scenarios。证据保存至 `.sisyphus/evidence/task-{N}-{slug}.txt`。
- **Shell 脚本**: Bash (grep/cat) — 验证关键字存在 + 上下文正确
- **文档**: Bash (grep) — 确认四个阶段均已更新

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — 3 files, fully parallel):
├── Task 1: SKILL.md — 4 phase updates + FAIL_CODE auto-remediation loop [unspecified-high]
├── Task 2: protocols/sdd-riper-one.md — 4 phase updates + FAIL_CODE loop [unspecified-high]
└── Task 3: bin/review-execute.sh — axis labels + upstream warning [quick]

Wave FINAL (After Wave 1 — 2 parallel reviews):
├── Task F1: Plan Compliance Audit (oracle)
└── Task F2: Scope Fidelity Check (deep)
→ Present results → Get explicit user okay
```

### Agent Dispatch Summary
- **Wave 1**: 3 tasks — T1 `unspecified-high`, T2 `unspecified-high`, T3 `quick`
- **FINAL**: 2 tasks — F1 `oracle`, F2 `deep`

---

## TODOs

- [x] 1. SKILL.md — 4 Phase Gate Updates

  **What to do**:
  - **Research section**: Append a 5th output paragraph named "§5 Invocation Alignment Check". Content template:
    ```
    ### §5 Invocation Alignment Check
    - **Original invocation intent** (from opening message): [1-2 sentence restatement]
    - **Current research direction**: [1-2 sentence summary of what was just researched]
    - **Verdict**: ALIGNED | DRIFTED
    - **If DRIFTED**: [describe the gap; research may continue but deviation is logged]
    ```
    This paragraph is added at the end of every Research phase output (every round, not just phase end).
  - **Plan section**: Before the "Plan Approved" human gate, add a "Spec Coverage Gate" requirement. The AI must output a Coverage Matrix table listing every bullet in §2 Requirement Restatement and §3 Constraints with status `✅` (covered), `❌` (missing), or `⚠️` (partial). If any `❌` exists, the plan is BLOCKED and must be revised before requesting Plan Approved.
  - **Execute section**: Replace single "偏差须 STOP" rule with DEVIATED_MINOR / DEVIATED_MAJOR split:
    - `DEVIATED_MINOR`: Step goal is still achievable via a different implementation approach → log to `execute.log` with `[DEVIATED_MINOR]` tag, continue to next step
    - `DEVIATED_MAJOR`: Step goal is no longer valid, OR achieving it would require changes to other Plan steps → STOP immediately, log with `[DEVIATED_MAJOR]` tag, return to Plan phase and explain which downstream steps are affected
    - Rubric must be explicit: "If in doubt, escalate to MAJOR"
  - **Review section (FAIL_CODE Auto-Remediation Loop)**: Add the following rule to the Review Phase Instructions:
    ```
    ### FAIL_CODE Auto-Remediation Loop
    When Review verdict is FAIL_CODE:
    1. Orchestrator automatically re-invokes Execute phase targeting the failed items (do NOT re-run the full Execute — only the specific steps identified in the FAIL_CODE verdict)
    2. After Execute completes the fix, Review runs again
    3. Maximum 3 auto-remediation retries
    4. If still FAIL_CODE after 3 retries → escalate: output FAIL_CODE_ESCALATED and require human intervention
    5. FAIL_PLAN and FAIL_SPEC always require human intervention — never auto-remediate these
    ```
  - **Review section (Axis roles)**: Add note that Axis 2 is the `[PRIMARY]` responsibility of Review (full diff audit — the only place this can be done), while Axis 0, Axis 1, Axis 3 are `[CONFIRMATION]` safety nets. Add note: if Axis 0/1/3 fails at Review, this indicates an upstream gate failure (Gate 1, 2, or 3 did not catch the issue) and the verdict should include an upstream failure warning.

  **Must NOT do**:
  - Do not modify `templates/spec.md` or any Spec frontmatter schema
  - Do not add Lite mode changes
  - Do not touch `tests/`, README, `bin/_workflow_core.sh`
  - Gate 1/2 outputs are prompt-text only — do not instruct AI to write them back into the Spec file

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires reading existing SKILL.md structure carefully and inserting precise content into 4 different phase sections without disrupting surrounding text
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: F1, F2
  - **Blocked By**: None

  **References**:
  - `SKILL.md` — Read the full file first; identify the exact section headers for Research / Plan / Execute / Review phases
  - `protocols/sdd-riper-one.md` — Cross-reference to understand existing language (Task 2 will mirror these changes)
  - `.sisyphus/plans/layered-gate-architecture.md` §Context — The full decision rationale for each gate

  **Acceptance Criteria**:
  ```
  Scenario: Gate 1 keyword present in Research section
    Tool: Bash (grep)
    Steps:
      1. grep -n "Invocation Alignment" SKILL.md
    Expected Result: At least 1 line returned, line number falls within Research phase section
    Evidence: .sisyphus/evidence/task-1-gate1-keyword.txt

  Scenario: Gate 2 keyword present in Plan section
    Tool: Bash (grep)
    Steps:
      1. grep -n "Coverage" SKILL.md
    Expected Result: "Coverage Gate" or "Coverage Matrix" found in Plan phase section
    Evidence: .sisyphus/evidence/task-1-gate2-keyword.txt

  Scenario: DEVIATED_MINOR and DEVIATED_MAJOR both present in Execute section
    Tool: Bash (grep)
    Steps:
      1. grep -n "DEVIATED_MINOR\|DEVIATED_MAJOR" SKILL.md
    Expected Result: Both terms appear, within Execute phase section
    Evidence: .sisyphus/evidence/task-1-gate3-keywords.txt

  Scenario: PRIMARY and CONFIRMATION labels in Review section
    Tool: Bash (grep)
    Steps:
      1. grep -n "PRIMARY\|CONFIRMATION" SKILL.md
    Expected Result: At least 2 hits in Review phase section
    Evidence: .sisyphus/evidence/task-1-gate4-labels.txt
  ```

  **Commit**: YES (groups with Tasks 2 and 3)

---

- [x] 2. protocols/sdd-riper-one.md — 4 Phase Updates (mirror of Task 1)

  **What to do**:
  - Make the exact same conceptual changes as Task 1, but in `protocols/sdd-riper-one.md`
  - Research section: add §5 Invocation Alignment Check description
  - Plan section: add Spec Coverage Gate requirement before Plan Approved gate
  - Execute section: replace single deviation rule with DEVIATED_MINOR/MAJOR split (same rubric)
  - Review section: add Axis 2 `[PRIMARY]` / Axis 0/1/3 `[CONFIRMATION]` note + upstream gate failure warning description
  - Match the language and structure of the protocol document (more formal/concise than SKILL.md)

  **Must NOT do**:
  - Same exclusions as Task 1
  - Do not change the `Plan Approved` human gate itself — only add the Coverage Gate requirement *before* it

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: F1, F2
  - **Blocked By**: None

  **References**:
  - `protocols/sdd-riper-one.md` — Read full file first; find section headers for all 4 phases
  - `SKILL.md` — Use as the source of truth for what content to add (after Task 1 is complete, or work from this plan as the spec)
  - `.sisyphus/plans/layered-gate-architecture.md` §Must Have — Exact requirements list

  **Acceptance Criteria**:
  ```
  Scenario: All 4 gate keywords present in protocol document
    Tool: Bash (grep)
    Steps:
      1. grep -n "Invocation Alignment\|Coverage\|DEVIATED_MINOR\|DEVIATED_MAJOR\|PRIMARY\|CONFIRMATION" protocols/sdd-riper-one.md
    Expected Result: All 6 pattern variants found, distributed across 4 phase sections
    Evidence: .sisyphus/evidence/task-2-protocol-keywords.txt
  ```

  **Commit**: YES (groups with Tasks 1 and 3)

---

- [x] 3. bin/review-execute.sh — Axis Role Labels + Upstream Gate Failure Warning

  **What to do**:
  - In the section of `bin/review-execute.sh` that generates the Axis 0 prompt text, add inline label `[CONFIRMATION]` to the axis header/description
  - Same for Axis 1: add `[CONFIRMATION]`
  - For Axis 2: add `[PRIMARY]` — this is the primary responsibility of Review
  - For Axis 3: add `[CONFIRMATION]`
  - After the Axis 0/1/3 output blocks (or in a shared footer section), add an "Upstream Gate Failure Warning" block that is conditionally included when any of Axis 0/1/3 would produce a FAIL verdict. The warning text should read approximately:
    > ⚠️ UPSTREAM GATE FAILURE DETECTED: This Axis [N] failure indicates that the corresponding upstream gate (Gate [1/2/3]) did not catch this issue during the [Research/Plan/Execute] phase. In addition to the verdict below, include a note in your output recommending a retrospective review of the upstream gate's effectiveness.
  - Note in a code comment: "Axis 2 uses last-commit diff (not full-task diff) — full-task diff support is a future enhancement"

  **Must NOT do**:
  - Do not change any existing verdict logic or PHASE_HINT inference
  - Do not change Axis 2 diff sourcing (last-commit only, as noted above)
  - Do not touch `bin/_workflow_core.sh`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted string insertions into existing shell heredoc/echo blocks; no logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: F1, F2
  - **Blocked By**: None

  **References**:
  - `bin/review-execute.sh` — Read full file; identify heredoc sections for each Axis description
  - `tests/test_review_execute.sh` — Run after changes to confirm no regressions

  **Acceptance Criteria**:
  ```
  Scenario: All 4 axes have role labels
    Tool: Bash (grep)
    Steps:
      1. grep -n "PRIMARY\|CONFIRMATION" bin/review-execute.sh
    Expected Result: Exactly 4 hits — Axis 0 CONFIRMATION, Axis 1 CONFIRMATION, Axis 2 PRIMARY, Axis 3 CONFIRMATION
    Evidence: .sisyphus/evidence/task-3-axis-labels.txt

  Scenario: Upstream gate failure warning block present
    Tool: Bash (grep)
    Steps:
      1. grep -n "upstream\|UPSTREAM" bin/review-execute.sh
    Expected Result: At least 1 hit referencing "upstream gate"
    Evidence: .sisyphus/evidence/task-3-upstream-warning.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Steps:
      1. bash tests/test_review_execute.sh
    Expected Result: Exit code 0, no FAILED lines in output
    Evidence: .sisyphus/evidence/task-3-existing-tests.txt
  ```

  **Commit**: YES (groups with Tasks 1 and 2)
  - Message: `feat(sdd-riper): add layered gate architecture (4 checkpoints)`
  - Files: `SKILL.md`, `protocols/sdd-riper-one.md`, `bin/review-execute.sh`
  - Pre-commit: `bash tests/test_review_execute.sh`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read this plan end-to-end. For each "Must Have": verify implementation exists (`grep` key terms in each file). For each "Must NOT Have": search for forbidden patterns. Check evidence files exist in `.sisyphus/evidence/`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — nothing beyond spec built, nothing from spec missing. Flag any cross-file contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(sdd-riper): add layered gate architecture (4 checkpoints)`
  - Files: `SKILL.md`, `protocols/sdd-riper-one.md`, `bin/review-execute.sh`
  - Pre-commit: `bash tests/test_review_execute.sh` (existing tests must still pass)

---

## Success Criteria

### Verification Commands
```bash
grep -n "Invocation Alignment" SKILL.md          # Expected: hit in Research section
grep -n "Coverage Gate\|Coverage Matrix" SKILL.md # Expected: hit in Plan section
grep -n "DEVIATED_MINOR\|DEVIATED_MAJOR" SKILL.md # Expected: hit in Execute section
grep -n "PRIMARY\|CONFIRMATION" bin/review-execute.sh  # Expected: 4 hits (one per axis)
grep -n "upstream gate" bin/review-execute.sh          # Expected: 1+ hits
grep -n "Invocation Alignment" protocols/sdd-riper-one.md  # Expected: hit
bash tests/test_review_execute.sh                       # Expected: all tests PASS
```

### Final Checklist
- [ ] All 4 gates + FAIL_CODE auto-remediation loop documented in SKILL.md
- [ ] protocols/sdd-riper-one.md in sync with SKILL.md
- [ ] bin/review-execute.sh axis labels + upstream warning present
- [ ] Existing tests still pass (no regressions)
- [ ] templates/spec.md, bin/_workflow_core.sh, README, tests/ untouched
