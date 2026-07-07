# Subagent Dispatch Protocol (Context Hygiene)

## Purpose

In SDD-RIPER, subagents are not general parallel workers. They are single-use evidence or work-package agents whose job is to absorb noisy context and return compressed signal to the orchestrator.

The primary design goal is context hygiene. Parallelism is a side benefit.

## Phase Dispatch Map

Each SDD phase has activities with a dispatch category:

| Category | Meaning |
|---|---|
| **KEEP** | The orchestrator must do this. It involves gate decisions, user interaction, or cross-artifact judgment that only the orchestrator can make. |
| **MUST_DELEGATE** | An independent subagent must do this. Role separation is a hard constraint — the implementer cannot review their own work. |
| **DELEGATABLE** | The orchestrator may do this directly or delegate to a subagent. The decision depends on task scale and orchestrator context load (see Decision Framework below). |

### Research

| Activity | Category | Rationale |
|---|---|---|
| Requirement Review | KEEP | Requires user interaction (Open Questions, Assumptions). The orchestrator holds the conversation. |
| Findings evidence collection | DELEGATABLE | Code/doc reading can be delegated when volume is high. The subagent returns compressed evidence; the orchestrator writes Findings. |
| Confirmed Requirement | KEEP | Gate decision — the orchestrator finalizes the confirmed requirement from evidence. |
| Research Gate review | MUST_DELEGATE | Role separation — the entity that produced Research cannot review it. An independent subagent reviews the five CR elements and returns a verdict. |

### Innovate

| Activity | Category | Rationale |
|---|---|---|
| Option exploration | DELEGATABLE | A subagent can brainstorm options, but high decision density makes inline exploration natural for small tasks. |
| Option selection | KEEP | Gate decision — the orchestrator chooses the option. |

### Design / Acceptance

| Activity | Category | Rationale |
|---|---|---|
| Design writing | DELEGATABLE | Brief cost is high (must pass Research + Innovate conclusions). Fields have cross-dependencies. Small tasks: inline. Large tasks: delegate per module. |
| Acceptance Criteria writing | DELEGATABLE | Same trade-off as Design. |
| Design review | MUST_DELEGATE | Implemented through the Challenge phase — not a separate dispatch. |

### Plan

| Activity | Category | Rationale |
|---|---|---|
| Plan writing | KEEP | Requires full upstream context (Design + AC). The orchestrator has this; a subagent would need a very large brief. |
| Plan approval | KEEP | Gate decision. |

### Execute

| Activity | Category | Rationale |
|---|---|---|
| Code implementation | DELEGATABLE | Plan has already defined the boundary. Delegation benefits are high: saves orchestrator context and protects Challenge independence. For small steps, inline may be acceptable. |
| Result verification | KEEP | The orchestrator re-reads changed files and runs tests. This is the orchestrator's verification responsibility. |

### Challenge

| Activity | Category | Rationale |
|---|---|---|
| Adversarial review | MUST_DELEGATE | Role separation — the implementer cannot review their own work. |
| Verdict aggregation | KEEP | The orchestrator applies verdict precedence and records the final verdict via `sdd challenge --record-result`. |

### Learning Check / Archive

| Activity | Category | Rationale |
|---|---|---|
| Learning Record creation | KEEP | The orchestrator decides whether a reusable lesson exists. |
| Archive execution | KEEP | The orchestrator owns the archive decision and execution. |

## DELEGATABLE Decision Framework

When an activity is DELEGATABLE, the orchestrator decides based on three signals:

### Signal 1: Context Load

How full is the orchestrator's context? If Research + Innovate + Design have already consumed significant context, delegation saves more than it costs.

- **High** (multiple phases completed, large spec) → lean toward delegation
- **Low** (early phase, small spec) → lean toward inline

### Signal 2: Task Scale

How large is the work package?

- **Small** (1-2 files, <100 lines change) → inline is acceptable
- **Medium** (3-5 files) → delegate if context load is high
- **Large** (6+ files or multi-module) → delegate, possibly as multiple subagents

### Signal 3: Role Separation Benefit

Does delegating this activity protect the independence of a downstream review?

- **High** (Execute → Challenge) → delegation gives double benefit: saves context AND preserves review independence
- **Low** (Findings → no review depends on it) → delegation only saves context

### Decision Matrix

| Context Load | Task Scale | Role Separation | Recommendation |
|---|---|---|---|
| High | Large | High | Delegate |
| High | Large | Low | Delegate |
| Low | Small | High | Delegate |
| Low | Small | Low | Inline |

The most important row is **low + small + high role separation**. Even when the orchestrator has plenty of context and the task is small, if delegating protects review independence, it is the recommended choice. A single inline Execute step may seem harmless, but it creates the condition where the orchestrator is both implementer and reviewer — exactly the pattern that led to self-signed Challenge PASS.

## When To Dispatch

Dispatch a subagent when any condition is true:

1. **Read volume**: the task requires reading more than 3 files or more than 500 lines of raw content.
2. **Iterative probing**: debug work requires probes, reference implementation checks, or variable isolation.
3. **Independent evidence**: the output is a bounded evidence report, such as one Review axis or one Research source.
4. **Large Execute work package**: a Plan step spans multiple modules or would pollute the orchestrator context.
5. **Adversarial challenge**: standard/lite work needs an independent reviewer to attack requirement, design, acceptance, plan, code quality, or archive readiness.

## When Not To Dispatch

Never dispatch subagents for KEEP activities:

- Requirement Review that requires human dialogue.
- Confirmed Requirement finalization (all five elements: Scope Boundary, Irreversibility, Impact Radius, Dependencies & Constraints, Acceptance Intent).
- Research Gate approval (Research Reviewed By / Research Reviewed At).
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
  source_code: |
    <pasted source code for Code Challenge review; include changed files from Execute Log>

files_to_read:
  - path: <absolute path>
    reason: <why this file is relevant>

return_schema: <expected return shape>

constraints:
  - <task-specific constraints>
```

Briefs should paste only what the subagent needs. Do not ask the subagent to discover the whole Spec or project state independently.

### DELEGATABLE Activity Brief Patterns

For common DELEGATABLE activities, the brief follows these patterns:

**Findings evidence collection**:
```yaml
task: Search the codebase for evidence related to <requirement area>
spec_excerpts:
  intake: |
    <Intake section>
  confirmed_requirement: |
    <CR five elements>
files_to_read:
  - path: <key files related to the requirement>
    reason: <why>
return_schema: |
  findings: <list of facts with file:line evidence pointers>
  conventions: <eslint/tsconfig/CI rules discovered>
constraints:
  - Read-only: do not modify any file
  - Return compressed evidence, not raw file content
```

**Execute step**:
```yaml
task: Execute Plan step N: <step description from Plan>
spec_excerpts:
  confirmed_requirement: |
    <CR five elements>
  design_contract: |
    <relevant Design fields>
artifact_excerpts:
  source_code: |
    <current content of files to modify>
files_to_read:
  - path: <files mentioned in Plan step>
    reason: <why>
return_schema: |
  step: <step number and title>
  changes: <what files changed, what was modified>
  test_result: <test command and output summary>
  issues: <problems encountered, if any>
constraints:
  - Only modify files within the Plan step scope
  - Do not modify SDD artifacts (Spec / Design / Execute Log / Learning)
```

**Innovate option exploration**:
```yaml
task: Explore 2-3 implementation approaches for <requirement area>
spec_excerpts:
  confirmed_requirement: |
    <CR five elements>
  findings: |
    <relevant Findings>
return_schema: |
  options:
    - name: <option name>
      pros: <list>
      cons: <list>
      risks: <list>
      requirement_fit: <how well it fits the CR>
  recommendation: <which option and why>
constraints:
  - Read-only: do not modify any file
  - Return structured options, not prose
```

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

1. **Brief is self-sufficient**: the orchestrator pastes relevant Spec / Design / Execute Log / Learning excerpts. For Challenge subagents, include source code (`source_code` in `artifact_excerpts`) so the Code Challenge axis has input to review.
2. **Subagent does not write SDD artifacts**: the orchestrator writes to Spec (control-plane decisions), Design (technical design), Execute Log (execution facts), and Learning Record (reusable decision rules). Subagents MAY modify code files within the scope of their brief — code is not an SDD artifact. But subagents must not create or modify SDD artifacts on their own, because the orchestrator needs to maintain cross-artifact consistency.
3. **Return is compressed**: verdict, summary, evidence pointers, optional recommendations.

## Challenge Agent

Adversarial challenge is the primary MUST_DELEGATE scenario for standard/lite. The challenge agent must be independent — it did not write the code or the design, so it can question assumptions the orchestrator may have confirmed.

- **Must dispatch**: standard/lite tasks must use a challenge subagent. Micro may run inline but must keep adversarial role separate from implementation.
- **Read-only**: the challenge agent does not modify any file (including code). It only returns a verdict.
- **Verdict enum**: defined by `sdd challenge` (PASS / PASS_WITH_CONCERNS / FAIL_SPEC / FAIL_DESIGN / FAIL_ACCEPTANCE / FAIL_PLAN / FAIL_CODE / FAIL_LOG / FAIL_LEARNING). Any `FAIL_*` verdict is a backtrack signal for `sdd cruise`. The challenge agent must not repair the failure.
- **Code Challenge axis**: the challenge agent must also review code quality (duplication, dead code, naming), security (hardcoded secrets, injection risks, missing input validation), correctness (does code match Spec/Design?), and test quality (testing behavior or mocks?). This is not a style review — it verifies code aligns with SDD artifact constraints.
- **Return format**: `Challenge Verdict: <verdict>`, `Backtrack Target: <target>`, `Challenge Summary: <evidence, ≤200 words>`.

## Trust But Verify

The orchestrator must not take a subagent verdict at face value for these gates:

- **Completion Verification Gate**: run tests / lint / build directly and inspect output.
- **Plan Approval Gate**: ask and read the user's approval directly.
- **Final Challenge Verdict**: subagents return per-axis findings; the orchestrator applies verdict precedence and writes the final verdict to Spec via `sdd challenge --record-result`.

## Post-Delegation Verification

After any DELEGATABLE delegation, the orchestrator must verify the result:

1. **Re-read changed files** — confirm changes are within the Plan step or brief scope.
2. **Run tests** — confirm the subagent's reported test results match actual output.
3. **Record to Execute Log** — append the step outcome with the subagent's summary and the orchestrator's verification.

This verification is a KEEP activity — it cannot be delegated.

## Mode Policy

- **standard**: MUST_DELEGATE activities are mandatory. DELEGATABLE activities default to delegation given standard's higher artifact requirements and context load.
- **lite**: MUST_DELEGATE activities are mandatory. DELEGATABLE activities are optional — delegate when context volume or role separation justifies it.
- **micro**: MUST_DELEGATE does not apply (micro skips Research Gate and uses inline Challenge). DELEGATABLE activities default to inline.

The orchestrator's main context stays focused on decisions, gates, and artifact consistency.
