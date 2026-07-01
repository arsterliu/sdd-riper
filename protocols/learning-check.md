# Learning Check Protocol

Run after Challenge and before Archive.

## Goal

Convert reusable execution lessons into future-facing decision rules.
Keep artifact headings and human-readable field labels in English. Write the filled lesson content and reusable decision rule in Chinese.

## Required When

Create a Learning Record when any of these are true:

- Execute Log contains `BUGFIX`, `BUGFIX_ESCALATED`, `DEVIATED_MINOR`, or `DEVIATED_MAJOR`.
- Challenge verdict is `PASS_WITH_CONCERNS`.
- The task was reopened from archived work.
- Acceptance criteria were found insufficient during Execute or Challenge.
- The same failure pattern has appeared before.

## Output

Use `sdd new-learning <project-dir> [spec-name]`, then fill the generated `learning-file`.

Required fields:

- Source Spec
- Trigger
- Observed Problem
- Root Cause
- Decision Rule
- Applies When
- Recommended Action
- Evidence

## Quality Bar

- Write a rule that changes future behavior.
- Keep it blame-free and evidence-based.
- Link related ADRs when the lesson came from a design decision.
- Do not archive a required Learning Record with placeholder-only content.
