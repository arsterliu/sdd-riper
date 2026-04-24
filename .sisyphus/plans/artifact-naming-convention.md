# Artifact Naming Convention

## TL;DR

> **Quick Summary**: Introduce `v{N}.{M}` versioned naming to all sdd-riper CLI artifacts (Spec, CodeMap, Context Bundle, Archive, Evidence) so each regeneration produces a new traceable file rather than overwriting silently.
>
> **Deliverables**:
> - `bin/_workflow_core.sh` updated (discover + resume)
> - `bin/new-codemap.sh` updated
> - `bin/build-context-bundle.sh` updated
> - `bin/archive.sh` updated
> - `SKILL.md` naming guidance updated
> - Install copy at `C:\Users\liuyl\.config\opencode\skills\sdd-riper\` synced
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (shared version helper) → Tasks 2-5 (per-script) → Task 6 (SKILL.md) → Sync

---

## Context

### Original Request
用户希望为所有产出物制定统一命名规则，解决多次生成同名文件导致管理混乱的问题。

### Decisions Made
| Decision | Value |
|---|---|
| Style | kebab-case |
| Version format | `v{N}.{M}` e.g. `v1.0`, `v1.1`, `v1.10` |
| Auto-increment | scan existing same-name files, take highest minor + 1 |
| Minor rollover | linear (`v1.9 → v1.10`, NOT `v2.0`) |
| Major bump | manual only via `--version` |
| Old files | kept (no overwrite) |
| Collision on `--version` | fail with non-zero exit + clear error |
| `--version` scope | `discover`, `new-codemap`, `build-context-bundle` only |
| resume selection | highest version of most-recently-modified task name |
| archive version | auto-inherited from source Spec version |
| ProjectMap | unchanged |

### Naming Convention Summary
| Artifact | Path | New Pattern |
|---|---|---|
| Spec | `mydocs/specs/` | `v{N}.{M}-{task-name}.md` |
| CodeMap | `mydocs/codemap/` | `v{N}.{M}-{module}.md` |
| Context Bundle | `mydocs/context/` | `v{N}.{M}-{bundle-name}.md` |
| Archive (human) | `mydocs/archive/` | `v{N}.{M}-{task-name}-human.md` |
| Archive (llm) | `mydocs/archive/` | `v{N}.{M}-{task-name}-llm.md` |
| Evidence | `mydocs/evidence/` | `{task-name}/step-{N}-{slug}.{ext}` |
| ProjectMap | `mydocs/projectmap.md` | unchanged |

### Metis Review — Identified Gaps (addressed)
- **Version math**: must use integer major/minor parsing, not bash float arithmetic
- **`--version` scope**: only creation commands; `resume`/`archive` excluded
- **Archive resolution**: replace current fuzzy substring match with exact versioned slug
- **Resume selection**: most-recently-modified task's highest version
- **Legacy files**: ignore (do not migrate); warn only if name parsing fails
- **Collision**: fail explicitly if requested version already exists

---

## Work Objectives

### Core Objective
Add versioned filename generation to all artifact-creating CLI commands, with auto-increment, manual override, and deterministic resume/archive resolution.

### Concrete Deliverables
- Spec files named `v1.0-{task-name}.md`, incrementing on each `discover`
- CodeMap files named `v1.0-{module}.md`, incrementing on each `new-codemap`
- Context Bundle prompt output path versioned (`v1.0-{bundle}.md`)
- Archive files named `v{spec-version}-{task}-human.md` + `_llm.md`
- Evidence organized under `evidence/{task-name}/step-{N}-{slug}.ext`
- `resume` reads highest-versioned Spec of most-recently-modified task

### Must Have
- `_sdd_next_version()` shared bash helper function (to avoid duplication)
- `--version` flag on `discover`, `new-codemap`, `build-context-bundle`
- Deterministic resume with documented selection policy
- Exact archive resolution (no fuzzy match)

### Must NOT Have (Guardrails)
- No migration of legacy unversioned files (advisory warning only if they exist)
- No float arithmetic for versions — always integer pairs `(major, minor)`
- No interactive selectors added to `resume`
- No changes to ProjectMap, `sdd.sh` dispatch, or phase/status logic
- No new database/registry files — derive everything from filesystem

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (no test framework)
- **Automated tests**: None
- **Agent-Executed QA**: YES (bash commands in temp project directory)

### QA Policy
Each task includes bash-executable scenarios against a temp sdd-riper project.
Evidence saved under `.sisyphus/evidence/task-{N}-{slug}.txt`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Add _sdd_next_version() helper to _workflow_core.sh [quick]
├── Task 2: Update discover (Spec versioning) in _workflow_core.sh [quick]
├── Task 3: Update new-codemap.sh [quick]
├── Task 4: Update build-context-bundle.sh [quick]

Wave 2 (After Wave 1):
├── Task 5: Update archive.sh (inherit spec version) [quick]
├── Task 6: Update resume in _workflow_core.sh [quick]
├── Task 7: Update SKILL.md naming guidance [quick]

Wave FINAL (After Wave 2):
├── Task 8: Sync all changed files to install copy [quick]
├── F1: QA verification (bash scenarios) [unspecified-high]
```

---

## TODOs

- [ ] 1. Add `_sdd_next_version()` shared helper to `bin/_workflow_core.sh`

  **What to do**:
  - Add a bash function `_sdd_next_version(dir, logical_name, prefix)` that:
    1. Scans `dir` for files matching `v[0-9]+.[0-9]+-{logical_name}.md` (and variants like `-human.md`)
    2. Parses each into `(major, minor)` as integers — no float arithmetic
    3. Returns the next version: same major, minor+1 (linear, no rollover: `v1.9 → v1.10`)
    4. Returns `v1.0` if no existing versioned files found
  - Add a bash function `_sdd_version_exists(dir, logical_name, version)` that checks if a specific version already exists
  - Both functions must handle malformed filenames gracefully (skip/warn, don't fail)
  - Place near top of `_workflow_core.sh`, after existing variable declarations

  **Must NOT do**:
  - No float arithmetic (`echo "1.9 + 0.1" | bc` is forbidden — use integer split)
  - No changes to discover/resume logic in this task (that's Task 2 and 6)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Tasks 2, 3, 4, 6 depend on this)
  - **Parallel Group**: Wave 1 — must complete first
  - **Blocks**: Tasks 2, 3, 4, 5, 6

  **References**:
  - `D:\workspace\canway\other\sdd-riper\bin\_workflow_core.sh:1-30` — existing function structure to follow
  - `D:\workspace\canway\other\sdd-riper\bin\_workflow_core.sh:77-79` — task-name validation pattern (same slug style)

  **Acceptance Criteria**:

  ```
  Scenario: First file returns v1.0
    Tool: Bash
    Steps:
      1. Source _workflow_core.sh in a temp shell
      2. Call _sdd_next_version /tmp/empty-dir user-login specs
      3. Assert output equals "v1.0"
    Evidence: .sisyphus/evidence/task-1-first-version.txt

  Scenario: Existing v1.2 returns v1.3
    Tool: Bash
    Steps:
      1. Create /tmp/test-specs/ with files: v1.0-user-login.md, v1.2-user-login.md, v1.1-user-login.md
      2. Call _sdd_next_version /tmp/test-specs user-login ""
      3. Assert output equals "v1.3"
    Evidence: .sisyphus/evidence/task-1-increment.txt

  Scenario: v1.9 returns v1.10 (no rollover)
    Tool: Bash
    Steps:
      1. Create /tmp/test-specs/ with v1.9-user-login.md
      2. Call _sdd_next_version /tmp/test-specs user-login ""
      3. Assert output equals "v1.10"
    Evidence: .sisyphus/evidence/task-1-no-rollover.txt

  Scenario: Malformed file does not crash
    Tool: Bash
    Steps:
      1. Create /tmp/test-specs/ with: user-login.md (legacy unversioned), vX.Y-user-login.md (bad)
      2. Call _sdd_next_version /tmp/test-specs user-login ""
      3. Assert output equals "v1.0" (skipped bad files gracefully)
    Evidence: .sisyphus/evidence/task-1-malformed.txt
  ```

  **Commit**: YES (groups with Task 2)

---

- [ ] 2. Update `discover` in `bin/_workflow_core.sh` — versioned Spec filename

  **What to do**:
  - Find where `SPEC_OUT` is constructed in the `create-spec` branch (currently: `SPEC_OUT="$TARGET_DIR/mydocs/specs/${TASK_NAME}.md"`)
  - Replace with:
    1. If `--version` was passed: validate format `^v[0-9]+\.[0-9]+$`; check collision with `_sdd_version_exists`; fail exit 1 if collision
    2. Else: call `_sdd_next_version "$TARGET_DIR/mydocs/specs" "$TASK_NAME" ""` to get next version
    3. Set `SPEC_OUT="$TARGET_DIR/mydocs/specs/${VERSION}-${TASK_NAME}.md"`
  - Add `--version` flag parsing to the `discover` argument loop
  - `TASK_NAME` validation remains `^[A-Za-z0-9_-]+$` (unchanged)

  **Must NOT do**:
  - Do not change Spec file content/template
  - Do not change `SPEC_CREATION_PROMPT` output format
  - Do not touch resume logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Tasks 3, 4 after Task 1)
  - **Parallel Group**: Wave 1 (after Task 1)
  - **Blocks**: Task 5 (archive), Task 6 (resume)
  - **Blocked By**: Task 1

  **References**:
  - `D:\workspace\canway\other\sdd-riper\bin\_workflow_core.sh` — `create-spec` branch, `SPEC_OUT` line
  - Task 1 functions: `_sdd_next_version`, `_sdd_version_exists`

  **Acceptance Criteria**:

  ```
  Scenario: First discover creates v1.0 spec
    Tool: Bash
    Steps:
      1. Init temp project: ./sdd.sh init /tmp/test-proj
      2. Run: ./sdd.sh discover /tmp/test-proj --task-name user-login --requirement "req" --goal "goal"
      3. Assert file exists: /tmp/test-proj/mydocs/specs/v1.0-user-login.md
      4. Assert old path /tmp/test-proj/mydocs/specs/user-login.md does NOT exist
    Evidence: .sisyphus/evidence/task-2-first.txt

  Scenario: Second discover same task creates v1.1
    Tool: Bash
    Steps:
      1. Run discover again with same --task-name user-login
      2. Assert BOTH v1.0-user-login.md AND v1.1-user-login.md exist
    Evidence: .sisyphus/evidence/task-2-increment.txt

  Scenario: --version v2.0 override works
    Tool: Bash
    Steps:
      1. Run: ./sdd.sh discover /tmp/test-proj --task-name user-login --version v2.0 ...
      2. Assert file exists: /tmp/test-proj/mydocs/specs/v2.0-user-login.md
    Evidence: .sisyphus/evidence/task-2-override.txt

  Scenario: --version collision fails
    Tool: Bash
    Steps:
      1. Run discover with --version v1.0 when v1.0-user-login.md already exists
      2. Assert exit code != 0
      3. Assert stderr contains "already exists" or "collision"
    Evidence: .sisyphus/evidence/task-2-collision.txt
  ```

  **Commit**: YES (with Task 1) — `feat(naming): versioned Spec + version helper`

---

- [ ] 3. Update `bin/new-codemap.sh` — versioned CodeMap filename

  **What to do**:
  - Find where `OUTPUT_FILE` is constructed (currently: `OUTPUT_FILE="$CODEMAP_DIR/${MODULE_NAME}.md"`)
  - Replace with auto-increment logic using `_sdd_next_version "$CODEMAP_DIR" "$MODULE_NAME" ""` (source `_workflow_core.sh` to use the helper, or inline a copy)
  - Add `--version` flag parsing
  - Validate format and check collision same as Task 2
  - Set `OUTPUT_FILE="$CODEMAP_DIR/${VERSION}-${MODULE_NAME}.md"`
  - `create-codemap.sh` outputs a prompt with `OUTPUT_PATH` — update that too so the AI-facing path is also versioned

  **Must NOT do**:
  - Do not change CodeMap template content
  - Do not change `--force` behavior for other purposes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Tasks 2, 4)
  - **Parallel Group**: Wave 1 (after Task 1)
  - **Blocked By**: Task 1

  **References**:
  - `D:\workspace\canway\other\sdd-riper\bin\new-codemap.sh:35-39` — OUTPUT_FILE construction
  - `D:\workspace\canway\other\sdd-riper\bin\create-codemap.sh:43-46` — OUTPUT_PATH in prompt
  - Task 1 functions: `_sdd_next_version`, `_sdd_version_exists`

  **Acceptance Criteria**:

  ```
  Scenario: new-codemap creates v1.0-auth.md
    Tool: Bash
    Steps:
      1. Run: ./sdd.sh new-codemap /tmp/test-proj auth
      2. Assert file exists: /tmp/test-proj/mydocs/codemap/v1.0-auth.md
    Evidence: .sisyphus/evidence/task-3-first.txt

  Scenario: Second new-codemap same module creates v1.1
    Tool: Bash
    Steps:
      1. Run again: ./sdd.sh new-codemap /tmp/test-proj auth
      2. Assert both v1.0-auth.md AND v1.1-auth.md exist
      3. Assert v1.0-auth.md content unchanged
    Evidence: .sisyphus/evidence/task-3-increment.txt
  ```

  **Commit**: YES — `feat(naming): versioned CodeMap`

---

- [ ] 4. Update `bin/build-context-bundle.sh` — versioned Context Bundle path

  **What to do**:
  - Find where `OUTPUT_PATH` / `BUNDLE_NAME` is set (currently default: `context-bundle-$(date +%Y%m%d)`)
  - Replace default name with `context-bundle` (logical name) + version via `_sdd_next_version "$CONTEXT_DIR" "context-bundle" ""`
  - If `--out <name>` is passed, use that as logical name and version it the same way
  - Add `--version` flag parsing
  - The script outputs a Prompt (doesn't write the file directly) — update the `OUTPUT_PATH` shown in the prompt to use the versioned filename

  **Must NOT do**:
  - Do not write the bundle file directly (the AI writes it based on the prompt)
  - Do not remove `--out` flag

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Tasks 2, 3)
  - **Parallel Group**: Wave 1 (after Task 1)
  - **Blocked By**: Task 1

  **References**:
  - `D:\workspace\canway\other\sdd-riper\bin\build-context-bundle.sh:43-46,85` — BUNDLE_NAME and OUTPUT_PATH
  - Task 1 functions: `_sdd_next_version`

  **Acceptance Criteria**:

  ```
  Scenario: Default bundle name is versioned
    Tool: Bash
    Steps:
      1. Run: ./sdd.sh build-context-bundle /tmp/test-proj
      2. Assert stdout contains "OUTPUT_PATH" with pattern "v1.0-context-bundle.md"
      3. Assert stdout does NOT contain date pattern "context-bundle-20"
    Evidence: .sisyphus/evidence/task-4-default.txt

  Scenario: Second run shows v1.1
    Tool: Bash
    Steps:
      1. Manually create /tmp/test-proj/mydocs/context/v1.0-context-bundle.md
      2. Run: ./sdd.sh build-context-bundle /tmp/test-proj
      3. Assert stdout shows OUTPUT_PATH = v1.1-context-bundle.md
    Evidence: .sisyphus/evidence/task-4-increment.txt
  ```

  **Commit**: YES — `feat(naming): versioned Context Bundle path`

---

- [ ] 5. Update `bin/archive.sh` — inherit Spec version, drop date prefix

  **What to do**:
  - The archive command takes a spec name argument (currently positional slug)
  - Change input to accept the full versioned spec filename (e.g. `v1.1-user-login`) OR auto-detect by finding the highest-versioned spec matching the logical name
  - Extract version from source spec filename: parse `v{N}.{M}` prefix
  - Set `HUMAN_FILE="$ARCHIVE_DIR/${VERSION}-${SPEC_SLUG}-human.md"`
  - Set `LLM_FILE="$ARCHIVE_DIR/${VERSION}-${SPEC_SLUG}-llm.md"`
  - Remove `DATE_STR` / `$(date +%Y%m%d)` prefix logic
  - Replace current fuzzy substring matching with exact versioned slug resolution
  - `--force` flag: allow overwrite of same-version archive (explicit re-archive)

  **Must NOT do**:
  - Do not change archive content/template
  - Do not add `--version` flag (archive inherits from spec, not user-specified)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 6 after Wave 1)
  - **Parallel Group**: Wave 2
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `D:\workspace\canway\other\sdd-riper\bin\archive.sh:37-60` — HUMAN_FILE/LLM_FILE construction and spec matching

  **Acceptance Criteria**:

  ```
  Scenario: Archive inherits spec version
    Tool: Bash
    Steps:
      1. Create /tmp/test-proj/mydocs/specs/v1.1-user-login.md
      2. Run: ./sdd.sh archive /tmp/test-proj user-login
      3. Assert file exists: /tmp/test-proj/mydocs/archive/v1.1-user-login-human.md
      4. Assert file exists: /tmp/test-proj/mydocs/archive/v1.1-user-login-llm.md
      5. Assert NO file matching "20[0-9]{6}_*" pattern exists in archive/
    Evidence: .sisyphus/evidence/task-5-archive.txt

  Scenario: Archive fails clearly if no matching spec
    Tool: Bash
    Steps:
      1. Run: ./sdd.sh archive /tmp/test-proj nonexistent-task
      2. Assert exit code != 0
      3. Assert stderr mentions "no spec found"
    Evidence: .sisyphus/evidence/task-5-not-found.txt
  ```

  **Commit**: YES — `feat(naming): versioned Archive, inherit spec version`

---

- [ ] 6. Update `resume` in `bin/_workflow_core.sh` — read highest-versioned Spec of most recent task

  **What to do**:
  - Current logic reads latest spec by modified time (all specs)
  - New logic:
    1. Find distinct logical task names from all `v{N}.{M}-{task-name}.md` files in `specs/`
    2. Group by task name
    3. Find the task whose highest-versioned spec was most recently modified
    4. Within that task, select the file with the highest `v{N}.{M}` (integer sort, not lexical)
    5. Set `LATEST_SPEC` to that file path
  - Legacy unversioned files (`task-name.md` without `v` prefix) are ignored with a warning line to stderr

  **Must NOT do**:
  - Do not add interactive selectors
  - Do not change PHASE_HINT / SPEC_STATUS / HAS_CODEMAP output format
  - Do not change resume's output key-value format

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 5)
  - **Parallel Group**: Wave 2
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `D:\workspace\canway\other\sdd-riper\bin\_workflow_core.sh:211-218` — current LATEST_SPEC selection logic

  **Acceptance Criteria**:

  ```
  Scenario: resume picks highest version of most recent task
    Tool: Bash
    Steps:
      1. Create specs: v1.0-user-login.md (old mtime), v1.2-user-login.md (newer), v1.0-payments.md (newest mtime)
      2. Run: ./sdd.sh resume /tmp/test-proj
      3. Assert LATEST_SPEC contains "v1.0-payments.md" (most recently modified task, highest version)
    Evidence: .sisyphus/evidence/task-6-resume.txt

  Scenario: Legacy unversioned file triggers warning but does not crash
    Tool: Bash
    Steps:
      1. Create specs/user-login.md (legacy, no version prefix) alongside v1.0-user-login.md
      2. Run: ./sdd.sh resume /tmp/test-proj
      3. Assert exit code = 0
      4. Assert stderr contains "legacy" or "unversioned" warning
      5. Assert LATEST_SPEC = v1.0-user-login.md (not the legacy file)
    Evidence: .sisyphus/evidence/task-6-legacy.txt
  ```

  **Commit**: YES — `feat(naming): versioned resume selection`

---

- [ ] 7. Update `SKILL.md` naming guidance

  **What to do**:
  - In `## AI 驱动命令` section (line 190+), update path examples for `discover`, `new-codemap`, `build-context-bundle`, `archive` to show versioned filenames (`v1.0-{name}.md`)
  - In Setup Mode step 5c (the `discover` run command), update the example output path shown in the guidance comment
  - In Workflow Mode step 4 / CodeMap rules, update any hardcoded path examples
  - Add a short note under `## AI 驱动命令` explaining the naming convention and version auto-increment behavior

  **Must NOT do**:
  - Do not change RIPER phase instructions
  - Do not change the bash preamble block
  - Do not change Setup Mode logic (step 4 CodeMap guidance, step 5 Context Bundle guidance)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Tasks 5, 6)
  - **Parallel Group**: Wave 2

  **References**:
  - `D:\workspace\canway\other\sdd-riper\SKILL.md:166-217` — AI 驱动命令 section
  - `D:\workspace\canway\other\sdd-riper\SKILL.md:57-71` — Setup Mode step 5

  **Acceptance Criteria**:

  ```
  Scenario: SKILL.md shows versioned paths
    Tool: Bash (grep)
    Steps:
      1. grep -n "v1.0-" D:\workspace\canway\other\sdd-riper\SKILL.md
      2. Assert at least 3 matches showing versioned filenames in examples
    Evidence: .sisyphus/evidence/task-7-skill-grep.txt
  ```

  **Commit**: YES — `docs(skill): update naming convention examples`

---

- [ ] 8. Sync all changed files to install copy

  **What to do**:
  - Copy the following to `C:\Users\liuyl\.config\opencode\skills\sdd-riper\`:
    - `bin/_workflow_core.sh`
    - `bin/new-codemap.sh`
    - `bin/build-context-bundle.sh`
    - `bin/archive.sh`
    - `SKILL.md`
  - Verify each file is present in install copy via `Get-FileHash` or `Select-String` spot check

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must be after all other tasks)
  - **Blocked By**: Tasks 1-7

  **Acceptance Criteria**:

  ```
  Scenario: Install copy contains versioned logic
    Tool: Bash (PowerShell)
    Steps:
      1. Select-String -Path "C:\Users\liuyl\.config\opencode\skills\sdd-riper\bin\_workflow_core.sh" -Pattern "_sdd_next_version"
      2. Assert match found
      3. Select-String -Path "C:\Users\liuyl\.config\opencode\skills\sdd-riper\SKILL.md" -Pattern "v1.0-"
      4. Assert match found
    Evidence: .sisyphus/evidence/task-8-sync.txt
  ```

  **Commit**: NO (just file copy)

---

## Final Verification Wave

- [ ] F1. **QA verification** — `unspecified-high`

  Run all QA scenarios from Tasks 1-8 sequentially in a temp project. Verify:
  - `discover` twice → two versioned spec files exist
  - `new-codemap` twice → two versioned codemap files exist
  - `build-context-bundle` → prompt output path is versioned
  - `archive` → output files inherit spec version
  - `resume` → LATEST_SPEC points to correct versioned file
  - `--version v2.0` override works
  - `--version v1.0` collision fails with exit 1

  Output: `PASS/FAIL per scenario` | Evidence: `.sisyphus/evidence/final-qa/`

---

## Commit Strategy
- Single commit: `feat(naming): add v{N}.{M} versioned naming to all artifacts`
- Files: all changed bin/ scripts + SKILL.md

## Success Criteria
- All 5 artifact types produce versioned filenames on creation
- Auto-increment works without collision
- Manual `--version` override works and fails on collision
- `resume` deterministically picks correct spec
- Install copy synced and verified
