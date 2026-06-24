# SDD-RIPER Protocol (Standard)

> Brief reference for AI config files. Full rules live in `SKILL.md`.

## Core Rules

- **No Spec, No Code**: never write code without an active task Spec.
- **Spec is Control Plane**: Spec owns goal, gates, plan, verdict, and references to Design / Execute Log / Learning.
- **Design Is Separate**: standard mode writes Technical Design in `design-file`; Plan cannot replace it.
- **Execute Log Is Separate**: every Plan step and deviation is recorded in `execute-log-file`.
- **Learning Is Separate**: reusable lessons from deviations, bugfixes, concerns, or reopen work are recorded in `learning-file`.
- **Chinese Filled Content**: keep artifact headings and human-readable labels in English; write filled analysis, decisions, design details, plan steps, evidence, and learning rules in Chinese.
- **Plan Approved Gate**: never enter Execute without `Plan Approved By:` and `Approved At:`.
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
- **Plan**: atomic steps derived from Design and Acceptance Criteria; human approval required.
- **Execute**: follow Plan strictly; append each step result to the external Execute Log.
- **Review**: 4-axis audit: Invocation, Design/Acceptance/Plan, Code Diff, Execute Log.
- **Learning Check**: create `learning-file` when execution produced reusable lessons.
- **Archive**: run `sdd validate <dir> --archive-ready`; `archive` moves Spec plus referenced Design / Execute Log / Learning into archive.

## Subagent Policy

Do not make every key phase a subagent decision owner.

- Subagents may own evidence gathering, local work packages, debug investigations, or individual review axes.
- The orchestrator owns requirement boundary, selected option, Plan gate, final verdict, completion verification, Learning decision, and archive consistency.
- A subagent PASS never replaces fresh orchestrator verification.

## Context Layers

- **Hot**: active Spec phase section, Plan, and referenced artifact path.
- **Warm**: Design file, Execute Log file, Learning files, CodeMap, ProjectMap, relevant historical Specs.
- **Cold**: full archive files, external context bundles, long source reads.

## Mode Summary

- `standard`: full flow; external Technical Design required; external Execute Log required; subagents recommended for evidence/work packages/review axes.
- `lite`: external Design Note required; external Execute Log required; subagents optional.
- `micro`: no standalone Design; Plan must include Impact Scope, Data Impact, Interface Impact, Acceptance, and Verification; external Execute Log required; avoid subagents by default.
