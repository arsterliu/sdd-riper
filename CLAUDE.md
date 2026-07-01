# Claude Project Instructions - SDD-RIPER

## Memory
- Always load the latest Spec before starting any task.
- Follow design-file and execute-log-file references when Design or execution facts are needed.
- Track RIPER phase transitions explicitly.

## Behavior
- NEVER write code without a Spec.
- NEVER proceed past Plan without gate evidence: manual approval, or `Plan Approved By: auto-gate` plus `Gate Evidence:` under auto policy.
- NEVER use Plan as a substitute for standard/lite Design.
- NEVER manually write Challenge Evidence fields. Always use `sdd challenge --record-result "VERDICT" --summary "..." --executed-by "subagent"` to record challenge results.
- ALWAYS record deviations from Plan in the Execute Log file referenced by execute-log-file.
- ALWAYS create a Learning Record when deviations, bugfixes, concerns, or reopen lessons produce reusable rules.
- ALWAYS keep artifact headings and field labels in English, and write filled artifact content in Chinese.
- ALWAYS run debug before retrying a failed step.

## RIPER Phase Gate
Current phase must be explicit. Prohibited: jumping phases silently.

## Entry Commands
- sdd discover <dir> --task-name <name> --version v1.0 ... = start a new task / Research phase.
- sdd validate <dir> --archive-ready = check Spec, Design, Execute Log, Learning, approval, and review gates before archive.
- sdd next <dir> = inspect dynamic workflow state and next action.
- sdd challenge <dir> = generate an independent adversarial review prompt.
- sdd cruise <dir> [--engine auto|prompt|local-loop|claude-code|codex|opencode] [--emit-claude-prompt] [--record-run] [--iteration N] = generate cruise prompt, optional Claude ultracode/workflow prompt, and optional run ledger entry; local-loop is prompt-loop compensation, not an SDD model executor.
- sdd new-learning <dir> [spec-name] = create and bind a Learning Record.
- sdd resume <dir> = resume an existing task / reload context.

## Docs Root Configuration
The docs root directory defaults to mydocs/ but can be overridden via .sdd-config (DOCS_DIR=...).

## Mode: standard

## Protocol Reference
# SDD-RIPER Protocol (Standard)

> Brief reference for AI config files. Full rules live in `SKILL.md`.

## Core Rules

- **No Spec, No Code**: never write code without an active task Spec.
- **Spec is Control Plane**: Spec owns goal, gates, plan, verdict, and references to Design / Execute Log / Learning.
- **Design Is Separate**: standard mode writes Technical Design in `design-file`; Plan cannot replace it.
- **Execute Log Is Separate**: every Plan step and deviation is recorded in `execute-log-file`.
- **Learning Is Separate**: reusable lessons from deviations, bugfixes, concerns, or reopen work are recorded in `learning-file`.
- **Chinese Filled Content**: keep artifact headings and human-readable labels in English; write filled analysis, decisions, design details, plan steps, evidence, and learning rules in Chinese.
- **Gate Policy**: default policy is auto. Manual approval uses a human `Plan Approved By:`; auto approval uses `Plan Approved By: auto-gate` plus `Gate Evidence:`.
- **Autonomous Cruise**: use `sdd next`, `sdd challenge`, and `sdd cruise` to route, challenge, and repair bounded work. Prefer host-native loops with `sdd cruise --engine auto` only when `CRUISE_POLICY="autonomous"`; fallback to prompt-loop compensation when native loop support is unavailable. Use `--emit-claude-prompt` for Claude Code ultracode/workflow guidance and `--record-run` for `<docs-root>/runs/*.cruise.jsonl`. `CRUISE_POLICY="off"` disables cruise output and run recording.
- **Debug Before Retry**: failed steps go through `sdd debug` before retry.
- **No Claim Without Verification**: run fresh tests / lint / build before declaring done.

## Phases

```text
Research -> Innovate -> Design -> Acceptance -> Plan -> Execute -> Review -> Learning Check -> Archive
```

- **Research**: 需求审视、发现、待澄清问题、假设、已确认需求。
- **Innovate**: compare at least two options and record rejected options.
- **Design**: write technical design in the external `design-file`; keep labels such as Selected Option / ADR, Requirement Traceability, Impact Scope, Architecture View, Data Model / Schema, Interface Contract, Compatibility / Rollback, and Test Strategy in English, and fill the content in Chinese.
- **Acceptance**: write `AC-###` criteria in Spec; keep metadata labels such as `Requirement:`, `Verification:`, `Test:`, and `Manual Evidence:` in English, and write BDD / Gherkin scenario descriptions in Chinese.
- **Plan**: atomic steps derived from Design and Acceptance Criteria; gate evidence required before Execute.
- **Execute**: follow Plan strictly; append each step result to the external Execute Log.
- **Review**: 4-axis audit: Intake, Design/Acceptance/Plan, Code Diff, Execute Log.