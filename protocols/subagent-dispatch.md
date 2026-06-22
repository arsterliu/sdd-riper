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

## When Not To Dispatch

Never dispatch subagents for:

- Requirement Review that requires human dialogue.
- Confirmed Requirement finalization.
- Innovate option selection.
- Plan writing.
- Plan Approval.
- Completion Verification.
- Final Review verdict aggregation.
- Archive execution.

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

1. **Brief is self-sufficient**: the orchestrator pastes relevant Spec / Design / Execute Log excerpts.
2. **Subagent does not write files**: the orchestrator writes to the correct artifact: Spec for control-plane decisions, Design for technical design, Execute Log for execution facts, CodeMap / ProjectMap for architecture facts.
3. **Return is compressed**: verdict, summary, evidence pointers, optional recommendations.

## Trust But Verify

The orchestrator must not take a subagent verdict at face value for these gates:

- **Completion Verification Gate**: run tests / lint / build directly and inspect output.
- **Plan Approval Gate**: ask and read the user's approval directly.
- **Final Review Verdict**: subagents return per-axis findings; the orchestrator applies verdict precedence and writes the final verdict to Spec.

## Mode Policy

- **standard**: recommended for Research evidence, large Execute packages, debug investigation, and Review axes.
- **lite**: optional; dispatch only when context volume or evidence independence justifies it.
- **micro**: default to no subagents.

The orchestrator's main context stays focused on decisions, gates, and artifact consistency.
