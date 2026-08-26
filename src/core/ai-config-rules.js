var reviewerGuidance = require('./reviewer-guidance');

var LIFECYCLE = 'Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> (Cruise) -> Learning Check -> Archive';

var INTRO_LINE = 'This project uses SDD-RIPER. Do not reconstruct the workflow manually; use the `sdd-riper` skill when available, or the `sdd` CLI as the procedural source of truth.';

var CORE_RULES = [
  '- Load the latest active Spec before implementation; never write code without an active Spec.',
  '- Follow the lifecycle: ' + LIFECYCLE + '.',
  '- Before creating a Spec, ask the user to provide or confirm `version` and `task-name`; ask whether reference materials / context exist and bind them via `context-source`. Before creating a Spec, if the user has not explicitly selected an autonomy mode, ask them to choose `auto`, `supervised`, or `human`, explain the trade-offs, and recommend `supervised`; the project default is a recommendation and must not be silently chosen for the user. If the user has already explicitly selected a mode, restate it and ask for confirmation without presenting the choice again.',
  '- Spec is the control plane: it owns goal, Research, Innovate, Acceptance Criteria, Plan, approvals, and references to `design-file`, `execute-log-file`, and `learning-file`. Do not recreate embedded Design / Execute Log / Learning sections inside Spec.',
  '- When an AC declares `Verification: e2e`, it must also declare `Provider: <provider-id>`.',
  '- Do not move past Plan without approval and gate evidence. `auto` may use `Plan Approved By: agent:<id>` with `Approved At:` and `Gate Evidence:`; `supervised` and `human` require `Plan Approved By: human:<name>`. Plan Approval never implies continuous automation authorization.',
  '- In auto mode, after the current user confirms the current scope and risk, automatically record task authorization for main, worker, research-reviewer, and challenge-reviewer. When a fresh authorization covers the current scope/risk and an agent-approved Plan has no activation, automatically record a `plan_activation` event with `sdd autonomy activate-plan`, the current scope, risk, and Plan digests, and `agent:<id>` evidence; do not request a human to approve the Plan again or re-authorize those reviewers. This does not bypass any dedicated human stop.',
  '- When a Spec declares `project-profile-revision`, read that exact revision; never substitute `profiles/current.json`. Before running `sdd profile confirm`, stop and obtain explicit current user authorization for the exact reviewed digest.',
  '- Independent Review is separate from approval. ' + reviewerGuidance.reviewerTypeLine(),
  '- ' + reviewerGuidance.authorizationLine() + ' ' + reviewerGuidance.integrityLine(),
  '- Do not manually fill Challenge Evidence fields; use `sdd challenge --record-result "VERDICT" --summary "..." --executed-by "subagent:<id>|external-agent:<id>|human:<name>|inline"`.',
  '- Challenge `FAIL_*` verdicts block archive and route work back to the mapped phase.',
  '- When `NEXT_ACTION: request_archive_authorization` appears, stop and request explicit archive authorization from the current user. Agents must not construct archive authorization parameters or infer permission from Ready, PASS, Plan Approval, Challenge, or prior authorization. A `human:<name>` record is an audit declaration, not identity authentication.',
  '- In every autonomy mode, irreversible actions, scope expansion, new risks, and platform permissions must each stop separately for explicit human authorization.',
  '- E2E `SKIPPED` requires `Reason`, `Approved By: human:<name>`, and `Approved At`; debug the environment first and record `BLOCKED` when it cannot be repaired. Never auto-install dependencies or browsers and never approve the skip yourself.',
  '- Record execution deviations and facts in the referenced Execute Log; debug before retrying failed steps.',
  '- The main agent owns final requirements, selected option, Plan gate, Challenge verdict, Learning decision, and Archive consistency; subagents collect evidence or perform bounded work.',
  '- Keep artifact headings and field labels in English; write artifact content in Chinese.',
  '- No Claim Without Verification: freshly run the relevant tests / lint / build before claiming completion.',
  '- Archived and legacy artifacts remain readable without migration; do not silently rewrite historical records.'
];

var CAPABILITY_ROUTING = [
  '- Establish `ui-impact` for each new Spec; for frontend or mixed tasks record `visual-context-intent` once (`not-required|direction|fidelity`). A baseline is the human-approved target UI PNG frozen by the current Spec, not a cross-Spec historical baseline library: a new Spec may directly use the latest UI PNG, while an old-page screenshot is optional Context. Candidate images and default images do not constitute human approval.',
  '- Recommend `fidelity` only when the target is a decodable PNG; scenario, route, state, and viewport are explicit; target and post-development current screenshot dimensions are comparable, with pixel width and height respectively matching exactly; and test data, fonts, and assets are stable. Otherwise recommend `direction`, and the Agent must explain why it recommends `direction` or `fidelity`. Run `sdd visual discover` only to scan local context; a Figma URL is recorded like any other URL and does not access the network. Strict visual evidence activates only when the current user explicitly runs `sdd visual init`; Agents must never create, generate, approve, replace, version, or manage a baseline, must not automatically start a browser or execute a screenshot diff, and must never fabricate a visual baseline, approval, browser result, or screenshot diff.',
  '- Visual routing must not implicitly initialize or approve its Provider.',
  '- Only an approved `fidelity` contract permits configuration of the separate `playwright-visual` Provider; configuration remains a project or Provider-maintainer responsibility, not Agent authority.',
  '- Each `scenario.baseline.path` must point into the current Spec Context and pass lexical and realpath project-local containment. The Provider scenario mapping must be static and project-local. Any Provider, config, contract, baseline, or code-state change makes the Visual Run stale. The visual contract does not create an Archive Gate.',
  '- When engineering facts are insufficient, run read-only `sdd profile detect`; during Design / Acceptance / Plan, map AC `Verification:` values with read-only `sdd quality plan`. These projections must not install dependencies or browsers, initialize or approve a Provider, or execute verification. Profile `commandRefs` are facts and must not be executed automatically.'
];

var ENTRY_POINTS = [
  '- `sdd resume <dir>` reloads active task context.',
  '- `sdd next <dir>` inspects current state and next action.',
  '- `sdd validate <dir> --archive-ready` checks archive readiness.',
  '- `sdd challenge <dir>` generates or records adversarial challenge.',
  '- `sdd cruise <dir>` produces bounded repair-loop guidance and run ledger entries.'
];

var PROJECT_CONFIG = [
  '- Docs root defaults to `mydocs/`, override via `.sdd-config` (`DOCS_DIR=...`).',
  '- `AUTONOMY_MODE=auto|supervised|human` sets the project default; each active Spec freezes its effective mode and authorization evidence.',
  '- Keep `CRUISE_MAX_ITERATIONS` as the bounded repair budget. Auto and supervised may continue only within fresh authorized scope; human pauses at governance gates.',
  '- Autonomy writes target only the current active Spec and recheck expected digests under `.sdd-autonomy.lock`. Supervised binds the exact Plan digest; auto automatically records `plan_activation` after Agent Plan approval, but only when the current scope, risk, and Plan digests still match.',
  '- Never reuse a native loop while `STOP_REASON` is non-empty. Scope, risk, or Plan changes invalidate the matching authorization or activation.',
  '- Cruise Driver is selected with `sdd cruise --driver <driver>`.',
  '- Cruise orchestrator only routes and bounds iterations; the main agent re-enters `BACKTRACK_TARGET` under that phase\'s gates and write boundaries; the Challenge reviewer remains read-only.'
];

var SUFFIXES = {
  agents: [],
  claude: [
    '',
    'Claude-specific reminder:',
    '- Explicitly track RIPER phase transitions.',
    '- Standard/lite Challenge execution must use auditable independent reviewer evidence (`subagent:<id>`, `external-agent:<id>`, or `human:<name>`); micro may use inline only when roles remain separated.'
  ],
  cursor: [
    '',
    'Cursor-specific reminder:',
    '- Treat generated suggestions as invalid unless they fit the active Spec, Design, Plan, and referenced artifacts.'
  ],
  copilot: [
    '',
    'Copilot-specific reminder:',
    '- Prefer suggestions that preserve SDD-RIPER gates and do not invent implementation work outside the active Spec.'
  ]
};

module.exports = {
  LIFECYCLE: LIFECYCLE,
  INTRO_LINE: INTRO_LINE,
  CORE_RULES: CORE_RULES,
  CAPABILITY_ROUTING: CAPABILITY_ROUTING,
  ENTRY_POINTS: ENTRY_POINTS,
  PROJECT_CONFIG: PROJECT_CONFIG,
  SUFFIXES: SUFFIXES
};
