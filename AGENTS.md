# SDD-RIPER Agent 指令

## 核心规则（不可违反）
- **无 Spec 不写码** — 除非存在任务 Spec，否则不写代码。
- **Spec 是控制面** — Spec 拥有任务门禁，引用 Design / Execute Log / Learning 制品。
- **Design 独立** — standard/lite 模式在 design-file 中写技术设计；Plan 不能替代。
- **Execute Log 独立** — 在 execute-log-file 中记录步骤结果和偏差。
- **Learning Check** — 当偏差、修复、关注点或重开经验产生可复用规则时，创建 learning-file。
- **制品中文内容** — 保持制品标题和字段标签为英文；填写分析、决策、计划、证据和学习规则时使用中文。
- **Gate Policy** — 默认 gate-policy 为 auto；`auto-gate` 需要填写 `Gate Evidence:`；manual policy 需要人工审批。
- **Autonomous Cruise** — 使用 `sdd next`、`sdd challenge`、`sdd cruise --engine auto` 进行动态路由、对抗审核和有界修复循环。仅在 `CRUISE_POLICY="autonomous"` 时复用宿主原生循环；否则使用 prompt-loop 补偿。使用 `--emit-claude-prompt` 获取 Claude Code ultracode/workflow 指引，`--record-run` 记录运行账本。
- **先 Debug 再重试** — 步骤失败时，先运行 debug 找根因再重试。

## RIPER 工作流
Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> Learning Check

## 上下文层
- **Spec**：当前任务控制面（<docs-root>/specs/，默认 mydocs/specs/）。
- **Design**：由 Spec design-file 引用的技术设计 / Design Note。
- **Execute Log**：由 Spec execute-log-file 引用的步骤审计轨迹。
- **Learning**：由 Spec learning-file 引用的可复用决策规则。
- **Cruise Runs**：可观测的 cruise 迭代账本（<docs-root>/runs/，默认 mydocs/runs/）。
- **CodeMap**（按需）：运行 `sdd codemap <dir>` 获取计算架构视图——不持久化，始终最新。

## Docs Root 配置
docs root 目录默认为 mydocs/，可通过 .sdd-config（DOCS_DIR=...）覆盖。

## Mode: standard