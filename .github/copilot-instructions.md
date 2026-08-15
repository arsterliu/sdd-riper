# GitHub Copilot 指令 - SDD-RIPER

## 工作流

生成代码建议时，始终遵循 SDD-RIPER 方法论。

## 关键规则

- 无 Spec 不写码：建议代码前检查 `<docs-root>/specs/`（默认 `mydocs/specs/`）。
- SDD-RIPER 阶段：Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> (Cruise) -> Learning Check -> Archive。
- Design、Execute Log 和 Learning 是独立制品，分别由 `design-file`、`execute-log-file` 和 `learning-file` 引用。
- 原始材料（PRD、UI 稿、原型等）放入 `mydocs/context/<task-name>/`；`sdd discover` 自动绑定 `context-source`。
- 制品标题和字段标签保持英文；填写的制品内容默认使用中文。
- `AUTONOMY_MODE=auto|supervised|human` 决定 Plan 与后续推进门禁。auto 可使用带 `Approved At:` 和 `Gate Evidence:` 的 agent approval；supervised/human 必须由 human 批准 Plan，且 Plan Approval 不等于后续自动推进授权。
- Research / Challenge reviewer 使用 `subagent:<id>`、`external-agent:<id>` 或 `human:<name>`；micro Challenge 可使用 `inline`。
- 自主工作流：使用 `sdd next`、`sdd challenge`、`sdd cruise --driver auto` 进行路由、对抗审核和有界修复；使用 `--emit-claude-prompt` 获取 Claude Code ultracode 指引，使用 `--record-run` 记录运行账本。
- 归档门禁：归档前运行 `sdd validate <dir> --archive-ready`。
- 先 Debug 再重试：代码失败时，先运行 debug 找根因再重试。
- CodeMap（按需）：运行 `sdd codemap <dir>` 获取实时架构视图；不持久化，始终最新。

## Docs Root 配置

docs root 目录默认为 `mydocs/`，可通过 `.sdd-config` 的 `DOCS_DIR=...` 覆盖。

## Mode

新任务未显式传入 `discover --mode` 时默认 `micro`；需要 standard/lite 时必须由任务风险明确触发。

<!-- sdd-riper:start -->
## GitHub Copilot Instructions - SDD-RIPER

This project uses SDD-RIPER. Do not reconstruct the workflow manually; use the `sdd-riper` skill when available, or the `sdd` CLI as the procedural source of truth.

Hard rules:
- Load the latest active Spec before implementation; never write code without an active Spec.
- Follow the lifecycle: Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> (Cruise) -> Learning Check -> Archive.
- Before creating a Spec, ask the user to provide or confirm `version` and `task-name`; ask whether reference materials / context exist and bind them via `context-source`. Before creating a Spec, if the user has not explicitly selected an autonomy mode, ask them to choose `auto`, `supervised`, or `human`, explain the trade-offs, and recommend `supervised`; the project default is a recommendation and must not be silently chosen for the user. If the user has already explicitly selected a mode, restate it and ask for confirmation without presenting the choice again.
- Spec is the control plane: it owns goal, Research, Innovate, Acceptance Criteria, Plan, approvals, and references to `design-file`, `execute-log-file`, and `learning-file`. Do not recreate embedded Design / Execute Log / Learning sections inside Spec.
- When an AC declares `Verification: e2e`, it must also declare `Provider: <provider-id>`.
- Do not move past Plan without approval and gate evidence. `auto` may use `Plan Approved By: agent:<id>` with `Approved At:` and `Gate Evidence:`; `supervised` and `human` require `Plan Approved By: human:<name>`. Plan Approval never implies continuous automation authorization.
- When a Spec declares `project-profile-revision`, read that exact revision; never substitute `profiles/current.json`. Before running `sdd profile confirm`, stop and obtain explicit current user authorization for the exact reviewed digest.
- Independent Review is separate from approval. Auditable reviewer types: subagent:<id>, external-agent:<id>, human:<name>; micro Challenge may use inline.
- An automated reviewer may start without another prompt only when the active Spec has a fresh task/plan authorization that explicitly includes the reviewer actor; project configuration or Plan Approval alone is insufficient. Otherwise pause and request explicit current-user authorization. Do not skip the gate or fabricate reviewer evidence.
- Do not manually fill Challenge Evidence fields; use `sdd challenge --record-result "VERDICT" --summary "..." --executed-by "subagent:<id>|external-agent:<id>|human:<name>|inline"`.
- Challenge `FAIL_*` verdicts block archive and route work back to the mapped phase.
- When `NEXT_ACTION: request_archive_authorization` appears, stop and request explicit archive authorization from the current user. Agents must not construct archive authorization parameters or infer permission from Ready, PASS, Plan Approval, Challenge, or prior authorization. A `human:<name>` record is an audit declaration, not identity authentication.
- In every autonomy mode, irreversible actions, scope expansion, new risks, and platform permissions must each stop separately for explicit human authorization.
- E2E `SKIPPED` requires `Reason`, `Approved By: human:<name>`, and `Approved At`; debug the environment first and record `BLOCKED` when it cannot be repaired. Never auto-install dependencies or browsers and never approve the skip yourself.
- Record execution deviations and facts in the referenced Execute Log; debug before retrying failed steps.
- The main agent owns final requirements, selected option, Plan gate, Challenge verdict, Learning decision, and Archive consistency; subagents collect evidence or perform bounded work.
- Keep artifact headings and field labels in English; write artifact content in Chinese.
- No Claim Without Verification: freshly run the relevant tests / lint / build before claiming completion.
- Archived and legacy artifacts remain readable without migration; do not silently rewrite historical records.

Capability routing:
- Establish `ui-impact` for each new Spec; for frontend or mixed tasks record `visual-context-intent` once (`not-required|direction|fidelity`). A baseline is the human-approved target UI PNG frozen by the current Spec, not a cross-Spec historical baseline library: a new Spec may directly use the latest UI PNG, while an old-page screenshot is optional Context. Candidate images and default images do not constitute human approval.
- Recommend `fidelity` only when the target is a decodable PNG; scenario, route, state, and viewport are explicit; target and post-development current screenshot dimensions are comparable, with pixel width and height respectively matching exactly; and test data, fonts, and assets are stable. Otherwise recommend `direction`, and the Agent must explain why it recommends `direction` or `fidelity`. Run `sdd visual discover` only to scan local context; a Figma URL is recorded like any other URL and does not access the network. Strict visual evidence activates only when the current user explicitly runs `sdd visual init`; Agents must never create, generate, approve, replace, version, or manage a baseline, must not automatically start a browser or execute a screenshot diff, and must never fabricate a visual baseline, approval, browser result, or screenshot diff.
- Visual routing must not implicitly initialize or approve its Provider.
- Only an approved `fidelity` contract permits configuration of the separate `playwright-visual` Provider; configuration remains a project or Provider-maintainer responsibility, not Agent authority.
- Each `scenario.baseline.path` must point into the current Spec Context and pass lexical and realpath project-local containment. The Provider scenario mapping must be static and project-local. Any Provider, config, contract, baseline, or code-state change makes the Visual Run stale. The visual contract does not create an Archive Gate.
- When engineering facts are insufficient, run read-only `sdd profile detect`; during Design / Acceptance / Plan, map AC `Verification:` values with read-only `sdd quality plan`. These projections must not install dependencies or browsers, initialize or approve a Provider, or execute verification. Profile `commandRefs` are facts and must not be executed automatically.

Entry points:
- `sdd resume <dir>` reloads active task context.
- `sdd next <dir>` inspects current state and next action.
- `sdd validate <dir> --archive-ready` checks archive readiness.
- `sdd challenge <dir>` generates or records adversarial challenge.
- `sdd cruise <dir>` produces bounded repair-loop guidance and run ledger entries.

Project configuration:
- Docs root defaults to `mydocs/`, override via `.sdd-config` (`DOCS_DIR=...`).
- `AUTONOMY_MODE=auto|supervised|human` sets the project default; each active Spec freezes its effective mode and authorization evidence.
- Keep `CRUISE_MAX_ITERATIONS` as the bounded repair budget. Auto and supervised may continue only within fresh authorized scope; human pauses at governance gates.
- Autonomy writes target only the current active Spec and recheck expected digests under `.sdd-autonomy.lock`. Supervised binds the exact Plan digest; auto requires `plan_activation` after Plan approval.
- Never reuse a native loop while `STOP_REASON` is non-empty. Scope, risk, or Plan changes invalidate the matching authorization or activation.
- Cruise Driver is selected with `sdd cruise --driver <driver>`.
- Cruise orchestrator only routes and bounds iterations; the main agent re-enters `BACKTRACK_TARGET` under that phase's gates and write boundaries; the Challenge reviewer remains read-only.
- Mode: standard


Copilot-specific reminder:
- Prefer suggestions that preserve SDD-RIPER gates and do not invent implementation work outside the active Spec.
<!-- sdd-riper:end -->
