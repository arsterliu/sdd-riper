# Claude 项目指令 - SDD-RIPER

## 记忆
- 开始任何任务前，始终加载最新的 Spec。
- 需要 Design 或执行事实时，遵循 design-file 和 execute-log-file 引用。
- 显式跟踪 RIPER 阶段转换。

## 行为
- 绝不在没有 Spec 的情况下写代码。
- 绝不在没有 gate evidence 的情况下越过 Plan：人工审批，或 auto policy 下的 `Plan Approved By: auto-gate` 加 `Gate Evidence:`。
- 绝不用 Plan 替代 standard/lite Design。
- 绝不手动填写 Challenge Evidence 字段。始终使用 `sdd challenge --record-result "VERDICT" --summary "..." --executed-by "subagent"` 记录 challenge 结果。
- 始终在 execute-log-file 引用的 Execute Log 中记录 Plan 偏差。
- 当偏差、修复、关注点或重开经验产生可复用规则时，始终创建 Learning Record。
- 始终保持制品标题和字段标签为英文，填写制品内容时使用中文。
- 步骤失败时，始终先运行 debug 再重试。

## RIPER 阶段门禁
当前阶段必须显式。禁止：静默跳过阶段。

## 入口命令
- sdd discover <dir> --task-name <name> --version v1.0 ... = 启动新任务 / Research 阶段。
- sdd validate <dir> --archive-ready = 归档前检查 Spec、Design、Execute Log、Learning、审批和 challenge 门禁。
- sdd next <dir> = 检查动态工作流状态和下一步动作。
- sdd challenge <dir> = 生成独立对抗审核提示。
- sdd cruise <dir> [--engine auto|prompt|local-loop|claude-code|codex|opencode] [--emit-claude-prompt] [--record-run] [--iteration N] = 生成 cruise 提示，可选 Claude ultracode/workflow 提示和运行账本条目；local-loop 是 prompt-loop 补偿，不是 SDD 模型执行器。
- sdd new-learning <dir> [spec-name] = 创建并绑定 Learning Record。
- sdd codemap <dir> = 输出计算架构视图（按需，不持久化）。
- sdd resume <dir> = 恢复已有任务 / 重载上下文。

## Docs Root 配置
docs root 目录默认为 mydocs/，可通过 .sdd-config（DOCS_DIR=...）覆盖。

## Mode: standard