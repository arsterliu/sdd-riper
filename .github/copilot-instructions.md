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
- Load the latest active Spec before implementation.
- Do not write code without an active Spec.
- Follow the lifecycle: Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> (Cruise) -> Learning Check -> Archive.
- When an AC declares `Verification: e2e`, it must also declare `Provider: <provider-id>`.
- Archived and legacy artifacts remain readable without migration; do not silently rewrite historical records.
- Before creating a Spec, ask the user to provide or confirm `version` and `task-name`; do not infer them silently.
- Before creating a Spec, ask whether reference materials / context exist, and bind them with `context-source` when provided.
- Before creating a Spec, if the user has not explicitly selected an autonomy mode, ask them to choose `auto`, `supervised`, or `human`, explain the trade-offs, and recommend `supervised`. The project default is a recommendation and must not be silently chosen for the user. If the user has already explicitly selected a mode, restate it and ask for confirmation without presenting the choice again.
- Do not move past Plan without approval and gate evidence.
- Follow `design-file`, `execute-log-file`, and `learning-file` references from the Spec.
- Follow `context-source` to find raw materials (PRD, UI mockups, prototypes) in `mydocs/context/<task-name>/`.
- For each new Spec, establish `ui-impact` from its exact Profile / `affected-units`, or ask once whether it affects a user interface when unknown. Backend-only Specs select `ui-impact: no` and skip visual guidance; frontend or mixed Specs select `ui-impact: yes` once with `sdd visual select ... --intent not-required|direction|fidelity`.
- Users may put local images, documents, notes, and URL references together in `context-source`; run `sdd visual discover` to report inferred candidates, gaps, and only unresolved questions. A Figma URL is handled like any other URL: discovery records it but does not access the network to read its content. Figma MCP import is a separate future Spec.
- Do not enable strict visual evidence until the user explicitly runs `sdd visual init ... --mode fidelity|direction`. For an approved fidelity contract only, configure the separate `playwright-visual` Provider plus exact project-local `sdd.visual.config.json` bindings, then run `sdd verify visual --spec <spec>`; it accepts no URL, command, selector, threshold, mask, or environment pass-through and never creates, approves, or replaces a baseline. Do not fabricate a visual baseline, approval, browser result, or screenshot diff PASS. Empty Context never blocks `not-required`.
- When a Spec declares `project-profile-revision`, Research must read that exact revision; never substitute `profiles/current.json`.
- Before running `sdd profile confirm`, stop and obtain explicit current user authorization for the exact reviewed digest.
- Profile `commandRefs` are facts and must not be executed automatically.
- Profile detection and inheritance must not install dependencies or initialize a Verification Provider.
- Record execution deviations in the referenced Execute Log.
- Do not manually fill Challenge Evidence fields; use `sdd challenge --record-result "VERDICT" --summary "..." --executed-by "subagent:<id>|external-agent:<id>|human:<name>|inline"`.
- Independent Review is separate from approval: Research/Challenge reviewers must be auditable (`subagent:<id>`, `external-agent:<id>`, or `human:<name>`; micro Challenge may use `inline`).
- An automated reviewer may start without another prompt only when the active Spec has a fresh task/plan authorization that explicitly includes the reviewer actor; project configuration or Plan Approval alone is insufficient. Otherwise pause and request explicit current-user authorization.
- When `NEXT_ACTION: request_archive_authorization` appears, stop and request explicit archive authorization from the current user.
- Agents must not construct archive authorization parameters or infer permission from Ready, PASS, Plan Approval, Challenge, or prior authorization.
- A `human:<name>` archive record is an audit declaration, not identity authentication.
- Do not skip the gate or fabricate reviewer evidence.
- Keep artifact headings and field labels in English; write artifact content in Chinese.
- Debug before retrying failed steps.

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
