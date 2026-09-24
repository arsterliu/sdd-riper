# Superpowers Vendoring — Sync Manual

This directory contains **vendored copies** of seven skills from the upstream
[obra/superpowers](https://github.com/obra/superpowers) project. SDD-RIPER
provides the workflow contract and native default methods. These copies are
retained references, not a list of mandatory skill invocations. TDD, systematic
debugging, and fresh verification still support the execution-quality rules.

This file is the operations manual for maintainers. The integration-map for
AI consumption is in `INTEGRATIONS.md` at the repo root.

## Source

- **Upstream**: https://github.com/obra/superpowers
- **License**: MIT (Copyright © 2025 Jesse Vincent — see `LICENSE` in this directory)
- **Vendored at commit**: see `.upstream-commit` in this directory
- **Last sync date**: 2026-06-09 (initial six); 2026-06-26 (added `brainstorming`, same pinned commit)

## Scope

Seven skills remain vendored. Loading is conditional on the routing table in
`INTEGRATIONS.md`; presence on disk does not activate a skill:

| Vendored skill | SDD-RIPER touchpoint |
|:---|:---|
| `brainstorming/` | Optional broader exploration; native default: protocols/clarification.md |
| `test-driven-development/` | Execute > TDD Rule |
| `systematic-debugging/` | Execute > BUGFIX loop |
| `verification-before-completion/` | Execute > Completion Verification Gate |
| `subagent-driven-development/` | Optional worker coordination; native default: protocols/subagent-dispatch.md |
| `writing-plans/` | Optional complex dependency/file mapping; native default: SDD Plan rules |
| `finishing-a-development-branch/` | Optional authorized merge/PR/cleanup; no default Archive invocation |

The upstream repo's other skills, plugin metadata (`.claude-plugin/`,
`.opencode/`, `.codex-plugin/`), per-skill executable components (`scripts/`),
and `hooks/` are NOT vendored. SDD-RIPER owns its own packaging, and it does not
ship runnable third-party code inside its own repo.

This is an **intentional capability trade-off, not an oversight**. The rule
matters for exactly one skill: only `brainstorming` ships a `scripts/` component
(its browser-based visual companion), so in vendored-only mode that one
*optional, consent-gated* visualization degrades to text-only — its core flow
(one-question-at-a-time intent, 2-3 options, sectioned design, written spec) does
not depend on the script. Every other vendored skill has no `scripts/` or
`hooks/` upstream, so nothing is dropped. Users who need the visualization run
the global superpowers skill only when requested and allowed by SDD's visual
and browser boundaries (fallback order below).

Skill-internal supporting markdown (reviewer prompts, worked examples such as
`systematic-debugging/test-*.md`, `brainstorming/visual-companion.md`) **is**
kept, because the methodology in `SKILL.md` references it.

## Sync Procedure

Manual sync. Run from the SDD-RIPER repo root:

```bash
TMPDIR=$(mktemp -d /tmp/sdd-vendor-XXXXXX)
git clone --depth 1 --quiet https://github.com/obra/superpowers.git "$TMPDIR"
UPSTREAM_COMMIT=$(git -C "$TMPDIR" rev-parse HEAD)

# Re-vendor each skill (overwrite in place)
for skill in brainstorming test-driven-development systematic-debugging \
             verification-before-completion subagent-driven-development \
             writing-plans finishing-a-development-branch; do
  rm -rf "vendored/superpowers/$skill"
  cp -r "$TMPDIR/skills/$skill" "vendored/superpowers/"
  # Strip runtime components per the scope policy above (keeps support markdown).
  rm -rf "vendored/superpowers/$skill/scripts" "vendored/superpowers/$skill/hooks"
done

# Refresh LICENSE and commit-hash marker
cp "$TMPDIR/LICENSE" vendored/superpowers/LICENSE
echo "$UPSTREAM_COMMIT" > vendored/superpowers/.upstream-commit

rm -rf "$TMPDIR"
```

After running, update **Last sync date** at the top of this file and commit
the changes as a single `vendor(superpowers): sync to <hash>` commit so the
diff history stays readable.

## Coexistence Rule

First check the activation conditions in `INTEGRATIONS.md`. The four optional
references above must not load merely because a phase starts or a global skill
is installed. For a triggered external method, when skills are allowed, prefer:

1. **Global superpowers skill** — if the editor (Claude Code / OpenCode / etc.)
   has the matching skill loaded globally, invoke it directly. This gives the
   user the freshest version and their own customizations.
2. **Vendored copy in this directory** — read the corresponding
   `vendored/superpowers/<skill>/SKILL.md` file as fallback.
3. **Inlined summary in `SKILL.md`** — last-resort fallback if for some reason
   the vendored file is unreachable.

This means users who already have `obra/superpowers` installed globally are NOT
forced to use the pinned vendored version. Native SDD rules and gates remain
available when skills are unavailable or prohibited; do not require installation.

External references cannot add workflow phases, artifacts, approvals, or
authorization, or bypass existing SDD gates. The bounded clarification protocol
borrows interview techniques from grill-me/grilling without adding an external
skill dependency. Keep the seven upstream copies unchanged; edit SDD-owned
routing and protocols instead.

## License Compliance

The MIT license requires:
1. Preserving the copyright notice (Jesse Vincent, 2025) and license text
   when redistributing.
2. No warranty claims.

Both requirements are satisfied by:
- Keeping `vendored/superpowers/LICENSE` verbatim from upstream.
- Citing upstream in this `SYNC.md` and in `INTEGRATIONS.md`.

If you modify any vendored file in place, you break the byte-identity guarantee
that makes future syncs easy and you take on derivative-work responsibilities.
**Do not modify vendored content** — add SDD-RIPER-side adaptations in
`protocols/` or in `SKILL.md` instead.

## Known Upstream-Only References

The byte-identical upstream copies of `writing-plans` and
`subagent-driven-development` refer to `executing-plans` in their Plan header,
execution handoff, or cross-session routing text. SDD-RIPER intentionally does
not use those upstream workflow transitions. Its own `SKILL.md` and
`INTEGRATIONS.md` override them with the SDD Execute Phase,
`protocols/subagent-dispatch.md`, and host-native continuous execution.

**Do not vendor `executing-plans`** merely to satisfy these upstream-only
references, and do not patch the vendored `SKILL.md` files. After every manual
sync, verify that the SDD-owned adaptation remains explicit by running:

```bash
node --test --test-name-pattern "SDD integration overrides upstream executing-plans handoffs" tests/commands.test.js
```

## What NOT to do

- Do not edit files inside `vendored/superpowers/<skill>/` (always re-sync upstream instead).
- Do not bump `.upstream-commit` without actually running the sync procedure above.
- Do not vendor additional upstream skills without first declaring a matching
  SDD-RIPER touchpoint in `SKILL.md` and `INTEGRATIONS.md`.
- Do not delete `LICENSE` or `.upstream-commit` — both are required for license
  compliance and version traceability.
- Do not redirect this vendored layer to a fork or mirror; if upstream becomes
  unmaintained, document the situation in this file and decide explicitly.
