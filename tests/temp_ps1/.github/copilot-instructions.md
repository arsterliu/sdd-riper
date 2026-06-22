# GitHub Copilot Instructions - SDD-RIPER

## Workflow
Always follow the SDD-RIPER methodology when generating code suggestions.

## Key Rules
- No Spec, No Code: check <docs-root>/specs/ (defaults to mydocs/specs/) before suggesting code.
- SDD-RIPER phases: Research -> Innovate -> Design/Acceptance -> Plan -> Execute -> Review.
- Design and Execute Log are separate artifacts referenced by design-file and execute-log-file.
- Plan Approved gate: do not suggest implementation code until Plan is approved.
- Archive gate: run sdd validate <dir> --archive-ready before archive.
- Debug before retry: when code fails, run debug to find root cause before retrying.
- ProjectMap: cross-repo interfaces are documented in <docs-root>/projectmap.md (defaults to mydocs/projectmap.md).

## Mode: standard
