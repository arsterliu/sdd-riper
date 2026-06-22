# SDD-RIPER Protocol (Lite / Micro)

> Brief reference for AI config files generated for lite / micro projects. Full rules live in `SKILL.md`.

## Core Rules

- **No Spec, No Code**.
- **Spec is Control Plane**: Spec references Design / Execute Log instead of embedding them.
- **Plan Approved Gate**: Execute requires `Plan Approved By:` and `Approved At:`.
- **Execute Log Required**: every mode writes step results to the external `execute-log-file`.
- **Debug Before Retry**.
- **No Claim Without Verification**.

## Lite Mode

Flow:

```text
Research -> Innovate/Skip -> Design Note -> Acceptance -> Plan -> Execute -> Review -> Archive
```

Required artifacts:

- Spec with Confirmed Requirement, Innovate Options or explicit skip reason, Acceptance Criteria, Plan, approval, Review Summary.
- External Design Note in `design-file`.
- External Execute Log in `execute-log-file`.

Design Note must cover Approach, Impact Scope, Compatibility, Risks, and Test Strategy.

## Micro Mode

Flow:

```text
Plan -> Execute -> Review -> Archive
```

Micro skips Research, Innovate, and standalone Design. Plan must include:

- Scope.
- Touched Files.
- Change.
- Acceptance.
- Verification.
- Blast Radius.

Micro still requires an external Execute Log and the human Plan gate.

## Review

- Lite uses the 4-axis review: Invocation, Design/Acceptance/Plan, Code Diff, Execute Log.
- Micro defaults to Axis 2, but archive validation still requires Plan approval, Execute Log, and PASS review summary.

## Subagent Policy

- Lite may use subagents for large reads, debug investigation, or review axes.
- Micro defaults to single-agent execution.
- The orchestrator owns final decisions, Plan approval, completion verification, and final verdict.
