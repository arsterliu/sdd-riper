# SDD-RIPER Agent 指令

所有对话都用中文回复。

## 核心规则（不可违反）

- **无 Spec 不写码**：除非存在当前任务 Spec，否则不写代码。
- **Spec 是控制面**：Spec 拥有任务门禁，并引用 Design / Execute Log / Learning 制品。
- **Design 独立**：standard/lite 模式在 `design-file` 中写技术设计；Plan 不能替代 Design。
- **Execute Log 独立**：在 `execute-log-file` 中记录步骤结果、验证证据和偏差。
- **Learning Check**：当偏差、修复、关注点或重开经验产生可复用规则时，创建 `learning-file`。
- **制品中文内容**：保持制品标题和字段标签为英文；填写分析、决策、计划、证据和学习规则时使用中文。
- **Spec 创建输入人工确认**：创建 Spec 前必须让用户输入或确认 `version` 与 `task-name`，并询问是否有参考资料 / context；不得静默推导后直接 discover。
- **自治模式**：`AUTONOMY_MODE=auto|supervised|human` 只提供新 Spec 默认值；每个 Spec 冻结 effective mode。auto 可凭完整证据由 agent 批准 Plan；supervised/human 必须写 `Plan Approved By: human:<name>`。Plan Approval 不等于后续自动推进授权。
- **Independent Review**：Research / Challenge reviewer 必须是可审计身份：`subagent:<id>`、`external-agent:<id>` 或 `human:<name>`；micro Challenge 可用 `inline`。只有当前 Spec 存在新鲜且包含 reviewer actor 的任务/Plan 授权时，才可自动启动 reviewer；否则暂停并请求当前用户明确授权。不得跳过门禁或伪造证据。
- **有界推进**：auto 与已获后续授权的 supervised 可使用 `sdd next`、`sdd challenge`、`sdd cruise --driver auto` 连续推进；human 在治理节点暂停。`CRUISE_MAX_ITERATIONS` 始终限制修复循环。归档、Profile exact digest、E2E SKIPPED、不可逆动作、范围扩大、新风险和平台权限始终单独停机。
- **先 Debug 再重试**：步骤失败时，先运行 debug 找根因再重试。

## RIPER 工作流

Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> (Cruise) -> Learning Check -> Archive

## 上下文层

- **Spec**：当前任务控制面（`<docs-root>/specs/`，默认 `mydocs/specs/`）。
- **Context**：由 Spec `context-source` 引用的原始材料（`<docs-root>/context/<task-name>/`，默认 `mydocs/context/<task-name>/`）。
- **Design**：由 Spec `design-file` 引用的技术设计 / Design Note。
- **Execute Log**：由 Spec `execute-log-file` 引用的步骤审计轨迹。
- **Learning**：由 Spec `learning-file` 引用的可复用决策规则。
- **Cruise Runs**：可观测的 cruise 迭代账本（`<docs-root>/runs/`，默认 `mydocs/runs/`）。
- **CodeMap**（按需）：运行 `sdd codemap <dir>` 获取计算架构视图；不持久化，始终最新。

## Docs Root 配置

docs root 目录默认为 `mydocs/`，可通过 `.sdd-config` 的 `DOCS_DIR=...` 覆盖。

## Mode

新任务未显式传入 `discover --mode` 时默认 `micro`；需要 standard/lite 时必须由任务风险明确触发。

<!-- sdd-riper:start -->
## SDD-RIPER Agent Instructions

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

<!-- sdd-riper:end -->
