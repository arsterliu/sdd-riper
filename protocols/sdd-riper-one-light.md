# SDD-RIPER Protocol (Lite / Micro)

> Brief reference for AI config files generated for lite / micro projects. Full rules live in `SKILL.md`.

## Core Rules

- **No Spec, No Code**.
- **Spec is Control Plane**: Spec references Design / Execute Log / Learning instead of embedding them.
- **Chinese Filled Content**: keep artifact headings and human-readable labels in English; write filled analysis, decisions, plan steps, evidence, and learning rules in Chinese.
- **Plan Approved Gate**: Execute requires `Plan Approved By:` and `Approved At:`.
- **Execute Log Required**: every mode writes step results to the external `execute-log-file`.
- **Learning Conditional**: deviations, bugfixes, concerns, and reopen lessons require an external `learning-file`.
- **Debug Before Retry**.
- **No Claim Without Verification**.

## Lite Mode

Flow:

```text
Research -> Innovate/Skip -> Design Note -> Acceptance -> Plan -> Execute -> Review -> Learning Check -> Archive
```

Required artifacts:

- Spec with 已确认需求、创新方案或显式跳过原因、验收标准、计划、审批、评审摘要。
- External Design Note in `design-file`, with English labels and Chinese filled content.
- External Execute Log in `execute-log-file`.
- External Learning Record in `learning-file` when required.

Design Note must cover Approach, Impact Scope, Interface / Data Impact, Compatibility, Risks, and Test Strategy.

## Micro Mode

Flow:

```text
Plan -> Execute -> Review -> Learning Check -> Archive
```

Micro skips Research, Innovate, and standalone Design. Plan must include:

- Scope.
- Touched Files.
- Change.
- Impact Scope.
- Data Impact.
- Interface Impact.
- Acceptance.
- Verification.
- Blast Radius.

Micro still requires an external Execute Log, conditional Learning Record, and the human Plan gate.

## Review

- Lite uses the 4-axis review: Invocation, Design/Acceptance/Plan, Code Diff, Execute Log.
- Micro defaults to Axis 2, but archive validation still requires Plan approval, Execute Log, and PASS review summary.

## Subagent Policy

- Lite may use subagents for large reads, debug investigation, or review axes.
- Micro defaults to single-agent execution.
- The orchestrator owns final decisions, Plan approval, completion verification, and final verdict.
