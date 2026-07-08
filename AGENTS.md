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
- **Independent Review**：Research / Challenge reviewer 必须是可审计身份：`subagent:<id>`、`external-agent:<id>` 或 `human:<name>`；micro Challenge 可用 `inline`。
- **Autonomous Cruise**：Cruise 默认开启；关闭时写 `CRUISE_ENABLED=false`。使用 `sdd next`、`sdd challenge`、`sdd cruise --driver auto` 进行动态路由、对抗审核和有界修复循环。使用 `--emit-claude-prompt` 获取 Claude Code ultracode/workflow 指引，`--record-run` 记录运行账本。
- **先 Debug 再重试**：步骤失败时，先运行 debug 找根因再重试。

## RIPER 工作流

Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> Learning Check

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
