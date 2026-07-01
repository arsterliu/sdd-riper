# SDD-RIPER Agent Instructions

## Core Rules (No Exceptions)
- **No Spec, No Code** - Do not write code unless a task Spec exists.
- **Spec is Control Plane** - Spec owns task gates and references Design / Execute Log / Learning artifacts.
- **Design is Separate** - standard/lite write technical design in design-file; Plan cannot replace it.
- **Execute Log is Separate** - record step results and deviations in execute-log-file.
- **Learning Check** - create learning-file with reusable decision rules when deviations, bugfixes, concerns, or reopen lessons occur.
- **Chinese Artifact Content** - keep artifact headings and field labels in English; write filled analysis, decisions, plans, evidence, and learning rules in Chinese.
- **Gate Policy** - default gate-policy is auto; `auto-gate` requires `Gate Evidence:` and manual policy requires human approval.
- **Autonomous Cruise** - use `sdd next`, `sdd challenge`, and `sdd cruise --engine auto` for dynamic routing, adversarial review, and bounded repair loops. Reuse host-native loops only when `CRUISE_POLICY="autonomous"`; use prompt-loop compensation otherwise. Use `--emit-claude-prompt` for Claude Code ultracode/workflow guidance and `--record-run` for run ledger.
- **Debug Before Retry** - when a step fails, run debug to find root cause before retrying.

## RIPER Workflow
Follow the SDD-RIPER phases: Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> Learning Check.

## Context Layers
- **Spec**: Current task control plane (<docs-root>/specs/, defaults to mydocs/specs/).
- **Design**: Technical Design / Design Note referenced by Spec design-file.
- **Execute Log**: Step audit trail referenced by Spec execute-log-file.
- **Learning**: Reusable decision rules referenced by Spec learning-file.
- **Cruise Runs**: Observable cruise iteration ledger (<docs-root>/runs/, defaults to mydocs/runs/).
- **CodeMap** (on-demand): Run `sdd codemap <dir>` to get a computed architecture view — not persisted, always current.

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
Research -> Innovate -> Design -> Acceptance -> Plan -> Execute* -> Challenge -> Learning Check -> Archive
```

- **Research**: 需求审视、发现、待澄清问题、假设、已确认需求。
- **Innovate**: compare at least two options and record rejected options.
- **Design**: write technical design in the external `design-file`; keep labels such as Selected Option / ADR, Requirement Traceability, Impact Scope, Architecture View, Data Model / Schema, Interface Contract, Compatibility / Rollback, and Test Strategy in English, and fill the content in Chinese.
- **Acceptance**: write `AC-###` criteria in Spec; keep metadata labels such as `Requirement:`, `Verification:`, `Test:`, and `Manual Evidence:` in English, and write BDD / Gherkin scenario descriptions in Chinese.
- **Plan**: atomic steps derived from Design and Acceptance Criteria; gate evidence required before Execute.
- **Execute**: follow Plan strictly; append each step result to the external Execute Log. Completion Verification (four-axis self-check + AC Coverage summary) is the last step.
- **Challenge**: independent adversarial review; FAIL_* verdicts backtrack to the mapped phase and block archive.