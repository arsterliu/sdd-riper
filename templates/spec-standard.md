---
date: YYYY-MM-DD
task-name: "Task Name Placeholder"
mode: standard
status: draft   # draft | archived
reopened-from: ""
context-source: ""
diff-base: ""
design-file: ""
execute-log-file: ""
---

<!--
Spec is the control plane for this task. It references external Design and Execute Log artifacts.
Normative truth: Invocation / Confirmed Requirement / Design Reference / Acceptance Criteria / Plan.
Descriptive truth: Findings / Assumptions / CodeMap / risk notes.
Do not rewrite normative truth to justify implementation results without a human gate.
-->

## Summary
<!-- 3-5 lines updated at phase changes: current phase, goal, key constraints, latest progress. -->

## Invocation
<!-- Original user input and task constraints. Do not treat context-source as a replacement for requirement. -->

### Requirement
<!-- SDD_REQUIREMENT -->

### Constraints
<!-- SDD_CONSTRAINTS -->

### Scope
<!-- Impacted area and boundaries. -->

### Risks
<!-- Initial risks and mitigations. -->

### Initial Acceptance Notes
<!-- Acceptance hints from the raw request. Formal acceptance criteria live in ## Acceptance Criteria. -->

## Research

### Requirement Review
<!-- Document-first review of ambiguity, assumptions, contradictions, and acceptance gaps. -->

### Findings
<!-- Facts from code, docs, dependencies, CodeMap, ProjectMap, and archive history. -->

### Open Questions
<!-- Questions that block confident design or planning. -->

### Assumptions
<!-- Temporary assumptions; mark items that still need verification. -->

### Confirmed Requirement
<!-- Calibrated requirement after review and findings. -->

## Innovate Options
<!-- At least two options with pros, cons, risks, rejected rationale, and selected option. -->

## Design Reference
<!-- Technical Design is an external artifact. Write complete design in design-file. -->
design-file:

## Acceptance Criteria
<!--
Use observable, verifiable, traceable criteria. BDD / Gherkin is recommended:

### AC-001: <observable behavior>
Requirement: <requirement id or statement>
Type: functional | non-functional | compatibility | safety
Automated: yes | no
Test: <test file / command / manual verification>

Scenario: <scenario name>
  Given <initial context>
  When <trigger action>
  Then <observable result>
-->

## Plan
<!-- Derived from Design Reference and Acceptance Criteria. Each step should include file path, concrete change, linked AC, and verification. -->

Plan Approved By:
Approved At:

## Execute Log Reference
<!-- Execute Log is an external artifact. Append every Plan step result to execute-log-file. -->
execute-log-file:

## Review Verdict
<!-- Format: Review Pass N - <ISO-8601> - <PASS|PASS_WITH_CONCERNS|FAIL_CODE|FAIL_PLAN|FAIL_SPEC> -->
