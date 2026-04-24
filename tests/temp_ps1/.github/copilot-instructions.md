# GitHub Copilot Instructions — SDD-RIPER

## Workflow
Always follow the SDD-RIPER methodology when generating code suggestions.

## Key Rules
- No Spec, No Code: Check mydocs/specs/ before suggesting code
- RIPER phases: Pre-Research → Research → Innovate → Plan → Execute → Review
- Plan Approved gate: Do not suggest implementation code until Plan is approved
- ProjectMap: Cross-repo interfaces are documented in mydocs/projectmap.md

## Mode: standard

## Protocol Reference
# SDD-RIPER Protocol (Standard)

## 三铁律
- **铁律一：No Spec, No Code** — 没有 Spec 就不写代码
- **铁律二：Spec is Truth** — Spec 是代码的唯一真相源
- **铁律三：Reverse Sync** — 发现代码与 Spec 不一致，回写 Spec

## Pre-Research 阶段与上下文层级
执行任务前，AI与开发者必须对齐以下输入语义及上下文层级。

### 核心输入语义
- **requirement** = 当前生效的任务定义（当前执行口径），是锚，不可被 context 替代。
- **context** = 支撑 requirement 的背景材料包（旧 spec / 历史资料 / CodeMap / ProjectMap / PRD）。
- **sdd_discover** 动作同时接收 requirement + context：requirement 定方向，context 补理解。
  - CLI 推荐入口：`sdd discover <dir> --task-name <name> ...`
  - *注意*：若 context 与 requirement 冲突，以 requirement 为准，并在 Research 中记录冲突。
  - *禁止*：把 context 直接当作当前 requirement 的权威定义。

### 三层上下文架构
- **Spec**：当前任务工作单（核心执行域）。
