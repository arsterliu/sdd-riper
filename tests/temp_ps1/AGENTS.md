# SDD-RIPER Agent Instructions

## Core Rules (No Exceptions)
- **No Spec, No Code** - Do not write code unless a task Spec exists.
- **Spec is Control Plane** - Spec owns task gates and references Design / Execute Log artifacts.
- **Design is Separate** - standard/lite write technical design in design-file; Plan cannot replace it.
- **Execute Log is Separate** - record step results and deviations in execute-log-file.
- **Reverse Sync** - sync descriptive facts only; normative requirement/design/plan changes require a human gate.
- **Plan Approved** gate - do not execute until Plan is explicitly approved by a human.
- **Debug Before Retry** - when a step fails, run debug to find root cause before retrying.

## RIPER Workflow
Follow the SDD-RIPER phases: Research -> Innovate -> Design/Acceptance -> Plan -> Execute -> Review.

## Context Layers
- **Spec**: Current task control plane (<docs-root>/specs/, defaults to mydocs/specs/).
- **Design**: Technical Design / Design Note referenced by Spec design-file.
- **Execute Log**: Step audit trail referenced by Spec execute-log-file.
- **CodeMap**: Module structure and call chains (<docs-root>/codemap/, defaults to mydocs/codemap/).
- **ProjectMap**: Cross-repo contracts and ownership (<docs-root>/projectmap.md, defaults to mydocs/projectmap.md).

## Mode: standard
