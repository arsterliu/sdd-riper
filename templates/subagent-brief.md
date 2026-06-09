<!-- Subagent Brief Template — fill this out before dispatching a subagent.
     See protocols/subagent-dispatch.md for the full protocol. -->

## Task
<!-- One sentence: what should the subagent find / verify / produce? -->

## Spec Excerpts
<!-- Paste the relevant Spec sections directly (NOT a path reference).
     The subagent must not read the Spec file itself. -->

## Files To Read
<!-- List each file the subagent may read, with the reason.
     Subagent must not read files outside this list. -->
- path:
  reason:

## Return Schema
<!-- Expected return shape — typically inherits from
     protocols/subagent-dispatch.md Return Schema. -->
verdict:
summary: # ≤ 200 words
evidence:
  - # file:line — observation
recommendations: # optional, ≤ 100 words

## Constraints
<!-- The three core constraints (brief is self-sufficient, no file writes,
     compressed return) are always implicit. Add task-specific constraints here. -->
- 
