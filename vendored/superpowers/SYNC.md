# Superpowers Vendoring — Sync Manual

This directory contains **vendored copies** of seven skills from the upstream
[obra/superpowers](https://github.com/obra/superpowers) project. SDD-RIPER
provides the workflow contract layer; these vendored skills provide the
execution-quality layer (TDD, systematic debugging, verification, etc.) plus the
up-front design-clarification method (`brainstorming`).

This file is the operations manual for maintainers. The integration-map for
AI consumption is in `INTEGRATIONS.md` at the repo root.

## Source

- **Upstream**: https://github.com/obra/superpowers
- **License**: MIT (Copyright © 2025 Jesse Vincent — see `LICENSE` in this directory)
- **Vendored at commit**: see `.upstream-commit` in this directory
- **Last sync date**: 2026-06-09 (initial six); 2026-06-26 (added `brainstorming`, same pinned commit)

## Scope

Only seven skills are vendored, matching the integration touchpoints SDD-RIPER
declares in `SKILL.md`:

| Vendored skill | SDD-RIPER touchpoint |
|:---|:---|
| `brainstorming/` | Innovate > Design clarification |
| `test-driven-development/` | Execute > TDD Rule |
| `systematic-debugging/` | Execute > BUGFIX loop |
| `verification-before-completion/` | Execute > Completion Verification Gate |
| `subagent-driven-development/` | Execute > Subagent Routing |
| `writing-plans/` | Plan > Step Granularity Rule |
| `finishing-a-development-branch/` | Archive > Pre-Archive Git Gate |

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
the global superpowers skill (fallback order below).

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

When SDD-RIPER's `SKILL.md` references a superpowers skill, the AI orchestrator
should prefer in this order:

1. **Global superpowers skill** — if the editor (Claude Code / OpenCode / etc.)
   has the matching skill loaded globally, invoke it directly. This gives the
   user the freshest version and their own customizations.
2. **Vendored copy in this directory** — read the corresponding
   `vendored/superpowers/<skill>/SKILL.md` file as fallback.
3. **Inlined summary in `SKILL.md`** — last-resort fallback if for some reason
   the vendored file is unreachable.

This means users who already have `obra/superpowers` installed globally are NOT
forced to use the pinned vendored version; users without it still get the
methodology via the vendored copy.

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

## What NOT to do

- Do not edit files inside `vendored/superpowers/<skill>/` (always re-sync upstream instead).
- Do not bump `.upstream-commit` without actually running the sync procedure above.
- Do not vendor additional upstream skills without first declaring a matching
  SDD-RIPER touchpoint in `SKILL.md` and `INTEGRATIONS.md`.
- Do not delete `LICENSE` or `.upstream-commit` — both are required for license
  compliance and version traceability.
- Do not redirect this vendored layer to a fork or mirror; if upstream becomes
  unmaintained, document the situation in this file and decide explicitly.
