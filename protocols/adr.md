# ADR — Architecture Decision Record (SDD-RIPER method)

A lightweight record of *why* a design decision was made, using Michael Nygard's
format. In SDD-RIPER an ADR is how the `Selected Option / ADR` field gets filled
— it is not a separate ceremony or a separate file.

## When to write one

- Every `standard` / `lite` task: record the selected option as an ADR.
- Any significant choice: framework, library, pattern, datastore, API style,
  data model, or a cross-module boundary.
- The method router surfaces this — `sdd next` / `sdd cruise` list it under
  `DESIGN_METHOD`.
- `micro` tasks do not need an ADR; design intent stays inside Plan.

## Format (keep it short)

Keep the field labels in English; write the filled content in Chinese (SDD
language rule).

- **Title / ID**: short decision name, e.g. `ADR-001: 用 Postgres 作为主存储`
- **Status**: proposed | accepted | superseded by ADR-NNN
- **Context**: the problem and the constraints that force a decision
- **Decision**: what was chosen, stated plainly
- **Alternatives**: the other options considered, each with why it was rejected
- **Consequences**: positive, negative, and the risks taken on

## Where it lives

- `standard`: inside the Design `Selected Option / ADR` field of the Technical
  Design artifact.
- `lite`: inside the Design Note's selected-option section.
- Do **not** create a standalone file unless the project already maintains a
  `docs/adr/` log; SDD keeps the decision next to the design artifact it
  justifies.

## Anti-patterns

- A decision with no rejected alternatives is not an ADR — it is an assertion.
- Don't write an essay. A few sentences per field is enough.
- Don't backfill ADRs to rationalize code after the fact; record the decision
  when it is actually made.
