# Claude 项目指令 - SDD-RIPER

## 记忆

- 开始任何任务前，始终加载最新的活跃 Spec。
- 需要 Design 或执行事实时，遵循 `design-file` 和 `execute-log-file` 引用。
- 显式跟踪 RIPER 阶段转换。

## 行为

- 绝不在没有 Spec 的情况下写代码。
- 创建 Spec 前，必须让用户输入或确认 `version` 与 `task-name`，并询问是否有参考资料 / context；不得静默推导后直接 discover。
- 绝不在没有 Plan approval 和 gate evidence 的情况下进入 Execute。
- `APPROVAL_POLICY=agent` 时，Plan approval 使用 `Plan Approved By: agent:<id>`、`Approved At:` 和 `Gate Evidence:`。
- `APPROVAL_POLICY=human` 时，Plan approval 必须使用 `Plan Approved By: human:<name>`。
- 绝不让 Plan 替代 standard/lite Design。
- standard/lite 模式下，实现者和审核者必须角色分离。Challenge / Research reviewer 使用 `subagent:<id>`、`external-agent:<id>` 或 `human:<name>`；micro Challenge 可使用 `inline`。If using a subagent, external-agent, review bot, or any other automated reviewer tool that requires authorization, pause and request explicit user authorization before proceeding; never skip the gate or fabricate reviewer evidence.
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
