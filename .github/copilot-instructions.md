# GitHub Copilot Instructions - SDD-RIPER

## Workflow
Always follow the SDD-RIPER methodology when generating code suggestions.

## Key Rules
- No Spec, No Code: check <docs-root>/specs/ (defaults to mydocs/specs/) before suggesting code.
- SDD-RIPER phases: Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> Learning Check.
- Design, Execute Log, and Learning are separate artifacts referenced by design-file, execute-log-file, and learning-file.
- Artifact headings and field labels stay English; filled artifact content should be Chinese by default.
- Plan Approved gate: do not suggest implementation code until `Plan Approved By:` and `Approved At:` are filled; auto-gate also requires `Gate Evidence:`.
- Autonomous workflow: use `sdd next`, `sdd challenge`, and `sdd cruise --engine auto` to route, challenge, and repair bounded work; use `--emit-claude-prompt` for Claude Code ultracode guidance and `--record-run` for run ledger.
- Archive gate: run sdd validate <dir> --archive-ready before archive.
- Debug before retry: when code fails, run debug to find root cause before retrying.
- CodeMap (on-demand): run `sdd codemap <dir>` for a live architecture view — not persisted, always current.

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