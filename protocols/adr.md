# ADR — Architecture Decision Record (SDD-RIPER method)

A lightweight record of *why* a design decision was made, using Michael Nygard's
format. In SDD-RIPER an optional ADR explains the chosen `Approach`
— it is not a separate ceremony or a separate file.

## When to write one

- When a substantive technical choice benefits from explicit alternatives and consequences.
- Any significant choice: framework, library, pattern, datastore, API style,
  data model, or a cross-module boundary.
- The method router surfaces this — `sdd next` / `sdd cruise` list it under
  `DESIGN_METHOD`.
- Artifact requirements follow risk signals and the mode floor; this advisory method adds no gate.

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

- Inside the referenced Design artifact's `Approach` field or a short subsection.
- Do **not** create a standalone file unless the project already maintains a
  `docs/adr/` log; SDD keeps the decision next to the design artifact it
  justifies.

## Anti-patterns

- A decision with no rejected alternatives is not an ADR — it is an assertion.
- Don't write an essay. A few sentences per field is enough.
- Don't backfill ADRs to rationalize code after the fact; record the decision
  when it is actually made.
