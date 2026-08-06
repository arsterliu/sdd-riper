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
- **Plan Approval**：`APPROVAL_POLICY=agent|human` 只控制 Plan Gate。默认 `agent`；agent 批准必须写 `Plan Approved By: agent:<id>`、`Approved At:` 和 `Gate Evidence:`；human 策略必须写 `Plan Approved By: human:<name>`。
- **Independent Review**：Research / Challenge reviewer 必须是可审计身份：`subagent:<id>`、`external-agent:<id>` 或 `human:<name>`；micro Challenge 可用 `inline`。If using a subagent, external-agent, review bot, or any other automated reviewer tool that requires authorization, pause and request explicit user authorization before proceeding; never skip the gate or fabricate reviewer evidence.
- **Autonomous Cruise**：Cruise 默认开启；关闭时写 `CRUISE_ENABLED=false`。使用 `sdd next`、`sdd challenge`、`sdd cruise --driver auto` 进行动态路由、对抗审核和有界修复循环。使用 `--emit-claude-prompt` 获取 Claude Code ultracode/workflow 指引，`--record-run` 记录运行账本。Cruise orchestrator 只负责路由与迭代边界；main agent 重入 `BACKTRACK_TARGET` 并遵守目标阶段门禁和写入边界；Challenge reviewer 始终保持 read-only。
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
- If you use a subagent, external-agent, review bot, or any other automated reviewer tool that requires authorization, pause and request explicit user authorization before proceeding.
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
- `APPROVAL_POLICY=agent|human` controls only the Plan approval gate; `agent` approvals require `Gate Evidence`.
- Cruise is enabled by default; set `CRUISE_ENABLED=false` to turn it off and keep `CRUISE_MAX_ITERATIONS` as the iteration budget.
- Cruise Driver is selected with `sdd cruise --driver <driver>`.
- Cruise orchestrator only routes and bounds iterations; the main agent re-enters `BACKTRACK_TARGET` under that phase's gates and write boundaries; the Challenge reviewer remains read-only.
- Mode: standard

<!-- sdd-riper:end -->
