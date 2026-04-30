# Review Phase: 4-Axis Governance Upgrade

## TL;DR

> **Quick Summary**: Upgrade the SDD-RIPER Review phase from a 3-axis quality check to a 4-axis governance protocol with typed FAIL verdicts and explicit rollback routing.
>
> **Deliverables**:
> - `bin/review-execute.sh` — new Axis 0 extraction + 4-axis prompt structure + typed verdict enum
> - `SKILL.md` — Review Phase Instructions expanded to 4-axis, FAIL routing, judge-not-programmer rule
> - `protocols/sdd-riper-one.md` — Review section updated with state machine, anti-patterns, pass numbering
> - `tests/test_review_execute.sh` — assertions updated to 4-axis expectations
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (script) → Task 4 (test) → Final Verification

---

## Context

### Original Request
Upgrade Review from a 3-axis check to a 4-axis governance protocol that is auditable, typed, and has explicit rollback routing. Review must be a "judge", not a "programmer" — it reads and verdicts; it never fixes in-place.

### Key Design Decisions
- **Axis 0 metadata source**: Spec body sections (`Requirement Restatement`, `Constraints`) extracted via existing `read_section()` helper — no Spec template/discover schema changes needed
- **Legacy Spec (no metadata)**: Axis 0 = `UNVERIFIABLE` (treated as `DRIFTED` for verdict purposes)
- **Verdict enum**: `PASS | PASS_WITH_CONCERNS | FAIL_CODE | FAIL_PLAN | FAIL_SPEC`
- **Verdict precedence** (when multiple failures): `FAIL_SPEC > FAIL_PLAN > FAIL_CODE`
- **Axis 0 finding enum**: `ALIGNED | DRIFTED | VIOLATED`; only `VIOLATED` → `FAIL_SPEC`; `DRIFTED` → `PASS_WITH_CONCERNS`
- **Review write permissions**: May write §10 Review Verdict in Spec (verdict + timestamp + pass number); may update CodeMap only if architecture changed; CANNOT write code
- **git diff scope**: Keep `HEAD~1..HEAD` (known limitation); document in prompt output
- **State machine scope**: Review semantics only — no changes to `status` values, `resume`, or `archive` CLI behavior

### Metis Review Findings (Addressed)
- Spec frontmatter does NOT hold `requirement/goal/constraints` → resolved by body-section extraction
- `tests/test_review_execute.sh` still asserts 3-axis output → included in scope
- README/templates/examples still reference 3-axis → deferred (not in this plan)
- CodeMap-update-before-verdict conflicts with "judge-only" posture → resolved: CodeMap update is pre-verdict, not during verdict; it is the one permitted write artifact mutation before judging

---

## Work Objectives

### Core Objective
Make the Review phase an auditable governance gate: typed verdicts with explicit rollback destinations, immutable invocation check, and multi-pass audit history in the Spec.

### Concrete Deliverables
- `bin/review-execute.sh`: 4-axis prompt with Axis 0 body extraction, typed verdicts, legacy fallback, known-limitation notice
- `SKILL.md` lines 235-247: Expanded Review Phase Instructions
- `protocols/sdd-riper-one.md` lines 97-103: Updated Review section
- `tests/test_review_execute.sh`: Updated assertions for 4-axis structure

### Must Have
- Axis 0 reads `Requirement Restatement` and `Constraints` sections from Spec body via `read_section()`
- Axis 0 finding: `ALIGNED | DRIFTED | VIOLATED | UNVERIFIABLE`
- Verdict enum: `PASS | PASS_WITH_CONCERNS | FAIL_CODE | FAIL_PLAN | FAIL_SPEC`
- Verdict precedence rule documented: `FAIL_SPEC > FAIL_PLAN > FAIL_CODE`
- Rollback destination per FAIL type documented in both prompt output and SKILL.md
- Review pass numbering format: `Review Pass N — YYYY-MM-DDTHH:MM:SSZ — VERDICT`
- Risk register location: inline in §10 Review Verdict when `PASS_WITH_CONCERNS`
- Test file assertions updated to match new output structure

### Must NOT Have (Guardrails)
- No changes to `templates/spec.md` (frontmatter schema unchanged)
- No changes to `bin/discover.sh` or `_workflow_core.sh`
- No changes to `status:` frontmatter values (`draft/approved/done`)
- No changes to `archive` or `resume` CLI behavior
- No automatic rollback actions — routing is advisory, not mechanical
- Review must NOT write code files; only §10 and CodeMap (pre-verdict) are permitted write targets
- No changes to README or examples (deferred)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (`tests/`)
- **Automated tests**: Tests-after
- **Framework**: bash (direct script execution)

### QA Policy
Every task has agent-executed QA scenarios. Evidence in `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent content changes):
├── Task 1: bin/review-execute.sh — Axis 0 + 4-axis output rewrite   [unspecified-high]
├── Task 2: SKILL.md Review Phase Instructions expansion               [unspecified-high]
└── Task 3: protocols/sdd-riper-one.md Review section upgrade         [unspecified-high]

Wave 2 (After Wave 1 — test must reflect final script output):
└── Task 4: tests/test_review_execute.sh — 4-axis assertions          [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit                                      [oracle]
├── Task F2: Code quality + bash lint                                   [unspecified-high]
├── Task F3: Real QA execution (run script + check output)             [unspecified-high]
└── Task F4: Scope fidelity check                                       [deep]
→ Present results → Get explicit user okay
```

---

## TODOs

- [x] 1. Upgrade `bin/review-execute.sh`: add Axis 0 extraction and 4-axis prompt output

  **What to do**:
  - Add `read_section` calls to extract `Requirement Restatement` section (pattern `"Requirement"`) and a `Constraints` section (pattern `"Constraint"`) from the Spec, each capped at 50 lines. Store results as `REQUIREMENT_CONTENT` and `CONSTRAINTS_CONTENT`.
  - Add fallback logic: if both sections are empty/not-found, set `AXIS0_NOTE="[WARN] Invocation metadata not found in Spec. Axis 0 will be UNVERIFIABLE."` and set both vars to `(section not found)`.
  - Update the `print_usage` docstring (lines 8-12) to describe 4 axes.
  - Replace the `cat <<EOF` output block (lines 145-163) with the new 4-axis structure below. Keep existing variables `PLAN_CONTENT`, `DIFF_CONTENT`, `EXECUTE_LOG` but rename headings:
    - Old `轴1: Spec Plan` → remains **轴1 — Spec Plan Coverage**
    - Old `轴2: Code Diff` → remains **轴2 — Code Diff Scope**
    - Old `轴3: Execute Log` → remains **轴3 — Execute Log Fidelity**
    - New **轴0 — Invocation Integrity** section at the top of the output, before 轴1

  **New output block (exact replacement for lines 145-163)**:
  ```bash
  cat <<EOF
  ## REVIEW EXECUTE PROMPT (4-Axis)

  > Known limitation: Code Diff covers only HEAD~1..HEAD (last commit).
  > For multi-commit tasks, manually provide a broader diff via --diff flag (future feature).
  ${AXIS0_NOTE:-}

  ### 轴0 — Invocation Integrity
  Original Requirement (from Spec):
  ${REQUIREMENT_CONTENT}

  Original Constraints (from Spec):
  ${CONSTRAINTS_CONTENT}

  ### 轴1 — Spec Plan Coverage
  ${PLAN_CONTENT}

  ### 轴2 — Code Diff Scope
  ${DIFF_CONTENT}

  ### 轴3 — Execute Log Fidelity
  ${EXECUTE_LOG}

  ### 指令
  逐轴分析，输出以下格式：

  #### Axis 0 — Invocation Integrity
  Assessment: [does implementation serve original requirement/constraints?]
  Finding: ALIGNED | DRIFTED | VIOLATED | UNVERIFIABLE

  #### Axis 1 — Spec Plan Coverage
  [For each Plan step: ✅ implemented / ❌ missing / ⚠️ partial]
  Finding: FULL | PARTIAL | MISSING

  #### Axis 2 — Code Diff Scope
  [Changes within Plan scope vs. changes outside Plan scope]
  Finding: IN_SCOPE | OUT_OF_SCOPE_MINOR | OUT_OF_SCOPE_MAJOR

  #### Axis 3 — Execute Log Fidelity
  [Log deviations vs. actual code — do they match?]
  Finding: FAITHFUL | DISCREPANCY

  #### Defect Table (if any findings are not ALIGNED/FULL/IN_SCOPE/FAITHFUL)
  | Defect | Axis | Severity | Rollback Target |
  |--------|------|----------|-----------------|
  | [desc] | [0-3]| HIGH/MED | Execute / Plan / Research+Plan |

  #### Verdict
  PASS | PASS_WITH_CONCERNS | FAIL_CODE | FAIL_PLAN | FAIL_SPEC

  Verdict precedence (if multiple failures): FAIL_SPEC > FAIL_PLAN > FAIL_CODE.

  #### Rollback Instruction (if FAIL)
  - FAIL_CODE → Reopen Execute. Re-execute steps: [list step numbers]
  - FAIL_PLAN → Reopen Plan. Plan issues: [describe]
  - FAIL_SPEC → Reopen Research + Plan. Requirement concern: [describe]

  #### Risk Register (if PASS_WITH_CONCERNS)
  | Risk | Axis | Severity | Mitigation |
  |------|------|----------|------------|

  Record this verdict in Spec §10 as:
  Review Pass N — <ISO-8601 timestamp> — <VERDICT>
  EOF
  ```

  **Must NOT do**:
  - Do not change argument parsing, spec-selection logic, diff extraction, or log extraction code (lines 19-143)
  - Do not add new CLI flags
  - Do not change exit codes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Shell scripting with structured output rewrite; moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `bin/review-execute.sh:92-106` — existing `read_section()` helper; use the same pattern for Axis 0 extraction
  - `bin/review-execute.sh:108-143` — where `PLAN_CONTENT`, `DIFF_CONTENT`, `EXECUTE_LOG` are set; add `REQUIREMENT_CONTENT` and `CONSTRAINTS_CONTENT` here
  - `bin/review-execute.sh:145-163` — the output block to replace
  - `protocols/sdd-riper-one.md:97-103` — current Review definition (context for naming consistency)

  **Acceptance Criteria**:
  - [ ] `bash bin/review-execute.sh <any-project-with-spec>` exits 0
  - [ ] Output contains exactly the string `轴0 — Invocation Integrity`
  - [ ] Output contains exactly the string `轴1 — Spec Plan Coverage`
  - [ ] Output contains exactly the string `轴2 — Code Diff Scope`
  - [ ] Output contains exactly the string `轴3 — Execute Log Fidelity`
  - [ ] Output contains all 5 verdict options: `PASS`, `PASS_WITH_CONCERNS`, `FAIL_CODE`, `FAIL_PLAN`, `FAIL_SPEC`
  - [ ] Output contains `ALIGNED | DRIFTED | VIOLATED | UNVERIFIABLE`
  - [ ] When Spec has no `Requirement Restatement` section: output contains `[WARN] Invocation metadata not found`
  - [ ] No regression: still exits 1 when project not initialized

  **QA Scenarios**:

  ```
  Scenario: Happy path — Spec with Requirement Restatement section
    Tool: Bash
    Preconditions: A project with a valid Spec containing "## Requirement Restatement" section
    Steps:
      1. Run: bash bin/review-execute.sh tests/fixtures/sample-project
      2. Capture stdout
      3. Assert stdout contains "轴0 — Invocation Integrity"
      4. Assert stdout contains "轴1 — Spec Plan Coverage"
      5. Assert stdout contains "FAIL_CODE | FAIL_PLAN | FAIL_SPEC"
      6. Assert exit code = 0
    Expected Result: Clean 4-axis prompt output with all sections present
    Evidence: .sisyphus/evidence/task-1-happy-path.txt

  Scenario: Legacy Spec — no Requirement Restatement section
    Tool: Bash
    Preconditions: A project whose Spec has no "Requirement Restatement" heading
    Steps:
      1. Run: bash bin/review-execute.sh tests/fixtures/legacy-project 2>&1
      2. Assert stdout contains "[WARN] Invocation metadata not found"
      3. Assert stdout contains "UNVERIFIABLE"
      4. Assert exit code = 0 (graceful fallback, not error)
    Expected Result: Warning emitted, Axis 0 shows UNVERIFIABLE, script does not fail
    Evidence: .sisyphus/evidence/task-1-legacy-fallback.txt

  Scenario: No project init — missing mydocs/
    Tool: Bash
    Preconditions: A directory without mydocs/ subdirectory
    Steps:
      1. Run: bash bin/review-execute.sh /tmp/notaproject
      2. Assert exit code = 1
      3. Assert stderr contains "Project not initialized"
    Expected Result: Script fails fast with exit 1 and clear error message
    Evidence: .sisyphus/evidence/task-1-no-init-error.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-happy-path.txt — stdout of successful 4-axis run
  - [ ] task-1-legacy-fallback.txt — stdout showing UNVERIFIABLE behavior
  - [ ] task-1-no-init-error.txt — stderr showing exit 1

  **Commit**: YES (groups with Task 4)
  - Message: `feat(review): add Axis 0 invocation integrity + 4-axis prompt structure`
  - Files: `bin/review-execute.sh`
  - Pre-commit: `bash bin/review-execute.sh --help`

---

- [x] 2. Upgrade `SKILL.md` Review Phase Instructions (lines 235-247)

  **What to do**:
  Replace the Review Phase Instructions block (between `## Review Phase Instructions` and the next `##` heading) with the following expanded version:

  ```markdown
  ## Review Phase Instructions
  - **Goal**: Verify implementation against Spec. Review is a **judge, not a programmer** — it reads and verdicts. It does NOT fix code in-place.
  - **Write permissions during Review**:
    - ✅ MAY write: §10 Review Verdict in Spec (verdict + timestamp + pass number)
    - ✅ MAY write: CodeMap — ONLY if this task changed entry points, core call chain, external dependencies, or risk items (update CodeMap BEFORE issuing verdict, then note the sync in the report)
    - ❌ MUST NOT write: code files, new features, bug fixes, Plan steps
  - **Trigger**: Run `bash "$SDD_ROOT/sdd.sh" review-execute "$_PROJECT_ROOT" --log "$_PROJECT_ROOT/mydocs/evidence/{spec-slug}/execute.log"`
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
  - **Pass numbering**: Each Review run increments N. Append to §10 as `Review Pass N — <timestamp> — <VERDICT>`. Do NOT overwrite previous passes.
  - **After verdict**: Offer to update §10 Review Verdict with the full report. DO NOT auto-advance to Archive.
  ```

  **Must NOT do**:
  - Do not change any other section of SKILL.md
  - Do not change the `review-execute` command reference in the "AI 驱动命令" section (lines ~296-305) — that section is informational and does not need changes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Precise markdown editing of a YAML-frontmatter+markdown file with indentation-sensitive content

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: None (docs, no test dependency)
  - **Blocked By**: None

  **References**:
  - `SKILL.md:235-247` — exact lines to replace
  - `SKILL.md:296-305` — nearby section; must NOT be changed

  **Acceptance Criteria**:
  - [ ] `SKILL.md` contains `Review is a **judge, not a programmer**`
  - [ ] `SKILL.md` contains all 5 verdict options: `PASS`, `PASS_WITH_CONCERNS`, `FAIL_CODE`, `FAIL_PLAN`, `FAIL_SPEC`
  - [ ] `SKILL.md` contains `Review Pass N — YYYY-MM-DDTHH:MM:SSZ`
  - [ ] `SKILL.md` does NOT contain the old 3-verdict line `PASS | PASS_WITH_CONCERNS | FAIL` (without typed suffixes)
  - [ ] `SKILL.md` still has correct YAML frontmatter (verify `---` block untouched)

  **QA Scenarios**:

  ```
  Scenario: SKILL.md contains full 4-axis spec
    Tool: Bash (grep)
    Steps:
      1. grep -n "judge, not a programmer" SKILL.md → must return a match
      2. grep -n "FAIL_CODE" SKILL.md → must return at least 1 match
      3. grep -n "FAIL_PLAN" SKILL.md → must return at least 1 match
      4. grep -n "FAIL_SPEC" SKILL.md → must return at least 1 match
      5. grep -n "Review Pass N" SKILL.md → must return a match
      6. grep -c "^PASS | PASS_WITH_CONCERNS | FAIL$" SKILL.md → must return 0 (old line gone)
    Expected Result: All 6 grep checks pass
    Evidence: .sisyphus/evidence/task-2-skill-grep.txt

  Scenario: SKILL.md YAML frontmatter untouched
    Tool: Bash
    Steps:
      1. head -20 SKILL.md | grep "name: sdd-riper" → must match
      2. head -20 SKILL.md | grep "version:" → must match
    Expected Result: Frontmatter fields still present
    Evidence: .sisyphus/evidence/task-2-frontmatter.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-skill-grep.txt — grep output confirming all required strings present

  **Commit**: YES (groups with Task 3)
  - Message: `docs(review): expand Review Phase to 4-axis governance with typed FAIL routing`
  - Files: `SKILL.md`, `protocols/sdd-riper-one.md`
  - Pre-commit: `grep -c "FAIL_CODE" SKILL.md`

---

- [x] 3. Upgrade `protocols/sdd-riper-one.md` Review section (lines 97-103)

  **What to do**:
  Replace lines 97-103 (the `### 5. Review 阶段` block) with the following expanded version:

  ```markdown
  ### 5. Review 阶段
  - **做什么**：对比原始意图 (Invocation) 与最终实现，评估完成度及遗留问题。Review 是裁判，不是程序员——只读代码，只出判决，不就地修复。
  - **四轴验证**：
    - **Axis 0 — Invocation Integrity**：实现是否仍然服务于原始 requirement / goal / constraints？Finding: `ALIGNED | DRIFTED | VIOLATED | UNVERIFIABLE`
    - **Axis 1 — Spec Plan Coverage**：每个 Plan 步骤是否都有对应实现？Finding: `FULL | PARTIAL | MISSING`
    - **Axis 2 — Code Diff Scope**：实际代码变更是否在 Plan 范围内？Finding: `IN_SCOPE | OUT_OF_SCOPE_MINOR | OUT_OF_SCOPE_MAJOR`
    - **Axis 3 — Execute Log Fidelity**：Execute Log 记录的偏差与实际代码是否吻合？Finding: `FAITHFUL | DISCREPANCY`
  - **产出物**：输出带编号的 Review Pass 报告（格式见下），追加写入 Spec §10，不覆盖历史记录：
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
  - **完成标准**：提供完整的 4 轴 Review 报告并由开发者确认。
  ```

  **Must NOT do**:
  - Do not change any other section of `protocols/sdd-riper-one.md`
  - Do not change the 三铁律, Pre-Research, or other RIPER phase sections

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `protocols/sdd-riper-one.md:97-103` — exact lines to replace
  - `SKILL.md:235-247` — must stay semantically consistent with this task's output

  **Acceptance Criteria**:
  - [ ] File contains `Axis 0 — Invocation Integrity`
  - [ ] File contains all 5 verdict types
  - [ ] File contains `FAIL_SPEC > FAIL_PLAN > FAIL_CODE`
  - [ ] File contains `Review Pass N — YYYY-MM-DDTHH:MM:SSZ`
  - [ ] File contains `裁判，不是程序员`
  - [ ] Lines 1-96 and 105+ are unchanged (verify with git diff)

  **QA Scenarios**:

  ```
  Scenario: Protocol doc contains all required governance terms
    Tool: Bash (grep)
    Steps:
      1. grep -n "Axis 0" protocols/sdd-riper-one.md → must match
      2. grep -n "FAIL_SPEC" protocols/sdd-riper-one.md → must match
      3. grep -n "Review Pass N" protocols/sdd-riper-one.md → must match
      4. grep -n "裁判，不是程序员" protocols/sdd-riper-one.md → must match
    Expected Result: All 4 matches found
    Evidence: .sisyphus/evidence/task-3-protocol-grep.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-protocol-grep.txt — grep output confirming all required strings

  **Commit**: YES (groups with Task 2)

---

- [x] 4. Update `tests/test_review_execute.sh`: 4-axis output assertions

  **What to do**:
  - Read the current test file first. Identify all assertions that check for `轴1`, `轴2`, `轴3`, or the old 3-verdict line.
  - Replace those assertions with:
    1. Assert output contains `轴0 — Invocation Integrity`
    2. Assert output contains `轴1 — Spec Plan Coverage`
    3. Assert output contains `轴2 — Code Diff Scope`
    4. Assert output contains `轴3 — Execute Log Fidelity`
    5. Assert output contains `FAIL_CODE`
    6. Assert output contains `FAIL_PLAN`
    7. Assert output contains `FAIL_SPEC`
    8. Assert output contains `ALIGNED | DRIFTED | VIOLATED | UNVERIFIABLE`
  - Add a test case for the legacy-spec fallback: a project whose Spec has no "Requirement Restatement" section → output must contain `[WARN] Invocation metadata not found` and `UNVERIFIABLE`.
  - Do NOT remove existing test cases that verify other behaviors (exit codes, missing project, etc.).

  **Must NOT do**:
  - Do not remove the exit-code tests (exit 0/1/3)
  - Do not change the test framework/runner setup

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward assertion text substitution in a bash test file

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 1 finalizes script output)
  - **Blocks**: Final Verification
  - **Blocked By**: Task 1

  **References**:
  - `tests/test_review_execute.sh` — full file; read before editing
  - `bin/review-execute.sh` — final output format after Task 1

  **Acceptance Criteria**:
  - [ ] `bash tests/test_review_execute.sh` (or equivalent runner) exits 0
  - [ ] Test file contains assertions for all 4 axis headings
  - [ ] Test file contains a legacy-spec fallback test case
  - [ ] Old 3-verdict-only assertions removed

  **QA Scenarios**:

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. Run: bash tests/test_review_execute.sh
      2. Assert exit code = 0
      3. Assert no lines starting with "FAIL:" in output
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-4-test-run.txt

  Scenario: Legacy spec fallback test exists in suite
    Tool: Bash (grep)
    Steps:
      1. grep -n "UNVERIFIABLE" tests/test_review_execute.sh → must return ≥1 match
    Expected Result: Test for UNVERIFIABLE is present
    Evidence: .sisyphus/evidence/task-4-grep.txt
  ```

  **Evidence to Capture**:
  - [ ] task-4-test-run.txt — test suite output
  - [ ] task-4-grep.txt — grep confirming UNVERIFIABLE test exists

  **Commit**: YES
  - Message: `test(review): update assertions to 4-axis + legacy-spec fallback`
  - Files: `tests/test_review_execute.sh`
  - Pre-commit: `bash tests/test_review_execute.sh`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read this plan end-to-end. For each Must Have: verify it exists in the changed files (grep/read). For each Must NOT Have: search for forbidden patterns. Check evidence files exist.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality + Bash Lint** — `unspecified-high`
  Run `bash -n bin/review-execute.sh` (syntax check). Check for unquoted variables, injection risks from user-provided spec content piped into heredoc, and truncation edge cases.
  Output: `Syntax [PASS/FAIL] | Variables [N issues] | VERDICT`

- [x] F3. **Real QA Execution** — `unspecified-high`
  Set up a temp project with `bash bin/sdd.sh init`. Run `bash bin/review-execute.sh` against it. Verify all 4 axes appear in output. Then run `bash tests/test_review_execute.sh`. Capture all evidence.
  Output: `Script [PASS/FAIL] | Tests [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task, read "What to do" then read actual diff. Verify 1:1 — nothing missing, nothing beyond scope. Confirm README/templates/examples were NOT changed.
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Message | Files |
|------|---------|-------|
| Wave 1+2 (Tasks 2+3) | `docs(review): expand Review Phase to 4-axis governance with typed FAIL routing` | `SKILL.md`, `protocols/sdd-riper-one.md` |
| Wave 1 (Task 1) + Wave 2 (Task 4) | `feat(review): add Axis 0 invocation integrity + 4-axis prompt structure` | `bin/review-execute.sh`, `tests/test_review_execute.sh` |

---

## Success Criteria

### Verification Commands
```bash
# 1. Script syntax check
bash -n bin/review-execute.sh  # Expected: no output, exit 0

# 2. 4-axis headers in script output
bash bin/review-execute.sh tests/fixtures/sample-project | grep -c "轴[0-3]"
# Expected: 4

# 3. Typed verdict enum present
bash bin/review-execute.sh tests/fixtures/sample-project | grep "FAIL_CODE"
# Expected: match found

# 4. SKILL.md governance terms
grep -c "judge, not a programmer" SKILL.md  # Expected: ≥1
grep -c "FAIL_SPEC" SKILL.md               # Expected: ≥1

# 5. Protocol doc governance terms
grep -c "Axis 0" protocols/sdd-riper-one.md  # Expected: ≥1

# 6. Test suite passes
bash tests/test_review_execute.sh  # Expected: exit 0
```

### Final Checklist
- [ ] All "Must Have" items present across 4 files
- [ ] All "Must NOT Have" items absent (no template/discover/resume changes)
- [ ] All tests pass
- [ ] Evidence files exist in `.sisyphus/evidence/`
