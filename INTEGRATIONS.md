# SDD-RIPER ↔ Superpowers Integration Map

SDD-RIPER provides the **workflow contract** (phases, gates, audit trail, file-system
state). The [obra/superpowers](https://github.com/obra/superpowers) project provides
the **execution-quality methodology** (how to actually do TDD well, debug
systematically, verify before claiming completion, etc.) plus the up-front
**design-clarification method** (`brainstorming`) used in the Innovate phase.

This file is the bridge: it lists every SDD-RIPER touchpoint that calls into
superpowers, what skill is invoked, where to find the vendored fallback, and the
preferred resolution order at runtime.

## Touchpoint Index

| SDD touchpoint | SKILL.md section | superpowers skill | vendored path | Fallback order |
|:---|:---|:---|:---|:---|
| Design clarification | Innovate Phase | `brainstorming` | `vendored/superpowers/brainstorming/` | global → vendored → inlined (artifacts land in SDD's Spec/`design-file`, not `brainstorming`'s default path; visual companion needs the global skill — its `scripts/` are not vendored) |
| Plan step granularity | Plan Phase | `writing-plans` | `vendored/superpowers/writing-plans/` | global → vendored → inlined |
| Subagent routing | Subagent Policy | `subagent-driven-development` | `vendored/superpowers/subagent-driven-development/` | global → vendored → inlined (also see `protocols/subagent-dispatch.md` for SDD-RIPER's own dispatch contract) |
| TDD enforcement | Execute Phase (TDD) | `test-driven-development` | `vendored/superpowers/test-driven-development/` | global → vendored → inlined |
| Debug investigation | Execute Phase (debug) | `systematic-debugging` | `vendored/superpowers/systematic-debugging/` | global → vendored → inlined |
| Completion verification | Execute Phase (Completion Verification Gate) | `verification-before-completion` | `vendored/superpowers/verification-before-completion/` | global → vendored → inlined |
| Pre-archive git gate | Archive Phase | `finishing-a-development-branch` | `vendored/superpowers/finishing-a-development-branch/` | global → vendored → inlined |

## Resolution Semantics

For each touchpoint, the SKILL.md instruction tells the AI orchestrator to
**load the methodology** before executing the gate. Resolution proceeds in
this order:

1. **Global superpowers skill** — if the editor (Claude Code / OpenCode / Cursor
   with skill support) reports the matching skill is loaded, the orchestrator
   should invoke it via the editor's skill mechanism. This gives users the
   latest upstream version plus any local customizations.

2. **Vendored copy** — if no global skill is available, the orchestrator should
   `Read` the file at `vendored/superpowers/<skill>/SKILL.md` (using SKILL.md's
   `SDD_ROOT` variable from the preamble for the absolute path). The vendored
   copy is pinned to a specific upstream commit; see
   `vendored/superpowers/.upstream-commit` for the exact hash.

3. **Inlined summary** — the SDD-RIPER `SKILL.md` keeps a short summary of each
   rule (e.g. "RED → GREEN → REFACTOR; no failing test, no production code")
   inline as a final fallback when neither global nor vendored is reachable.
   This is degraded fidelity but ensures the workflow never fully breaks.

The AI does not need any special protocol to switch between these — it picks
the highest-priority option available in its current environment.

## Subagent Dispatch Contract Boundary

The Subagent routing touchpoint above resolves to `subagent-driven-development` from
superpowers, but **the authoritative dispatch contract for SDD-RIPER is
`protocols/subagent-dispatch.md`**, not the vendored skill. The boundary is:

- `vendored/superpowers/subagent-driven-development/SKILL.md` — high-level
  methodology (when to dispatch, subagent lifecycle, review steps). Load for
  conceptual grounding.
- `protocols/subagent-dispatch.md` — SDD-RIPER-specific contract. Defines the
  **brief schema** (task / spec_excerpts / files_to_read / return_schema /
  constraints), the **return schema** (verdict / summary ≤200 words / evidence
  pointers / recommendations), the **three constraints** (brief is self-sufficient,
  no file writes, compressed return), and the **three Trust But Verify
  exceptions** (Completion Verification Gate / Plan Approval Gate / Final Review
  Verdict — all owned by orchestrator).

If the AI follows the resolution order in the table above and reads only the
vendored skill, it will miss the SDD-RIPER-specific brief fields and may
attempt to read the Spec file itself (violating "brief is self-sufficient") or
write to Spec (violating "no file writes"). Always read
`protocols/subagent-dispatch.md` before dispatching, regardless of which
superpowers layer resolved.

## Coexistence with Global Superpowers

Users who already have `obra/superpowers` installed globally are NOT forced to
use the pinned vendored version. The fallback chain above ensures the user's
own installation takes precedence. This means:

- Power users get the latest upstream + their customizations.
- New users get a guaranteed-working baseline via the vendored copy.
- Both paths share the same SDD-RIPER contracts, so behavior at the contract
  layer is identical.

## License & Attribution

The vendored skills are distributed under the **MIT License**, Copyright © 2025
Jesse Vincent. The license text is preserved verbatim at
`vendored/superpowers/LICENSE`. See `vendored/superpowers/SYNC.md` for the
maintainer-facing operations manual (sync procedure, scope rationale,
license-compliance notes).

SDD-RIPER's own contract layer (workflow phases, gates, file-system layout,
`protocols/`, `templates/`) remains under SDD-RIPER's own license. The two
projects are independent and composable — neither is forked into the other.

## Adding a New Touchpoint

If a future SDD-RIPER phase needs to call into another superpowers skill
(or any other external methodology), update in this order:

1. Add a row to the **Touchpoint Index** table above.
2. If vendoring, add the skill directory under `vendored/superpowers/` and
   update `vendored/superpowers/SYNC.md` Scope section.
3. Update the corresponding `SKILL.md` section to use the
   `(see vendored/superpowers/<X>/SKILL.md — read on demand; prefer global skill if loaded):`
   pattern.
4. Update `README.md` if the new touchpoint changes any user-facing workflow.

Do NOT add a touchpoint without all four steps — a half-wired touchpoint
silently degrades to inlined fallback only, defeating the purpose of vendoring.
