---
date: YYYY-MM-DD
task-name: "Task Name Placeholder"
status: active
source-spec: ""
---

# Execute Log

<!-- Append-only execution facts. Keep labels and status enums in English; write explanations in Chinese. -->

## Execute Log

<!--
Step N:
Cruise Iteration:
Status: DONE | BUGFIX | BUGFIX_ESCALATED | DEVIATED_MINOR | DEVIATED_MAJOR | BLOCKED
Command:
Files:
Verification:
AC Coverage:
  - AC-###: PASS | FAIL | SKIPPED
    Scenarios:
      - "scenario name": PASS | FAIL
    Test: <test file path>
    Method: tdd | bdd | manual
    Reason: <required for SKIPPED: why E2E environment was unavailable>
    Approved By: <required for SKIPPED: human name, not auto-gate>
    Approved At: <required for SKIPPED: ISO-8601>
Deviation: none | <Chinese explanation>
Timestamp: ISO-8601

Completion Verification Step (last step):
Step: completion-verification
Status: DONE | BLOCKED
Result: <Chinese summary of four-axis self-check and AC coverage>
AC Coverage Summary:
  - AC-###: PASS | FAIL | SKIPPED (<verification type>, <test path>)
Four-Axis Checklist:
  - Axis 0 (Intake): aligned | misaligned
  - Axis 1 (Design/Acceptance/Plan): complete | incomplete
  - Axis 2 (Code Diff): within boundary | out of boundary
  - Axis 3 (Execute Log): faithful | unfaithful
Verification: <commands run>
Timestamp: ISO-8601
-->
