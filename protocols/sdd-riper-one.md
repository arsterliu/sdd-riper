# SDD-RIPER Protocol (Standard)

> Brief reference for AI config files. Full rules live in `SKILL.md`.

## Core Rules

- **No Spec, No Code**: never write code without an active task Spec.
- **Spec is Control Plane**: Spec owns goal, gates, plan, verdict, and references to Design / Execute Log.
- **Design Is Separate**: standard mode writes Technical Design in `design-file`; Plan cannot replace it.
- **Execute Log Is Separate**: every Plan step and deviation is recorded in `execute-log-file`.
- **Plan Approved Gate**: never enter Execute without `Plan Approved By:` and `Approved At:`.
- **Debug Before Retry**: failed steps go through `sdd debug` before retry.
- **No Claim Without Verification**: run fresh tests / lint / build before declaring done.

## Phases

```text
Research -> Innovate -> Design -> Acceptance -> Plan -> Execute -> Review -> Archive
```

- **Research**: Requirement Review, Findings, Open Questions, Assumptions, Confirmed Requirement.
- **Innovate**: compare at least two options and record rejected options.
- **Design**: write Technical Design in the external `design-file`; include selected option, traceability, boundary, architecture view, contracts, state, failure modes, security, observability, test strategy, risks.
- **Acceptance**: write AC-### criteria in Spec; BDD / Gherkin is recommended for observable behavior.
- **Plan**: atomic steps derived from Design and Acceptance Criteria; human approval required.
- **Execute**: follow Plan strictly; append each step result to the external Execute Log.
- **Review**: 4-axis audit: Invocation, Design/Acceptance/Plan, Code Diff, Execute Log.
- **Archive**: run `sdd validate <dir> --archive-ready`; `archive` moves Spec plus referenced Design / Execute Log into archive.

## Subagent Policy

Do not make every key phase a subagent decision owner.

- Subagents may own evidence gathering, local work packages, debug investigations, or individual review axes.
- The orchestrator owns requirement boundary, selected option, Plan gate, final verdict, completion verification, and archive consistency.
- A subagent PASS never replaces fresh orchestrator verification.

## Context Layers

- **Hot**: active Spec phase section, Plan, and referenced artifact path.
- **Warm**: Design file, Execute Log file, CodeMap, ProjectMap, relevant historical Specs.
- **Cold**: full archive files, external context bundles, long source reads.

## Mode Summary

- `standard`: full flow; external Technical Design required; external Execute Log required; subagents recommended for evidence/work packages/review axes.
- `lite`: external Design Note required; external Execute Log required; subagents optional.
- `micro`: no standalone Design; Plan must include Acceptance and Verification; external Execute Log required; avoid subagents by default.
