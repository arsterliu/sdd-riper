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

<!-- sdd-riper:end -->
