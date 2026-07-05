---
name: sdd-riper
version: 2.0.0
description: |
  SDD-RIPER: Structured development workflow for AI-assisted delivery.
  Guides Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> (Cruise) -> Learning Check -> Archive.
  Uses Spec as control plane, external Design as technical design, external Execute Log as audit trail, and Learning Record as reusable decision memory.
  Trigger with: /sdd-riper, /sdd, "setup SDD", "start sdd task".
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
---

# SDD-RIPER Skill

Do not recite this file to the user. Use it to drive the workflow.

The execution-quality methods referenced below (`writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `subagent-driven-development`, `finishing-a-development-branch`) are vendored under `vendored/superpowers/`. See `INTEGRATIONS.md` for the full touchpoint map. Resolution order at each touchpoint: global skill if your editor has it loaded → the vendored copy → the inlined summary kept here as fallback.

## Non-Negotiable Rules

1. **No Spec, No Code**: never write implementation code without an active task Spec.
2. **Spec is the control plane**: Spec owns goal, Research, Innovate, Acceptance Criteria, Plan, human approval, Challenge verdict, and references to external artifacts.
3. **Design is an independent artifact**: standard/lite must write Design in `design-file`. Plan cannot substitute for Design.
4. **Execute Log is an independent artifact**: every mode writes execution facts to `execute-log-file`.
5. **Learning is a reusable decision asset**: when execution produces deviations, bugfixes, concerns, or reopen lessons, write a Learning Record in `learning-file` before archive.
6. **Chinese Filled Content**: keep artifact template headings and human-readable field labels in English. Write the filled requirement analysis, option rationale, design explanations, plan steps, execution notes, evidence, and learning rules in Chinese.
7. **Configured Plan Gate**: do not enter Execute until the configured gate is satisfied. Manual gates require human approval; auto gates require `Plan Approved By: auto-gate`, `Approved At:`, and `Gate Evidence:`.
8. **Debug Before Retry**: when a step fails, run `sdd debug` and establish root cause before retry.
9. **No Claim Without Verification**: freshly run the relevant tests / lint / build before claiming completion.
10. **Orchestrator Owns Decisions**: subagents may collect evidence or perform bounded work, but the main agent owns final requirements, selected option, Plan gate, Challenge verdict, Learning decision, and Archive consistency.
11. **Challenge Failures Backtrack**: adversarial challenge `FAIL_*` verdicts block archive and route work back to the mapped phase.

## CLI Rule

Use the `sdd` command for workflow operations. If `sdd` is not found in PATH, locate it first:

1. Try `which sdd` / `Get-Command sdd` — if found, use it directly.
2. Try `npm root -g` to find the global node_modules, then use `node <npm-global>/sdd-riper/bin/cli.js` as the `sdd` command.
3. If the project itself is the sdd-riper repo, use `node <project-root>/bin/cli.js`.

Once located, store the resolved path (e.g. `SDD_BIN=node /path/to/bin/cli.js`) and use it for all subsequent `sdd` calls.

## Artifact Model

After `discover`, a task has:

- Spec: `<docs-root>/specs/<vN.M-or-vN.M.P>-task.md`
- Design: `<docs-root>/design/<vN.M-or-vN.M.P>-task.design.md` for standard/lite only
- Execute Log: `<docs-root>/logs/<vN.M-or-vN.M.P>-task.execute.md`
- Learning Record: `<docs-root>/learnings/<vN.M-or-vN.M.P>-task.learning.md` when required
- Cruise Run Ledger: `<docs-root>/runs/<vN.M-or-vN.M.P>-task.cruise.jsonl` when autonomous cruise is recorded

Spec frontmatter contains:

```yaml
design-file: "mydocs/design/<vN.M-or-vN.M.P>-task.design.md"
execute-log-file: "mydocs/logs/<vN.M-or-vN.M.P>-task.execute.md"
learning-file: ""
```

Always follow these references. Do not recreate embedded `## Technical Design`, `## Design Note`, `## Execute Log`, or `## Learning Record` sections inside Spec.

## Activation

1. Detect project root.
2. Check for `.sdd-config` and docs root.
3. If not initialized, ask whether to initialize.
4. If initialized, run `sdd resume "<PROJECT_ROOT>"` (or `$SDD_BIN resume "<PROJECT_ROOT>"` if using resolved path) and follow `PHASE_HINT`.

Use plain user-facing text for the activation choice, then stop and wait if the user must choose.

## Setup Mode

When the user chooses setup:

1. Ask target directory if unclear.
2. Run `sdd init "<TARGET_DIR>" --mode <standard|lite|micro>` when mode is known; otherwise pick with `protocols/mode-selection.md` (default `micro`, escalate only on a named signal).
3. Do not manually create the scaffold with Write/Edit.
4. Run `sdd codemap "<TARGET_DIR>"` when an on-demand architecture view is needed — it scans source code live and is never stale.
5. Before creating any task Spec, the agent **must ask the user to provide or confirm `version` and `task-name`**. The agent may suggest a task-name, but must not infer either field silently. The agent must also **ask whether reference materials / context exist**; if yes, place or reference them through `context-source` / `mydocs/context/<task-name>/`.
6. To create the first task, run:

```text
sdd discover "<TARGET_DIR>" --task-name "<confirmed-slug>" --version <confirmed-vN.M-or-vN.M.P> --requirement "<requirement>" [--context "<context-source-or-none>"] [--goal "<goal>"] [--constraints "<constraints>"] [--mode standard|lite|micro]
```

If you have raw materials (PRD, UI mockups, prototypes), place them in `mydocs/context/<slug>/` before running `discover`. The command auto-detects the directory and sets `context-source` in the spec frontmatter.

## Workflow Routing

Run:

```text
sdd resume "<PROJECT_ROOT>"
```

Use `PHASE_HINT`:

- `new_task`: ask whether to run `discover`.
- `research_or_plan`: continue Research / Innovate / Design / Acceptance / Plan as appropriate.
- `execute`: enter Execute only if Plan approval is present.
- `archive`: run Challenge / Learning Check / Archive checks.

For micro mode, skip Research, Innovate, and standalone Design. Go to Plan unless already approved.

### Resolving Open Questions

When the spec contains unresolved `Open Questions` or Plan approval is blocked by unclear requirements:

1. **Ask the user interactively with suggested answers** — use `AskUserQuestion` to present each question with 2-4 concrete options. Each option should be an **AI-suggested answer** derived from the spec context, codebase findings, and domain knowledge — not a placeholder like "fill in yourself." The user confirms, adjusts, or provides a different answer via the "Other" free-text option. Do not try to cover every possibility in the options — the "Other" option is the escape hatch. This is faster and more reliable than telling the user to "edit the spec yourself."
2. **Write answers into the spec** — once the user answers, update the spec's `Open Questions` → `Assumptions` or `Confirmed Requirement` sections accordingly. Do not leave resolved questions as open.
3. **Then proceed to Plan approval** — with clarified requirements, the Plan gate can be satisfied.

Do NOT just list questions and wait. Do NOT offer empty or placeholder options. Actively drive resolution with reasoned suggestions.

Use `sdd next "<PROJECT_ROOT>"` when the next phase or backtrack target is unclear. Use `sdd cruise "<PROJECT_ROOT>"` to generate an autonomous repair-loop prompt. Use `sdd challenge "<PROJECT_ROOT>"` for independent adversarial review.

When the host agent supports a native autonomous loop, reuse it instead of making SDD own model execution. Claude Code may use Dynamic Workflows; Codex and opencode may use their native continuation / loop features when available. SDD remains the control protocol and artifact truth chain.

## Gate / Cruise Policy

SDD uses two orthogonal configuration axes — **Mode** (standard / lite / micro) controls workflow shape (how many phases, how many artifacts); **GATE_POLICY** (manual / auto / advisory) controls governance tightness (who approves Plan, whether human must intervene). Both are set in `.sdd-config`:

```text
GATE_POLICY="auto"              # manual | auto | advisory
CRUISE_POLICY="autonomous"      # off | assisted | autonomous
CRUISE_MAX_ITERATIONS="5"
```

Default is `auto` / `autonomous` / `5` when fields are missing.

- `manual`: requires a human `Plan Approved By: <user>` and `Approved At:`. AI cannot self-approve.
- `auto`: allows `Plan Approved By: auto-gate` only when `Gate Evidence:` and `Approved At:` are provided. Auto-gate is not gate-free — `validate` rejects any missing field.
- `advisory`: same as `auto` for Plan approval, but Challenge phase adds an extra human confirmation prompt. Use when "technically auto, but TL should double-check."

**Selection guide**: unsure → advisory; core / high-risk / irreversible → manual; confident + covered → auto. Teams can set different policies per module.

Cruise engine options:

- `auto`: default. Prefer host-native loop, then fallback to prompt loop.
- `claude-code`: generate instructions for Claude Code Dynamic Workflows when available.
- `codex`: generate instructions for the Codex native loop when the current Codex surface supports it.
- `opencode`: generate instructions for opencode native loop support when available.
- `prompt`: generic prompt loop.
- `local-loop`: prompt-loop compensation for hosts without native loop support; SDD records snapshots but does not run a model executor.

Never move Spec, Design, Plan, Execute Log, Learning, or Challenge evidence into a host-specific workflow file as the source of truth.

Use `sdd cruise "<PROJECT_ROOT>" --engine claude-code --emit-claude-prompt` to output a Claude Code prompt with `ultracode:` and `/effort ultracode` guidance. Claude Code owns the actual workflow script and runtime. Use `sdd cruise "<PROJECT_ROOT>" --record-run --iteration <n>` to append `<docs-root>/runs/<spec>.cruise.jsonl`.

## Mode Policy

| Mode | Use When | Design | Execute Log | Subagent |
| :--- | :--- | :--- | :--- | :--- |
| standard | New features, refactors, cross-module work, security, permissions, billing, migrations, public APIs | external Technical Design | external required | recommended for evidence/work packages/review axes |
| lite | Medium/small scoped changes with known codebase | external Design Note | external required | optional |
| micro | Single-file, low-risk, reversible changes | no standalone Design; Plan contains impact analysis, Acceptance, and Verification | external required | default no |

Upgrade from micro to lite/standard for security, permission, billing, data migration, public API, cross-module side effects, irreversible change, or high uncertainty.

Default to `micro` and escalate only on a named signal — `standard` must be earned (an interface contract, irreversibility, risk class, or three or more stacked signals), not chosen "to be safe". Full rubric: `protocols/mode-selection.md`. The rubric is advisory; it guides the mode chosen at `init` / `discover` and does not change `--mode` behavior.

## Research Phase

Goal: turn raw request into Confirmed Requirement.

Required outputs in Spec:

- Requirement Review
- Findings (from code, docs, historical Specs, **and project conventions**: eslint/prettier/tsconfig rules, test framework, CI gates, etc. — Design and Execute must comply)
- Open Questions
- Assumptions
- Confirmed Requirement

Use `sdd codemap <dir>` for an on-demand architecture view, or archive only when relevant. Place external materials (PRD, UI mockups, API specs, SDK docs) in `mydocs/context/<task-name>/`; `sdd discover` auto-binds the matching directory as `context-source`. If Research requires reading more than 3 files or 500 lines, dispatch a subagent as evidence owner using `protocols/subagent-dispatch.md`. The subagent returns evidence; the orchestrator writes final Research content.

## Innovate Phase

Goal: define viable approaches before choosing.

Drive option exploration and design clarification with `brainstorming` (see `vendored/superpowers/brainstorming/SKILL.md` — read on demand; prefer the global skill if loaded): explore intent one question at a time, propose 2-3 approaches with a recommendation, and present the design in sections for approval before any implementation.

SDD adaptation: keep artifacts in SDD's control plane. Write options into the Spec `Innovate Options` section and the design into the external `design-file` — not into `brainstorming`'s default `docs/superpowers/specs/` path. Do not auto-invoke `writing-plans` at the end; SDD's Plan phase and configured gate own that transition.

standard requires at least two options:

- option summary
- pros / cons
- risks
- requirement fit
- rejected rationale
- selected option

lite may skip Innovate only with an explicit reason:

```text
Innovate: Skipped, Reason: ...
```

micro skips Innovate.

## Design / Acceptance Phase

This phase happens after Innovate and before Plan.

### Method Routing (advisory)

Do not spread every methodology over every task. SDD routes design methodology from `mode` + `riskFlags`. `sdd next` and `sdd cruise` print `DESIGN_METHOD` / `DESIGN_FOCUS_FIELDS` as advisory hints — follow them, but the orchestrator owns the final call.

| Signal | Suggested methodology / focus |
| :--- | :--- |
| micro | none — design intent stays inside Plan |
| lite | ADR for the selected option; Design Note covers Approach + Impact |
| standard (baseline) | ADR + arc42 field structure; C4 context/container for Architecture View |
| + risk: migration | emphasize `Data Model / Schema` + `Data Migration / Backfill` |
| + risk: public-api | emphasize `Interface Contract` + `Compatibility / Rollback` |
| + risk: security | add a threat / permission-boundary pass |
| + risk: billing / irreversible | model state + failure modes; require a rollback/abort plan |
| complex domain (multiple bounded contexts) | consider DDD (advisory — orchestrator judges; no automatic signal) |

The methods catalog lives in Reference Methods. Load a specific method's detail on demand (a global skill, or a vendored copy where available); SDD does not bundle DDD / C4 / arc42 as required reading.

### Standard

Write technical design in `design-file`, not in Spec. Keep labels in English and fill the content in Chinese. It is a technical design contract. It must cover these required core fields:

- Selected Option / ADR
- Requirement Traceability
- Impact Scope
- Architecture View
- Data Model / Schema
- Interface Contract
- Compatibility / Rollback
- Test Strategy

It should also cover these fields when relevant:

- Context / Boundary
- Domain Model
- Data Migration / Backfill
- API Protocol
- State / Concurrency
- Failure Modes
- Security / Permission
- Observability
- Performance / Capacity
- Risks / Trade-offs

Write acceptance criteria in Spec with `AC-###` ids. Keep labels such as `Requirement:` / `Type:` / `Verification:` / `Automated:` / `Test:` / `Manual Evidence:` in English. The verification value remains one of `unit | integration | e2e | manual`. BDD / Gherkin scenario descriptions should be written in Chinese. E2E ACs must reference `Test:` or `Manual Evidence:`; manual ACs must include `Manual Evidence:`.

Testing strategy mapping: `unit` → `Method: tdd` (default for logic), `integration` → `Method: tdd` or `bdd` (interface contracts, data flow), `e2e` → `Method: bdd` (critical user paths, 3-5 scenarios), `manual` → `Method: manual` (last resort, `Manual Evidence:` required). Flaky E2E tests are not PASS — debug the root cause first. When E2E environment is unavailable, mark AC as `SKIPPED` with `Reason` + `Approved By` (human, not auto-gate) + `Approved At`.

### Lite

Write design note in `design-file`, not in Spec. Keep labels in English and fill the content in Chinese. It must cover:

- Approach
- Impact Scope
- Interface / Data Impact
- Compatibility
- Risks
- Test Strategy

Write lightweight acceptance criteria in Spec. Keep them compact, but each AC must still use `AC-###` and include `Verification:` metadata.

### Micro

No standalone Design. Plan must include English labels for:

- Scope
- Touched Files
- Change
- Impact Scope
- Data Impact
- Interface Impact
- Acceptance
- Verification
- Blast Radius

## Plan Phase

Plan is an execution contract, not an architecture document.

Every step should include:

- target file path or module boundary
- concrete change
- linked AC or acceptance condition
- verification command or check

Follow `writing-plans` for step granularity (see `vendored/superpowers/writing-plans/SKILL.md` — read on demand; prefer the global skill if loaded).

Before Execute, satisfy the configured gate and write:

```text
Plan Approved By: <user>
Approved At: <ISO timestamp>
Gate Policy: manual | auto | advisory
Gate Evidence: <required for auto-gate>
```

Do not self-approve. `auto-gate` is allowed only when the evidence is explicit and verifiable.

## Execute Phase

Follow approved Plan steps in order.

For production code, use TDD when applicable, following `test-driven-development` (see `vendored/superpowers/test-driven-development/SKILL.md` — read on demand; prefer the global skill if loaded):

1. Write a failing test.
2. Run and confirm it fails for the right reason.
3. Write the smallest implementation.
4. Refactor without changing behavior.

After each step, append to the external Execute Log referenced by `execute-log-file`:

```text
---
Step: <N and summary>
Status: DONE | BUGFIX | BUGFIX_ESCALATED | DEVIATED_MINOR | DEVIATED_MAJOR | BLOCKED
Files: <paths>
Result: <what changed in Chinese>
Verification: <command/result>
AC Coverage:
  - AC-###: PASS | FAIL | SKIPPED
    Scenarios:
      - "scenario name": PASS | FAIL
    Test: <test file path>
    Method: tdd | bdd | manual
    Reason: <required for SKIPPED: why E2E environment was unavailable>
    Approved By: <required for SKIPPED: human name, not auto-gate>
    Approved At: <required for SKIPPED: ISO-8601>
Deviation: none | <Chinese explanation>
Timestamp: <ISO 8601>
---
```

AC Coverage is a structured record linking each step to the acceptance criteria it covers. Every step that implements or verifies an AC must include an `AC Coverage` entry. The `Scenarios` sub-field maps BDD/Gherkin scenarios to their test results. `Method` declares whether the step used TDD, BDD, or manual verification.

When an E2E test cannot run because the environment is unavailable, mark the AC as `SKIPPED` with `Reason`, `Approved By`, and `Approved At`. `Approved By` cannot be `auto-gate` — skipping verification is a human decision. The agent should attempt to fix the environment first; only if it cannot, mark as BLOCKED and let the human decide to retry or skip.

Deviation rules:

- `DEVIATED_MINOR`: same step goal, same boundary, different implementation approach; log and continue.
- `DEVIATED_MAJOR`: step goal invalid, boundary crossed, downstream Plan invalid, or new requirement discovered; stop and return to Plan / Design.
- `BUGFIX`: defect fixed within current step boundary.
- `BUGFIX_ESCALATED`: not resolved after 3 retries.

When a retry is needed, run:

```text
sdd debug "<PROJECT_ROOT>" --error "<error summary>"
```

For standard/lite, dispatch a Debug Investigator subagent when investigation would pollute context. Micro runs debug in the main context. Drive the investigation with `systematic-debugging` (see `vendored/superpowers/systematic-debugging/SKILL.md` — read on demand; prefer the global skill if loaded): establish root cause before proposing a fix.

Completion Verification Gate (see `vendored/superpowers/verification-before-completion/SKILL.md` — read on demand; prefer the global skill if loaded):

1. Identify the proof command.
2. Run it freshly.
3. Read full output and exit code.
4. Confirm it proves the relevant acceptance criteria.
5. Record the four-axis self-check in the Execute Log's completion-verification step.
6. Only then report completion.

The completion-verification step is the last step in the Execute Log:

```text
Step: completion-verification
Status: DONE | BLOCKED
Result: <Chinese summary of four-axis self-check and AC coverage>
AC Coverage Summary:
  - AC-###: PASS | FAIL | SKIPPED (<verification type>, <test path>)
Four-Axis Checklist:
  - Axis 0 (Intake): aligned | misaligned
  - Axis 1 (Design/Acceptance/Plan): complete | incomplete
  - Axis 2 (Code Diff): within boundary | out of boundary
  - Axis 3 (Execute Log): faithful | unfaithful
Verification: <commands run>
Timestamp: <ISO 8601>
```

This replaces the former Review Verdict / Review Summary section in the Spec. Review has been merged into Execute's Completion Verification Gate. Challenge is now the sole quality gate after Execute.

Never rely on a subagent success report for final verification.

`validate --archive-ready` cross-checks AC Coverage (L1-L4):
- L1: every AC in Spec has a Coverage record in Execute Log
- L2: all Coverage results are PASS (SKIPPED with human approval is OK)
- L3: Test path files exist (when projectDir is provided)
- L4 (limited): Scenario names in Coverage appear in Spec (warning only)

Old Execute Logs without AC Coverage are handled gracefully — the cross-check is skipped.

## Challenge Phase

Review has been merged into Execute's Completion Verification Gate (four-axis self-check recorded in the Execute Log's completion-verification step). Challenge is now the sole quality gate after Execute. `PASS_WITH_CONCERNS` now routes to Learning Check (not Review).

Run:

```text
sdd challenge "<PROJECT_ROOT>"
```

**standard/lite 必须派子 agent 执行对抗审查。** 对抗审查的核心价值是"不是自己审自己"——主 agent 写了代码再自己审，确认偏差不可避免。子 agent 有独立上下文，只返回 verdict + findings。

micro 可在主上下文内执行，但必须保持对抗角色与实现角色分离。

派发规则（遵循 `protocols/subagent-dispatch.md`）：

1. **Brief 自足**：将 spec 内容、design 摘要、execute log 摘要直接贴入 brief，不让子 agent 自己找。
2. **子 agent 只读不写**：challenge agent 不修改任何文件（包括代码），只返回 verdict。
3. **返回压缩**：verdict + backtrack target + summary（≤200 词）。

Challenge agent returns:

```text
Challenge Verdict: PASS | PASS_WITH_CONCERNS | FAIL_SPEC | FAIL_DESIGN | FAIL_ACCEPTANCE | FAIL_PLAN | FAIL_CODE | FAIL_LOG | FAIL_LEARNING
Backtrack Target: Research | Design | Acceptance | Plan | Execute / Debug | Execute Log | Learning Check | Ready
Challenge Summary: <evidence>
```

Challenge examines six axes. Each axis can trigger a `FAIL_*` verdict:

- **Research Challenge**: does confirmed requirement match the original goal? Are hidden assumptions exposed?
- **Design Challenge**: architecture, data model, interface contract, impact scope, compatibility, rollback, failure modes.
- **Acceptance Challenge**: are ACs observable, verifiable, and traceable to requirements?
- **Plan Challenge**: are steps executable, bounded, and derived from Design and ACs?
- **Code Challenge**: code quality (duplication, dead code, naming), security (hardcoded secrets, injection, input validation), correctness (does code match Spec/Design?), test quality (testing behavior or mocks?).
- **Execute Log Challenge**: did execution deviate from Plan? Is AC Coverage truthful?

Code Challenge is what distinguishes SDD Challenge from a PR review. PR review focuses on team collaboration and style; Code Challenge focuses on whether code matches the Spec/Design/Plan constraints and whether it has security or quality defects.

**必须通过 `sdd challenge --record-result` 写入结果，不能手动填写 Challenge Evidence 字段。** 手动填写会被视为伪造证据。正确流程：

1. 派发 subagent 执行对抗审查
2. 收到 subagent 返回的 verdict + summary
3. 运行 `sdd challenge <project-dir> --record-result "VERDICT" --summary "summary" --executed-by "subagent"`
4. 命令自动写入 Challenge Verdict、Backtrack Target、Challenge Summary、Challenge Executed By、Challenge Executed At（当前时间戳）和 Challenge Evidence

`validate --archive-ready` enforces the three challenge evidence fields. Standard/lite require `subagent` in `Challenge Executed By`; micro allows `inline`. Gate policy mirrors `GATE_POLICY`: manual rejects `auto-gate`, auto requires all three fields, advisory adds a human confirmation prompt. `Challenge Executed At` must be a valid ISO-8601 timestamp.

Any `FAIL_*` verdict blocks archive and routes `sdd cruise` back to the mapped phase for repair.

## Cruise Phase

Run:

```text
sdd cruise "<PROJECT_ROOT>" [--engine auto|prompt|local-loop|claude-code|codex|opencode] [--emit-claude-prompt] [--record-run] [--iteration N]
```

The command generates a bounded repair-loop prompt according to `CRUISE_POLICY`. `off` disables cruise output and run recording, `assisted` requires human confirmation between iterations, and `autonomous` may reuse host-native loops. With `--engine auto`, the host agent should reuse its native loop if available and fallback to the prompt loop if not. With `--emit-claude-prompt`, it prints Claude Code workflow/ultracode guidance; it does not write Claude workflow scripts. With `--record-run`, it appends the current state to the run ledger unless cruise is disabled. The agent should repair only the artifact indicated by `BACKTRACK_TARGET`, run `sdd validate`, then run `sdd challenge` again. Stop when the max iteration budget is reached or when high-risk flags appear.

Allowed Cruise writes:

- Completion Verification updates in Execute Log.
- Challenge evidence via `sdd challenge --record-result`.

Forbidden Cruise writes:

- implementation code
- new features
- Plan steps
- silent Design rewrites to justify code

## Learning Check Phase

Run Learning Check after Challenge and before Archive.

Create a Learning Record when any of these are true:

- Execute Log contains `BUGFIX`, `BUGFIX_ESCALATED`, `DEVIATED_MINOR`, or `DEVIATED_MAJOR`.
- Challenge verdict is `PASS_WITH_CONCERNS`.
- The task was reopened from archived work.
- Acceptance criteria were found insufficient during Execute or Challenge.
- The same failure pattern has appeared before.

Use:

```text
sdd new-learning "<PROJECT_ROOT>" "<spec-name>"
```

Fill the generated `learning-file` with reusable decision rules in Chinese, not narrative status updates. Keep field labels in English:

- Source Spec
- Trigger
- Observed Problem
- Root Cause
- Decision Rule
- Applies When
- Recommended Action
- Evidence

Subagents may collect evidence for a Learning Record, but the orchestrator owns whether a lesson is required and writes the final rule.

## Archive Phase

Before archive:

```text
sdd validate "<PROJECT_ROOT>" --archive-ready
```

If validation fails, fix listed gates first.

Before archiving, finish the development branch cleanly — commits, branch hygiene, no stray work-in-progress — following `finishing-a-development-branch` (see `vendored/superpowers/finishing-a-development-branch/SKILL.md` — read on demand; prefer the global skill if loaded).

Then run:

```text
sdd archive "<PROJECT_ROOT>" "<spec-name>"
```

Archive moves:

- Spec into `<docs-root>/archive/`
- referenced Design into `<docs-root>/archive/`
- referenced Execute Log into `<docs-root>/archive/`
- referenced Learning Record into `<docs-root>/archive/` when present

Archive also updates the archived Spec references to archive-relative paths.

Do not archive if the user reports a defect. Return to Execute / Challenge first.

## Reopen

Use reopen only for defects found after archive:

```text
sdd reopen "<PROJECT_ROOT>" "<task-slug>" --defect "<summary>" [--mode standard|lite|micro]
```

Default mode is micro. Reopen creates a new active Spec and a new Execute Log; standard/lite also create a new Design artifact. Do not use reopen to expand scope or add unrelated features.

## Subagent Policy

Use `protocols/subagent-dispatch.md` for SDD-RIPER's own dispatch contract, and `subagent-driven-development` for general routing technique (see `vendored/superpowers/subagent-driven-development/SKILL.md` — read on demand; prefer the global skill if loaded).

Subagents are:

- evidence owners
- work-package owners
- debug investigators
- review-axis investigators

Subagents are not:

- requirement owners
- selected-option owners
- Plan approval owners
- final verdict owners
- learning decision owners
- archive owners

The orchestrator writes all final artifacts and verifies all gates.

## Reference Methods

SDD-RIPER draws on two methodology layers. The **execution-quality** layer is the six vendored superpowers skills wired into Plan / Execute / Subagent / Archive above (see `INTEGRATIONS.md`). The **design-methodology** layer below is anchored in the Design / Acceptance / Learning phases. Use these as design supports, not as mandatory ceremony:

- DDD: domain model, ubiquitous language, bounded context.
- C4: system/container/component architecture view.
- ADR: selected option and trade-off record (see `protocols/adr.md`).
- arc42: complete standard-mode technical design structure.
- TOGAF: business/data/application/technology views for enterprise scope.
- Phoenix Architecture: reliability, distributed systems, evolutionary architecture, failure modes.
- BDD / Gherkin: observable acceptance criteria; in SDD-RIPER this is expressed as `AC-###` plus `Verification:` metadata.
- Learning Record: reusable post-review decision rules derived from execution evidence.

## Command Reference

- `sdd init <dir> --mode standard|lite|micro`
- `sdd discover <dir> --task-name <confirmed-slug> --version <confirmed-vN.M-or-vN.M.P> --requirement <text> [--context ...] [--mode ...]`
- `sdd resume <dir>`
- `sdd status <dir>`
- `sdd next <dir>`
- `sdd challenge <dir>`
- `sdd cruise <dir> [--engine auto|prompt|local-loop|claude-code|codex|opencode] [--emit-claude-prompt] [--record-run] [--iteration N]`
- `sdd console [dir] [--port <port>]`
- `sdd install-skill --target codex|cc-switch|claude|opencode|all [--clean]`
- `sdd validate <dir> --archive-ready`
- `sdd new-learning <dir> [spec-name]`
- `sdd learnings <dir> [--for <spec>]` — project-level learnings, or relevance-ranked recall for a spec
- `sdd review-execute <dir>`
- `sdd debug <dir> --error <msg>`
- `sdd archive <dir> <spec-name>`
- `sdd reopen <dir> <slug> --defect <text> [--mode ...]`
- `sdd codemap <dir>`
