# Claude Project Instructions - SDD-RIPER

## Memory
- Always load the latest Spec before starting any task.
- Follow design-file and execute-log-file references when Design or execution facts are needed.
- Track RIPER phase transitions explicitly.

## Behavior
- NEVER write code without a Spec.
- NEVER proceed past Plan without "Plan Approved By" being filled.
- NEVER use Plan as a substitute for standard/lite Design.
- ALWAYS record deviations from Plan in the Execute Log file referenced by execute-log-file.
- ALWAYS keep artifact headings and field labels in English, and write filled artifact content in Chinese.
- ALWAYS run debug before retrying a failed step.

## RIPER Phase Gate
Current phase must be explicit. Prohibited: jumping phases silently.

## Entry Commands
- sdd discover <dir> --task-name <name> --version v1.0 ... = start a new task / Research phase.
- sdd validate <dir> --archive-ready = check Spec, Design, Execute Log, approval, and review gates before archive.
- sdd resume <dir> = resume an existing task / reload context.

## Mode: standard
