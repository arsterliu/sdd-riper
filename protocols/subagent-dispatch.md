# Subagent Dispatch Protocol (Context Hygiene)

## Purpose

In SDD-RIPER, subagents are not "parallel workers" — they are **single-use read agents** whose job is to absorb noisy context (long file reads, debug investigations, diff audits) and return compressed signal to the main orchestrator.

The primary design goal is **context hygiene**: keeping the orchestrator's main context at high signal density. Parallelism, when it happens, is a side benefit, not the driver.

This protocol is referenced by SKILL.md in phases where context pollution is highest: Debug (BUGFIX loop) / Research (multi-source codebase scanning) / Review (4-axis evidence audit) / Execute (when a single step requires reading many files).

## When to Dispatch

Dispatch a subagent if the task meets ANY of:

1. **Read volume** — requires reading > 3 files OR > 500 lines of raw content
2. **Iterative probing** — requires adding diagnostic probes, trying multiple variables, or reading reference implementations (e.g. debug investigation)
3. **Independent evidence** — produces a verdict against an independent evidence source (e.g. one of the 4 Review axes; one of multiple Research sources)

Within Execute phase, the existing trigger ("Plan > 5 steps or cross 2+ modules") remains valid; the criteria above are additional triggers.

## When NOT to Dispatch

Never dispatch subagents for:

- **Plan writing** — Plan is the orchestrator's primary artifact; needs full Spec visibility
- **Requirement Review** — requires interactive human dialogue (Socratic questioning)
- **Human Gate handling** — Plan Approval, Setup-mode questions, Pre-Archive Git Gate are orchestrator-only
- **Innovate option selection** — convergent decision needs full view across options
- **Requirement Restatement** — orchestrator's main output during Research
- **Archive** — mechanical operation, no benefit
- **Final verdict aggregation** — orchestrator must own the final call; subagents return per-axis findings, not verdicts

## Brief Schema (orchestrator → subagent)

The orchestrator MUST fill `templates/subagent-brief.md` before dispatch. Required fields:

```yaml
task: <one sentence — what the subagent must find / verify / produce>

spec_excerpts:
  <section_name>: |
    <pasted content from Spec, NOT a path reference>
  # paste only the sections the subagent needs

files_to_read:
  - path: <absolute path>
    reason: <why this file is relevant>

return_schema: <expected return shape — typically inherits from Return Schema below>

constraints:
  - <task-specific constraints; the three core constraints below are always implicit>
```

**Why brief must be self-sufficient**: if the subagent reads the Spec file or other state itself, the pollution simply transfers from orchestrator to subagent — the goal is to minimize total noise, not relocate it. The orchestrator paying the cost of paste-and-trim guarantees the subagent's context is minimal.

## Return Schema (subagent → orchestrator)

Subagent MUST return:

```yaml
verdict: <phase-specific enum, e.g. PASS|FAIL|ROOT_CAUSE_FOUND|NEEDS_MORE_PROBES|NEEDS_HUMAN>

summary: <≤ 200 words — what was found, in plain language>

evidence:
  - <file:line — what was observed>
  # evidence is pointers, not content snippets

recommendations: <optional, ≤ 100 words — what the orchestrator should do next>
```

**Forbidden in returns**:
- Raw file contents (use file:line pointers)
- Long quoted excerpts (> 10 lines)
- Verbose reasoning trace ("I read X, then Y, then Z...")
- Multi-paragraph essays (respect the summary cap)

## Three Constraints

1. **Brief is self-sufficient** — orchestrator MUST paste relevant Spec sections into the brief. Subagent MUST NOT read the Spec file directly, nor list project files outside `files_to_read`.

2. **Subagent does not write files** — subagent returns payload only. The orchestrator writes to Spec, CodeMap, or any other artifact. This preserves the single-source-of-truth invariant ("Spec is truth") and ensures the audit trail stays in the main conversation.

3. **Return is compressed** — verdict + summary + evidence pointers + optional recommendations. No raw content. If the orchestrator needs to inspect raw content, it reads the file itself via the evidence pointer.

## Trust But Verify Exceptions

The orchestrator MUST NOT take a subagent verdict at face value for the following gates — even when the subagent returns PASS, the orchestrator runs the gate itself:

- **Completion Verification Gate** (Execute phase) — orchestrator must freshly run tests / linter / build commands itself and read full output. Forbidden to rely on a subagent's success report. This rule predates this protocol; see SKILL.md `## Execute Phase Instructions`.

- **Plan Approval Gate** (Plan phase) — orchestrator must call `AskUserQuestion` itself and read the user's response. Subagents cannot ask for human approval.

- **Final Review Verdict** (Review phase) — subagents return per-axis findings; the orchestrator applies verdict precedence (FAIL_SPEC > FAIL_PLAN > FAIL_CODE), reads evidence pointers for the PRIMARY axis (Axis 2), and writes the final verdict to the Spec itself.

This is the antidote to the failure mode warned about in SKILL.md: *"依赖 subagent 的成功报告而不自行验证"*.

## Relationship to Existing Context Layering

SKILL.md already defines hot / warm / cold context loading (orchestrator chooses what to read). This protocol complements that: when even the warm layer is too noisy, dispatch a subagent to read on the orchestrator's behalf and return only the warm-layer signal.

```
Hot layer (orchestrator always loads)
   ↓
Subagent brief (orchestrator pastes)
   ↓
Subagent reads + summarizes
   ↓
Compressed return (orchestrator integrates)
```

The orchestrator's main context stays focused on decisions, gates, and Spec writes — not raw file inspection.
