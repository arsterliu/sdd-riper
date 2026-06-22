---
name: sdd-riper
version: 2.0.0
description: |
  SDD-RIPER: Structured development workflow for AI-assisted delivery.
  Guides Research -> Innovate -> Design/Acceptance -> Plan -> Execute -> Review -> Archive.
  Uses Spec as control plane, external Design as technical design, and external Execute Log as audit trail.
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

## Non-Negotiable Rules

1. **No Spec, No Code**: never write implementation code without an active task Spec.
2. **Spec is the control plane**: Spec owns goal, Research, Innovate, Acceptance Criteria, Plan, human approval, Review verdict, and references to external artifacts.
3. **Design is an independent artifact**: standard/lite must write Design in `design-file`. Plan cannot substitute for Design.
4. **Execute Log is an independent artifact**: every mode writes execution facts to `execute-log-file`.
5. **Human Plan Gate**: do not enter Execute until `Plan Approved By:` and `Approved At:` are filled by or on behalf of the user.
6. **Debug Before Retry**: when a step fails, run `sdd debug` and establish root cause before retry.
7. **No Claim Without Verification**: freshly run the relevant tests / lint / build before claiming completion.
8. **Orchestrator Owns Decisions**: subagents may collect evidence or perform bounded work, but the main agent owns final requirements, selected option, Plan gate, Review verdict, and Archive consistency.

## CLI Rule

Use the `sdd` command for workflow operations.

## Artifact Model

After `discover`, a task has:

- Spec: `<docs-root>/specs/vN.M-task.md`
- Design: `<docs-root>/design/vN.M-task.design.md` for standard/lite only
- Execute Log: `<docs-root>/logs/vN.M-task.execute.md`

Spec frontmatter contains:

```yaml
design-file: "mydocs/design/vN.M-task.design.md"
execute-log-file: "mydocs/logs/vN.M-task.execute.md"
```

Always follow these references. Do not recreate embedded `## Technical Design`, `## Design Note`, or `## Execute Log` sections inside Spec.

## Activation

1. Detect project root.
2. Check for `.sdd-config` and docs root.
3. If not initialized, ask whether to initialize.
4. If initialized, run `sdd resume "<PROJECT_ROOT>"` and follow `PHASE_HINT`.

Use plain user-facing text for the activation choice, then stop and wait if the user must choose.

## Setup Mode

When the user chooses setup:

1. Ask target directory if unclear.
2. Run `sdd init "<TARGET_DIR>" --mode <standard|lite|micro>` when mode is known; otherwise default to standard.
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
- `archive`: run Review / Archive checks.

For micro mode, skip Research, Innovate, and standalone Design. Go to Plan unless already approved.

## Mode Policy

| Mode | Use When | Design | Execute Log | Subagent |
| :--- | :--- | :--- | :--- | :--- |
| standard | New features, refactors, cross-module work, security, permissions, billing, migrations, public APIs | external Technical Design | external required | recommended for evidence/work packages/review axes |
| lite | Medium/small scoped changes with known codebase | external Design Note | external required | optional |
| micro | Single-file, low-risk, reversible changes | no standalone Design; Plan contains Acceptance and Verification | external required | default no |

Upgrade from micro to lite/standard for security, permission, billing, data migration, public API, cross-module side effects, irreversible change, or high uncertainty.

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

### Standard

Write Technical Design in `design-file`, not in Spec. It must cover at least:

- Selected Option / ADR
- Requirement Traceability
- Context / Boundary
- Architecture View
- Interface Contract
- Data / State
- Failure Modes
- Security / Permission
- Observability
- Test Strategy
- Risks / Trade-offs

Write Acceptance Criteria in Spec with AC-### items. BDD / Gherkin scenarios are recommended for observable behavior.

### Lite

Write Design Note in `design-file`, not in Spec. It must cover:

- Approach
- Impact Scope
- Compatibility
- Risks
- Test Strategy

Write lightweight Acceptance Criteria in Spec.

### Micro

No standalone Design. Plan must include:

- Scope
- Touched Files
- Change
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

Before Execute, ask for approval and then write:

```text
Plan Approved By: <user>
Approved At: <ISO timestamp>
```

Do not self-approve.

## Execute Phase

Follow approved Plan steps in order.

For production code, use TDD when applicable:

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
Result: <what changed>
Verification: <command/result>
Deviation: <none or explanation>
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

For standard/lite, dispatch a Debug Investigator subagent when investigation would pollute context. Micro runs debug in the main context.

Completion Verification Gate:

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

- Axis 0: Invocation Integrity
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

Allowed Review writes:

- Spec Review Verdict / Review Summary.
- CodeMap / ProjectMap only if architecture facts changed.

Forbidden Review writes:

- implementation code
- new features
- Plan steps
- silent Design rewrites to justify code

## Archive Phase

Before archive:

```text
sdd validate "<PROJECT_ROOT>" --archive-ready
```

If validation fails, fix listed gates first.

Then run:

```text
sdd archive "<PROJECT_ROOT>" "<spec-name>"
```

Archive moves:

- Spec into `<docs-root>/archive/`
- referenced Design into `<docs-root>/archive/`
- referenced Execute Log into `<docs-root>/archive/`

Archive also updates the archived Spec references to archive-relative paths.

Do not archive if the user reports a defect. Return to Execute / Review first.

## Reopen

Use reopen only for defects found after archive:

```text
sdd reopen "<PROJECT_ROOT>" "<task-slug>" --defect "<summary>" [--mode standard|lite|micro]
```

Default mode is micro. Reopen creates a new active Spec and a new Execute Log; standard/lite also create a new Design artifact. Do not use reopen to expand scope or add unrelated features.

## Subagent Policy

Use `protocols/subagent-dispatch.md`.

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
- archive owners

The orchestrator writes all final artifacts and verifies all gates.

## Reference Methods

Use these as design supports, not as mandatory ceremony:

- DDD: domain model, ubiquitous language, bounded context.
- C4: system/container/component architecture view.
- ADR: selected option and trade-off record.
- arc42: complete standard-mode technical design structure.
- TOGAF: business/data/application/technology views for enterprise scope.
- Phoenix Architecture: reliability, distributed systems, evolutionary architecture, failure modes.
- BDD / Gherkin: observable acceptance criteria.

## Command Reference

- `sdd init <dir> --mode standard|lite|micro`
- `sdd discover <dir> --task-name <slug> --version vN.M --requirement <text> [--mode ...]`
- `sdd resume <dir>`
- `sdd status <dir>`
- `sdd console [dir] [--port <port>]`
- `sdd install-skill --target codex|claude|opencode|all [--clean]`
- `sdd validate <dir> --archive-ready`
- `sdd review-execute <dir>`
- `sdd debug <dir> --error <msg>`
- `sdd archive <dir> <spec-name>`
- `sdd reopen <dir> <slug> --defect <text> [--mode ...]`
- `sdd create-codemap <dir> [--module <name>]`
- `sdd new-codemap <dir> <module>`
- `sdd create-projectmap <dir> [--repos a,b]`
- `sdd new-projectmap <dir>`
- `sdd build-context-bundle <dir> --version vN.M [--sources <dir>]`
