# Claude 项目指令 - SDD-RIPER

## 记忆

- 开始任何任务前，始终加载最新的活跃 Spec。
- 需要 Design 或执行事实时，遵循 `design-file` 和 `execute-log-file` 引用。
- 显式跟踪 RIPER 阶段转换。

## 行为

- 绝不在没有 Spec 的情况下写代码。
- 创建 Spec 前，必须让用户输入或确认 `version` 与 `task-name`，并询问是否有参考资料 / context；不得静默推导后直接 discover。
- 绝不在没有 Plan approval 和 gate evidence 的情况下进入 Execute。
- `auto` 时，Plan approval 可使用 `Plan Approved By: agent:<id>`，但必须同时记录 `Approved At:` 和 `Gate Evidence:`。
- `supervised` 或 `human` 时，Plan approval 必须使用 `Plan Approved By: human:<name>`；Plan Approval 不等于后续自动推进授权。
- 绝不让 Plan 替代 standard/lite Design。
- standard/lite 模式下，实现者和审核者必须角色分离。Challenge / Research reviewer 使用 `subagent:<id>`、`external-agent:<id>` 或 `human:<name>`；micro Challenge 可使用 `inline`。自动 reviewer 仅可在当前 Spec 有新鲜且包含 reviewer actor 的授权时免于再次询问；否则暂停并请求当前用户明确授权。不得跳过门禁或伪造证据。
- 绝不手动填写 Challenge Evidence 字段。始终使用 `sdd challenge --record-result "VERDICT" --summary "..." --executed-by "subagent:<id>|external-agent:<id>|human:<name>|inline"` 记录 challenge 结果。
- 始终在 `execute-log-file` 引用的 Execute Log 中记录 Plan 偏差。
- 当偏差、修复、关注点或重开经验产生可复用规则时，始终创建 Learning Record。
- 始终保持制品标题和字段标签为英文，填写制品内容时使用中文。
- 步骤失败时，始终先运行 debug 再重试。

## RIPER 阶段门禁

当前阶段必须显式。禁止静默跳过阶段。

## 入口命令

- `sdd discover <dir> --task-name <name> --version <vN.M|vN.M.P> ...` = 启动新任务 / Research 阶段；version/task-name/context 必须先由用户输入或确认。
- `sdd validate <dir> --archive-ready` = 归档前检查 Spec、Design、Execute Log、Learning、审批和 challenge 门禁。
- `sdd next <dir>` = 检查动态工作流状态和下一步动作。
- `sdd challenge <dir>` = 生成独立对抗审核提示。
- `sdd cruise <dir> [--driver auto|prompt|local-loop|claude-code|codex|opencode] [--emit-claude-prompt] [--record-run] [--iteration N]` = 生成 cruise 提示，可输出 Claude ultracode/workflow 提示并记录运行账本；local-loop 是 prompt-loop 补偿，不是 SDD 模型执行器。Cruise orchestrator 只负责路由与迭代边界；main agent 重入 `BACKTRACK_TARGET` 并遵守目标阶段门禁和写入边界；Challenge reviewer 始终保持 read-only。
- `sdd new-learning <dir> [spec-name]` = 创建并绑定 Learning Record。
- `sdd codemap <dir>` = 输出计算架构视图（按需，不持久化）。
- `sdd resume <dir>` = 恢复已有任务 / 重载上下文。

## Docs Root 配置

docs root 目录默认为 `mydocs/`，可通过 `.sdd-config` 的 `DOCS_DIR=...` 覆盖。

## Mode

新任务未显式传入 `discover --mode` 时默认 `micro`；需要 standard/lite 时必须由任务风险明确触发。

<!-- sdd-riper:start -->
## Claude Project Instructions - SDD-RIPER

This project uses SDD-RIPER. Do not reconstruct the workflow manually; use the `sdd-riper` skill when available, or the `sdd` CLI as the procedural source of truth.

Hard rules:
- Load the latest active Spec before implementation; never write code without an active Spec.
- Follow the lifecycle: Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> (Cruise) -> Learning Check -> Archive.
- Before creating a Spec, ask the user to provide or confirm `version` and `task-name`; ask whether reference materials / context exist and bind them via `context-source`. Before creating a Spec, if the user has not explicitly selected an autonomy mode, ask them to choose `auto`, `supervised`, or `human`, explain the trade-offs, and recommend `supervised`; the project default is a recommendation and must not be silently chosen for the user. If the user has already explicitly selected a mode, restate it and ask for confirmation without presenting the choice again.
- Spec is the control plane: it owns goal, Research, Innovate, Acceptance Criteria, Plan, approvals, and references to `design-file`, `execute-log-file`, and `learning-file`. Do not recreate embedded Design / Execute Log / Learning sections inside Spec.
- When an AC declares `Verification: e2e`, it must also declare `Provider: <provider-id>`.
- Do not move past Plan without approval and gate evidence. `auto` may use `Plan Approved By: agent:<id>` with `Approved At:` and `Gate Evidence:`; `supervised` and `human` require `Plan Approved By: human:<name>`. Plan Approval never implies continuous automation authorization.
- In auto mode, after the current user confirms the current scope and risk, automatically record task authorization for main, worker, research-reviewer, and challenge-reviewer. When a fresh authorization covers the current scope/risk and an agent-approved Plan has no activation, automatically record a `plan_activation` event with `sdd autonomy activate-plan`, the current scope, risk, and Plan digests, and `agent:<id>` evidence; do not request a human to approve the Plan again or re-authorize those reviewers. This does not bypass any dedicated human stop.
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
- Autonomy writes target only the current active Spec and recheck expected digests under `.sdd-autonomy.lock`. Supervised binds the exact Plan digest; auto automatically records `plan_activation` after Agent Plan approval, but only when the current scope, risk, and Plan digests still match.
- Never reuse a native loop while `STOP_REASON` is non-empty. Scope, risk, or Plan changes invalidate the matching authorization or activation.
- Cruise Driver is selected with `sdd cruise --driver <driver>`.
- Cruise orchestrator only routes and bounds iterations; the main agent re-enters `BACKTRACK_TARGET` under that phase's gates and write boundaries; the Challenge reviewer remains read-only.
- Mode: standard


Claude-specific reminder:
- Explicitly track RIPER phase transitions.
- Standard/lite Challenge execution must use auditable independent reviewer evidence (`subagent:<id>`, `external-agent:<id>`, or `human:<name>`); micro may use inline only when roles remain separated.
<!-- sdd-riper:end -->
