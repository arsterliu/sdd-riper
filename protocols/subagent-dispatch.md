# Subagent Dispatch Protocol (Context Hygiene)

## Purpose

In SDD-RIPER, subagents are not general parallel workers. They are single-use evidence or work-package agents whose job is to absorb noisy context and return compressed signal to the orchestrator.

The primary design goal is context hygiene. Parallelism is a side benefit.

## When To Dispatch

Dispatch a subagent when any condition is true:

1. **Read volume**: the task requires reading more than 3 files or more than 500 lines of raw content.
2. **Iterative probing**: debug work requires probes, reference implementation checks, or variable isolation.
3. **Independent evidence**: the output is a bounded evidence report, such as one Review axis or one Research source.
4. **Large Execute work package**: a Plan step spans multiple modules or would pollute the orchestrator context.
5. **Adversarial challenge**: standard/lite work needs an independent reviewer to attack requirement, design, acceptance, plan, execution, or archive readiness.

## When Not To Dispatch

Never dispatch subagents for:

- Requirement Review that requires human dialogue.
- Confirmed Requirement finalization.
- Innovate option selection.
- Plan writing.
- Plan Approval.
- Completion Verification.
- Final Challenge verdict aggregation.
- Archive execution.
- Repairing artifacts after a failed challenge verdict.

Subagents may produce evidence or recommendations. They do not own final decisions.

## Brief Schema

The orchestrator must provide a self-contained brief.

```yaml
task: <one sentence: what the subagent must find, verify, or produce>

spec_excerpts:
  <section_name>: |
    <pasted content from Spec, not a path reference>

artifact_excerpts:
  design: |
    <pasted Design excerpt when needed>
  execute_log: |
    <pasted Execute Log excerpt when needed>

files_to_read:
  - path: <absolute path>
    reason: <why this file is relevant>

return_schema: <expected return shape>

constraints:
  - <task-specific constraints>
```

Briefs should paste only what the subagent needs. Do not ask the subagent to discover the whole Spec or project state independently.

## Return Schema

```yaml
verdict: <phase-specific enum>
backtrack_target: <Research|Design|Acceptance|Plan|Execute / Debug|Execute Log|Learning Check|Ready>
summary: <compressed finding>
evidence:
  - <file:line and observation>
recommendations: <optional next action>
```

Forbidden in returns:

- Raw file dumps.
- Long quoted excerpts.
- Verbose reasoning trace.
- Unbounded essays.

## Three Constraints

1. **Brief is self-sufficient**: the orchestrator pastes relevant Spec / Design / Execute Log / Learning excerpts.
2. **Subagent does not write SDD artifacts**: the orchestrator writes to Spec (control-plane decisions), Design (technical design), Execute Log (execution facts), and Learning Record (reusable decision rules). Subagents MAY modify code files within the scope of their brief — code is not an SDD artifact. But subagents must not create or modify SDD artifacts on their own, because the orchestrator needs to maintain cross-artifact consistency.
3. **Return is compressed**: verdict, summary, evidence pointers, optional recommendations.

## Challenge Agent

Adversarial challenge is the primary mandatory subagent scenario for standard/lite. The challenge agent must be independent — it did not write the code or the design, so it can question assumptions the orchestrator may have confirmed.

- **Must dispatch**: standard/lite tasks must use a challenge subagent. Micro may run inline but must keep adversarial role separate from implementation.
- **Read-only**: the challenge agent does not modify any file (including code). It only returns a verdict.
- **Verdict enum**: defined by `sdd challenge` (PASS / PASS_WITH_CONCERNS / FAIL_SPEC / FAIL_DESIGN / FAIL_ACCEPTANCE / FAIL_PLAN / FAIL_CODE / FAIL_LOG / FAIL_LEARNING). Any `FAIL_*` verdict is a backtrack signal for `sdd cruise`. The challenge agent must not repair the failure.
- **Return format**: `Challenge Verdict: <verdict>`, `Backtrack Target: <target>`, `Challenge Summary: <evidence, ≤200 words>`.

## Trust But Verify

The orchestrator must not take a subagent verdict at face value for these gates:

- **Completion Verification Gate**: run tests / lint / build directly and inspect output.
- **Plan Approval Gate**: ask and read the user's approval directly.
- **Final Challenge Verdict**: subagents return per-axis findings; the orchestrator applies verdict precedence and writes the final verdict to Spec via `sdd challenge --record-result`.

## Mode Policy

- **standard**: mandatory for adversarial challenge. Recommended for Research evidence, large Execute packages, debug investigation, and Challenge axes.
- **lite**: mandatory for adversarial challenge. Other dispatch optional — only when context volume or evidence independence justifies it.
- **micro**: challenge may run inline (but must keep adversarial role separate). Default to no other subagents.

The orchestrator's main context stays focused on decisions, gates, and artifact consistency.
