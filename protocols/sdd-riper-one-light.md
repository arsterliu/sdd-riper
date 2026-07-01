# SDD-RIPER Protocol (Lite / Micro)

> Brief reference for AI config files generated for lite / micro projects. Full rules live in `SKILL.md`.

## Core Rules

- **No Spec, No Code**.
- **Spec is Control Plane**: Spec references Design / Execute Log / Learning instead of embedding them.
- **Chinese Filled Content**: keep artifact headings and human-readable labels in English; write filled analysis, decisions, plan steps, evidence, and learning rules in Chinese.
- **Gate Policy**: default policy is auto. Manual approval uses a human `Plan Approved By:`; auto approval uses `Plan Approved By: auto-gate` plus `Gate Evidence:`.
- **Autonomous Cruise**: use `sdd next`, `sdd challenge`, and `sdd cruise` for routing, adversarial review, and bounded repair prompts. Prefer host-native loops with `sdd cruise --engine auto` only when `CRUISE_POLICY="autonomous"`; fallback to prompt-loop compensation when native loop support is unavailable. Use `--emit-claude-prompt` for Claude Code ultracode/workflow guidance and `--record-run` for `<docs-root>/runs/*.cruise.jsonl`. `CRUISE_POLICY="off"` disables cruise output and run recording.
- **Execute Log Required**: every mode writes step results to the external `execute-log-file`.
- **Learning Conditional**: deviations, bugfixes, concerns, and reopen lessons require an external `learning-file`.
- **Debug Before Retry**.
- **No Claim Without Verification**.

## Lite Mode

Flow:

```text
Research -> Innovate/Skip -> Design Note -> Acceptance -> Plan -> Execute* -> Challenge -> Learning Check -> Archive
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
Plan -> Execute* -> Challenge -> Learning Check -> Archive
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

Micro still requires an external Execute Log, conditional Learning Record, and the configured Plan gate.

## Challenge & Completion Verification

- Execute's last step is Completion Verification (four-axis self-check + AC Coverage summary).
- Lite uses the 4-axis self-check: Intake, Design/Acceptance/Plan, Code Diff, Execute Log.
- Micro defaults to Axis 2, but archive validation still requires Plan approval, Execute Log, and PASS challenge verdict.
- Challenge is the sole quality gate after Execute. FAIL_* verdicts backtrack to the mapped phase and block archive.

## Subagent Policy

- Lite may use subagents for large reads, debug investigation, or challenge axes.
- Lite should use an independent challenge agent when available.
- Micro defaults to single-agent execution.
- The orchestrator owns final decisions, Plan approval, completion verification, and final verdict.
