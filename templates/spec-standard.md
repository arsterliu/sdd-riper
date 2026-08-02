---
date: YYYY-MM-DD
task-name: "Task Name Placeholder"
mode: standard
status: draft   # draft | archived
reopened-from: ""
context-source: ""
visual-evidence: ""
visual-evidence-file: ""
diff-base: ""
design-file: ""
execute-log-file: ""
learning-file:
project-profile-revision: ""
project-profile-digest: ""
affected-units: ""
---

<!--
Spec is the task control plane. Keep template headings and field labels in English.
When filling narrative content, write the actual analysis, decisions, plans, and evidence in Chinese.
-->

## Summary
<!-- 3-5 lines in Chinese: current phase, goal, key constraints, latest progress. -->

## Intake

### Requirement
<!-- SDD_REQUIREMENT -->

### Constraints
<!-- SDD_CONSTRAINTS -->

### Scope

### Risks

### Initial Acceptance Hints

## Research

### Requirement Review

### Findings

### Open Questions

### Assumptions

Research Reviewed By:
Research Reviewed At:

### Confirmed Requirement
<!-- Fill each label with analysis in Chinese. These five elements are the structured output of Research. -->
Scope Boundary:
Irreversibility:
Impact Radius:
Dependencies & Constraints:
Acceptance Intent:

## Innovate Options
<!-- Compare at least two options. Write the option analysis in Chinese. -->

## Design Reference
<!-- Technical Design is an independent artifact. Write full design in design-file. -->
design-file:

## Acceptance Criteria
<!--
Use observable, verifiable, traceable criteria. Write scenario text in Chinese.
### AC-001: <observable behavior>
Requirement: <requirement id or description>
Type: functional | non-functional | compatibility | security
Verification: unit | integration | e2e | manual
Provider: <required for e2e; named provider id>
Automated: yes | no
Test: <test file / command; required for automated or e2e coverage>
Manual Evidence: <required for manual verification or manual e2e evidence>

Scenario: <scenario name in Chinese>
  Given <initial context in Chinese>
  When <trigger action in Chinese>
  Then <observable result in Chinese>
-->

## Plan
<!-- Derive from Design Reference and Acceptance Criteria. Write steps in Chinese. -->

Plan Approved By:
Approved At:
Gate Evidence:

## Execute Log Reference
<!-- Execute Log is an independent artifact. Append execution facts to execute-log-file. -->
execute-log-file:

## Completion Verification
<!-- After all Plan steps are done, the agent records the four-axis self-check and AC Coverage summary in the Execute Log's completion-verification step. This replaces the former Review Verdict section. -->

Challenge Verdict:
Backtrack Target:
Challenge Summary:
Challenge Executed By:
Challenge Executed At:
Challenge Evidence:
