# SDD-RIPER Protocol (Lite / Micro)

> **Brief reference for AI config files generated for lite / micro mode projects.**
> **Full protocol**: load SKILL.md in your editor's skill system, or read `<SDD-RIPER-repo>/SKILL.md`.

## 6 Core Rules (No Exceptions)
- **No Spec, No Code** — Never write code without a task Spec
- **Spec is Truth** — Spec is the single source of truth
- **Reverse Sync** — Code diverges from Spec → update Spec
- **Plan Approved gate** — Never enter Execute without `Plan Approved By: <user>`
- **Debug Before Retry** — Fail → `sdd debug` → root cause → fix
- **No Claim Without Verification** — Freshly run tests / build before "done"

## Mode Differences
- **standard** — full RIPER, all gates
- **lite** (this file) — Innovate can Skipped; Coverage Gate checks Invocation only; Review runs all 4 axes
- **micro** — Research / Innovate skipped; Review runs Axis 2 (Code Diff Scope) only; default mode for `reopen` patches

## RIPER Phases
Research → Innovate → Plan → Execute → Review → Archive

**Three gates are non-negotiable in all modes**:
- Human Gate (Plan 审批) — must have explicit `Plan Approved By: <user>` in Spec before Execute
- Execute Log — every Plan step recorded in `## Execute Log`
- debug-before-retry — when a step fails, run `sdd debug` first, then form a hypothesis, then patch (max 3 retries per defect)

## 6 Superpowers Touchpoints (Vendored)
Same as standard: `writing-plans` / `subagent-driven-development` / `test-driven-development` / `systematic-debugging` / `verification-before-completion` / `finishing-a-development-branch`. See `INTEGRATIONS.md`.

## Context Loading (Lite / Micro)
Default = **hot layer only** (active phase section of Spec). CodeMap / ProjectMap / context bundles load on demand.

## Docs Root
Default `<docs-root>` = `mydocs/`. Override via `.sdd-config` (`DOCS_DIR=...`).
