# GitHub Copilot 指令 - SDD-RIPER

## 工作流
生成代码建议时，始终遵循 SDD-RIPER 方法论。

## 关键规则
- 无 Spec 不写码：建议代码前检查 <docs-root>/specs/（默认 mydocs/specs/）。
- SDD-RIPER 阶段：Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> Learning Check。
- Design、Execute Log 和 Learning 是独立制品，分别由 design-file、execute-log-file 和 learning-file 引用。
- 原始材料（PRD、UI稿、原型等）放入 mydocs/context/<task-name>/；`sdd discover` 自动绑定 `context-source`。
- 制品标题和字段标签保持英文；填写的制品内容默认使用中文。
- Plan Approved 门禁：`Plan Approved By:` 和 `Approved At:` 填写前不建议实现代码；auto-gate 还需要 `Gate Evidence:`。
- 自主工作流：使用 `sdd next`、`sdd challenge`、`sdd cruise --engine auto` 进行路由、对抗审核和有界修复；使用 `--emit-claude-prompt` 获取 Claude Code ultracode 指引和 `--record-run` 记录运行账本。
- 归档门禁：归档前运行 sdd validate <dir> --archive-ready。
- 先 Debug 再重试：代码失败时，先运行 debug 找根因再重试。
- CodeMap（按需）：运行 `sdd codemap <dir>` 获取实时架构视图——不持久化，始终最新。

## Docs Root 配置
docs root 目录默认为 mydocs/，可通过 .sdd-config（DOCS_DIR=...）覆盖。

## Mode: standard