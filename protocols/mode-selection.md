# Mode Selection Rubric

SDD has three modes — `micro`, `lite`, `standard` — with escalating gate and
artifact requirements. This rubric exists to keep the bar honest: **default to
`micro`, and only escalate when concrete signals justify the extra ceremony.**
Picking `standard` "to be safe" dilutes it into a meaningless default. The
rubric is **advisory** — it does not change how `--mode` behaves; it guides the
human or agent who chooses the mode at `init` / `discover` time.

## The default is micro

Start every task at `micro` unless a signal below pushes it up. Micro keeps the
plan, acceptance, and verification embedded in one spec and skips the external
Technical Design / Design Note — appropriate for localized, reversible, single
-concern changes.

## Escalation signals

Count the signals that genuinely apply to the task in front of you:

| Signal | Meaning |
|---|---|
| **Blast radius** | Touches more than one module / package boundary. |
| **Reversibility** | Hard to roll back (data migration, irreversible side effect). |
| **Interface contract** | Changes a public API, CLI surface, schema, or wire format others depend on. |
| **Design latitude** | More than one reasonable approach; the choice needs to be recorded and defended. |
| **Risk class** | Security, billing, auth, privacy, or compliance is in scope. |
| **Verification depth** | Needs end-to-end or multi-scenario acceptance, not a single unit check. |

## Choosing the mode

- **micro** — zero or essentially one weak signal. Localized, reversible,
  obvious approach. (e.g. fix a guard, adjust a message, delete dead code.)
- **lite** — one or two signals, especially *blast radius* or *design latitude*,
  but the design fits in a short Design Note. (e.g. refactor one command's
  behavior with a recorded approach + acceptance criteria.)
- **standard** — escalate **only when it is genuinely earned**: an interface
  contract or reversibility/risk signal is present, *or* three or more signals
  stack up so an external Technical Design (architecture view, data model,
  rollback plan) actually adds value. If you cannot name *which* signal earns
  `standard`, it is not a `standard` task.

## Anti-patterns

- Choosing `standard` because the task "feels important" without a contract,
  irreversibility, risk, or stacked signals.
- Choosing `micro` for a public-API or migration change to avoid the design work.
- Treating the mode as fixed: if the work reveals a stronger signal mid-flight,
  reopen at a higher mode rather than stretching a thin spec.

Passing a mode's gates proves the *artifacts are present*, not that the work is
rigorous. Match the mode to the risk, not the other way around.
