---
name: sdd-riper
version: 2.0.0
description: |
  SDD-RIPER: Structured development workflow for AI-assisted delivery.
  Guides Research -> Innovate -> Design/Acceptance -> Plan -> Execute -> Review -> Learning Check -> Archive.
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
2. **Spec is the control plane**: Spec owns goal, Research, Innovate, Acceptance Criteria, Plan, human approval, Review verdict, and references to external artifacts.
3. **Design is an independent artifact**: standard/lite must write Design in `design-file`. Plan cannot substitute for Design.
4. **Execute Log is an independent artifact**: every mode writes execution facts to `execute-log-file`.
5. **Learning is a reusable decision asset**: when execution produces deviations, bugfixes, concerns, or reopen lessons, write a Learning Record in `learning-file` before archive.
6. **Chinese Filled Content**: keep artifact template headings and human-readable field labels in English. Write the filled requirement analysis, option rationale, design explanations, plan steps, execution notes, evidence, and learning rules in Chinese.
7. **Configured Plan Gate**: do not enter Execute until the configured gate is satisfied. Manual gates require human approval; auto gates require `Plan Approved By: auto-gate`, `Approved At:`, and `Gate Evidence:`.
8. **Debug Before Retry**: when a step fails, run `sdd debug` and establish root cause before retry.
9. **No Claim Without Verification**: freshly run the relevant tests / lint / build before claiming completion.
10. **Orchestrator Owns Decisions**: subagents may collect evidence or perform bounded work, but the main agent owns final requirements, selected option, Plan gate, Review verdict, Learning decision, and Archive consistency.
11. **Challenge Failures Backtrack**: adversarial challenge `FAIL_*` verdicts block archive and route work back to the mapped phase.

## CLI Rule

Use the `sdd` command for workflow operations.

## Artifact Model

After `discover`, a task has:

- Spec: `<docs-root>/specs/vN.M-task.md`
- Design: `<docs-root>/design/vN.M-task.design.md` for standard/lite only
- Execute Log: `<docs-root>/logs/vN.M-task.execute.md`
- Learning Record: `<docs-root>/learnings/vN.M-task.learning.md` when required
- Cruise Run Ledger: `<docs-root>/runs/vN.M-task.cruise.jsonl` when autonomous cruise is recorded

Spec frontmatter contains:

```yaml
design-file: "mydocs/design/vN.M-task.design.md"
execute-log-file: "mydocs/logs/vN.M-task.execute.md"
learning-file: ""
```

Always follow these references. Do not recreate embedded `## Technical Design`, `## Design Note`, `## Execute Log`, or `## Learning Record` sections inside Spec.

## Activation

1. Detect project root.
2. Check for `.sdd-config` and docs root.
3. If not initialized, ask whether to initialize.
4. If initialized, run `sdd resume "<PROJECT_ROOT>"` and follow `PHASE_HINT`.

Use plain user-facing text for the activation choice, then stop and wait if the user must choose.

## Setup Mode

When the user chooses setup:

1. Ask target directory if unclear.
2. Run `sdd init "<TARGET_DIR>" --mode <standard|lite|micro>` when mode is known; otherwise pick with `protocols/mode-selection.md` (default `micro`, escalate only on a named signal).
3. Do not manually create the scaffold with Write/Edit.
4. Offer to create CodeMap only when the command output or project complexity indicates it is useful.
5. To create the first task, run:

```text
sdd discover "<TARGET_DIR>" --task-name "<slug>" --version v1.0 --requirement "<requirement>" [--goal "<goal>"] [--constraints "<constraints>"] [--mode standard|lite|micro]
```

## Workflow Routing

Run:

```text
sdd resume "<PROJECT_ROOT>"
```

Use `PHASE_HINT`:

- `new_task`: ask whether to run `discover`.
- `research_or_plan`: continue Research / Innovate / Design / Acceptance / Plan as appropriate.
- `execute`: enter Execute only if Plan approval is present.
- `archive`: run Review / Learning Check / Archive checks.

For micro mode, skip Research, Innovate, and standalone Design. Go to Plan unless already approved.

Use `sdd next "<PROJECT_ROOT>"` when the next phase or backtrack target is unclear. Use `sdd cruise "<PROJECT_ROOT>"` to generate an autonomous repair-loop prompt. Use `sdd challenge "<PROJECT_ROOT>"` for independent adversarial review.

When the host agent supports a native autonomous loop, reuse it instead of making SDD own model execution. Claude Code may use Dynamic Workflows; Codex and opencode may use their native continuation / loop features when available. SDD remains the control protocol and artifact truth chain.

## Gate / Cruise Policy

`.sdd-config` may contain:

```text
GATE_POLICY="auto"              # manual | auto | advisory
CRUISE_POLICY="autonomous"      # off | assisted | autonomous
CRUISE_MAX_ITERATIONS="5"
```

Default is `auto` / `autonomous` / `5` when fields are missing.

- `manual`: requires a human `Plan Approved By:` and `Approved At:`.
- `auto`: allows `Plan Approved By: auto-gate` only when `Gate Evidence:` explains the automatic evidence.
- `advisory`: may continue non-archive exploration with warnings, but archive readiness still reports risks.

Cruise engine options:

- `auto`: default. Prefer host-native loop, then fallback to prompt loop.
- `claude-code`: generate instructions for Claude Code Dynamic Workflows when available.
- `codex`: generate instructions for the Codex native loop when the current Codex surface supports it.
- `opencode`: generate instructions for opencode native loop support when available.
- `prompt`: generic prompt loop.
- `local-loop`: prompt-loop compensation for hosts without native loop support; SDD records snapshots but does not run a model executor.

Never move Spec, Design, Plan, Execute Log, Learning, or Review state into a host-specific workflow file as the source of truth.

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
- Findings
- Open Questions
- Assumptions
- Confirmed Requirement

Use CodeMap / ProjectMap / archive only when relevant. If Research requires reading more than 3 files or 500 lines, dispatch a subagent as evidence owner using `protocols/subagent-dispatch.md`. The subagent returns evidence; the orchestrator writes final Research content.

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
Deviation: none | <Chinese explanation>
Timestamp: <ISO 8601>
---
```

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
5. Only then report completion.

Never rely on a subagent success report for final verification.

## Review Phase

Run:

```text
sdd review-execute "<PROJECT_ROOT>"
```

Review is a judge, not a programmer. Do not fix code during Review.

standard/lite use four axes:

- Axis 0: Intake Alignment
- Axis 1: Design / Acceptance / Plan Coverage
- Axis 2: Code Diff Scope
- Axis 3: Execute Log Fidelity

Axis 2 is primary. Axis 0/1/3 are confirmation axes.

For standard/lite, dispatching one subagent per axis is allowed and often useful. The orchestrator must:

1. Collect axis findings.
2. Confirm primary evidence itself.
3. Apply verdict precedence: `FAIL_SPEC > FAIL_PLAN > FAIL_CODE`.
4. Write final verdict to Spec `Review Verdict` / `Review Summary`.

micro normally runs only Axis 2.

## Challenge Phase

Run:

```text
sdd challenge "<PROJECT_ROOT>"
```

standard/lite should use an independent challenge agent when available. micro may run the challenge inline, but it must keep the adversarial role separate from implementation.

Challenge agents are read-only. They return:

```text
Challenge Verdict: PASS | PASS_WITH_CONCERNS | FAIL_SPEC | FAIL_DESIGN | FAIL_ACCEPTANCE | FAIL_PLAN | FAIL_CODE | FAIL_LOG | FAIL_LEARNING
Backtrack Target: Research | Design | Acceptance | Plan | Execute / Debug | Execute Log | Learning Check | Ready
Challenge Summary: <evidence>
```

Any `FAIL_*` verdict blocks archive and routes `sdd cruise` back to the mapped phase for repair.

## Cruise Phase

Run:

```text
sdd cruise "<PROJECT_ROOT>" [--engine auto|prompt|local-loop|claude-code|codex|opencode] [--emit-claude-prompt] [--record-run] [--iteration N]
```

The command generates a bounded repair-loop prompt according to `CRUISE_POLICY`. `off` disables cruise output and run recording, `assisted` requires human confirmation between iterations, and `autonomous` may reuse host-native loops. With `--engine auto`, the host agent should reuse its native loop if available and fallback to the prompt loop if not. With `--emit-claude-prompt`, it prints Claude Code workflow/ultracode guidance; it does not write Claude workflow scripts. With `--record-run`, it appends the current state to the run ledger unless cruise is disabled. The agent should repair only the artifact indicated by `BACKTRACK_TARGET`, run `sdd validate`, then run `sdd challenge` again. Stop when the max iteration budget is reached or when high-risk flags appear.

Allowed Review writes:

- Spec Review Verdict / Review Summary.
- CodeMap / ProjectMap only if architecture facts changed.

Forbidden Review writes:

- implementation code
- new features
- Plan steps
- silent Design rewrites to justify code

## Learning Check Phase

Run Learning Check after Review and before Archive.

Create a Learning Record when any of these are true:

- Execute Log contains `BUGFIX`, `BUGFIX_ESCALATED`, `DEVIATED_MINOR`, or `DEVIATED_MAJOR`.
- Review verdict is `PASS_WITH_CONCERNS`.
- The task was reopened from archived work.
- Acceptance criteria were found insufficient during Execute or Review.
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

Do not archive if the user reports a defect. Return to Execute / Review first.

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
- `sdd discover <dir> --task-name <slug> --version vN.M --requirement <text> [--mode ...]`
- `sdd resume <dir>`
- `sdd status <dir>`
- `sdd next <dir>`
- `sdd challenge <dir>`
- `sdd cruise <dir> [--engine auto|prompt|local-loop|claude-code|codex|opencode] [--emit-claude-prompt] [--record-run] [--iteration N]`
- `sdd console [dir] [--port <port>]`
- `sdd install-skill --target codex|cc-switch|claude|opencode|all [--clean]`
- `sdd validate <dir> --archive-ready`
- `sdd new-learning <dir> [spec-name]`
- `sdd review-execute <dir>`
- `sdd debug <dir> --error <msg>`
- `sdd archive <dir> <spec-name>`
- `sdd reopen <dir> <slug> --defect <text> [--mode ...]`
- `sdd create-codemap <dir> [--module <name>]`
- `sdd new-codemap <dir> <module>`
- `sdd create-projectmap <dir> [--repos a,b]`
- `sdd new-projectmap <dir>`
- `sdd build-context-bundle <dir> --version vN.M [--sources <dir>]`
