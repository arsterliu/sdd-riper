# SDD-RIPER Protocol (Standard)

> **Brief reference for AI config files** (AGENTS.md / CLAUDE.md / .cursorrules / copilot-instructions.md).
> **Full protocol**: load SKILL.md in your editor's skill system, or read `<SDD-RIPER-repo>/SKILL.md`.

## 6 Core Rules (No Exceptions)
- **No Spec, No Code** — Never write code without a task Spec
- **Spec is Truth** — Spec is the single source of truth, not the code
- **Reverse Sync** — When code diverges from Spec, update the Spec
- **Plan Approved gate** — Never enter Execute without `Plan Approved By: <user>` filled
- **Debug Before Retry** — When a step fails, run `sdd debug` to find root cause before retrying
- **No Claim Without Verification** — Freshly run tests / linter / build before declaring done

## RIPER Phases
Research → Innovate → Plan → Execute → Review → Archive

- **Research** — Requirement Review (document-first with gate) → Findings → Open Questions → Assumptions → Confirmed Requirement
- **Innovate** — Compare ≥2 solution options (lite may skip)
- **Plan** — Atomic steps (file path + change + acceptance); Spec Coverage Gate; **human approval required**
- **Execute** — Strict plan execution; record every deviation in `## Execute Log`; TDD before code
- **Review** — 4-axis audit (Invocation / Plan / Code Diff / Execute Log); orchestrator owns final verdict
- **Archive** — Finalize and move Spec to `<docs-root>/archive/`

## 6 Superpowers Touchpoints (Vendored)
- Plan: `writing-plans` — step granularity (2–5 min, file + change + acceptance)
- Execute: `subagent-driven-development` — context-hygiene subagent dispatch (see `protocols/subagent-dispatch.md` for SDD-RIPER-specific contract)
- Execute: `test-driven-development` — RED → GREEN → REFACTOR; no failing test, no production code
- Execute: `systematic-debugging` — BUGFIX loop, 4 phases (root cause before fix)
- Execute: `verification-before-completion` — freshly run before claiming done
- Archive: `finishing-a-development-branch` — pre-archive git gate

Resolution order: global superpowers > vendored (`vendored/superpowers/<skill>/SKILL.md`) > SKILL.md inlined summary. See `INTEGRATIONS.md`.

## Context Layers
- **Hot** (always): active phase section of Spec + Plan
- **Warm** (per phase): CodeMap, ProjectMap, related Spec sections
- **Cold** (on demand): historical Specs, archive files, context bundles

## Docs Root
Default `<docs-root>` = `mydocs/`. Override via `.sdd-config` (`DOCS_DIR=...`).

## Mode
- `standard` — full RIPER, all gates
- `lite` — Innovate can Skipped; Coverage Gate checks Invocation only; Review still runs all 4 axes
- `micro` — Research / Innovate skipped; Review runs Axis 2 only; default mode for `reopen` patches
