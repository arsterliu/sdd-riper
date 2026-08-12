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


Claude-specific reminder:
- Explicitly track RIPER phase transitions.
- Standard/lite Challenge execution must use auditable independent reviewer evidence (`subagent:<id>`, `external-agent:<id>`, or `human:<name>`); micro may use inline only when roles remain separated.
<!-- sdd-riper:end -->
