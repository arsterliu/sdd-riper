# SDD-RIPER Agent Instructions

## Core Rules (No Exceptions)
- **No Spec, No Code** — Do not write code without an approved Spec
- **Spec is Truth** — The Spec is the single source of truth, not the code
- **Reverse Sync** — If code diverges from Spec, update the Spec
- **Plan Approved** gate — Do not execute until Plan is explicitly approved by a human

## RIPER Workflow
Follow the RIPER phases: Pre-Research → Research → Innovate → Plan → Execute → Review

## Context Layers
- **Spec**: Current task work order (mydocs/specs/)
- **CodeMap**: Module structure and call chains (mydocs/codemap/)
- **ProjectMap**: Cross-repo contracts and ownership (mydocs/projectmap.md)

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
- **CodeMap**：模块结构 / 调用链路 / 外部依赖（本地代码级架构视图）。
- **ProjectMap**：跨仓库协作 / 接口契约 / 仓库职责（全局视角与边界）。

### CodeMap 治理规则
- **CodeMap 是模块级活文档，不是任务级产物**：按模块维护，跨任务复用；不要为每个任务单独新建一份 CodeMap。
- **按需创建**：仅当模块结构复杂、调用链不清晰、外部依赖较多，或后续 Research / Plan 会因缺少架构地图而失真时才创建。
- **先复用，再判断是否更新**：进入 Research / Plan 前，若已有对应模块的 CodeMap，先加载并检查是否仍然准确；不得在未确认过期前直接重建。
- **仅因架构事实变化而更新**：以下变化需要回写 CodeMap：入口点新增/删除/重命名、核心调用链结构改变、关键外部依赖变化、风险项出现或消失。
- **不是每次任务都更新**：若任务只改内部实现、注释、样式或不影响模块结构的细节，CodeMap 可以保持不变。
- **关闭任务前做一次 CodeMap 反向同步检查**：若本次任务改变了架构事实，必须在 Review 完成前更新 CodeMap，并记录 `updated-at` 与 `last-reason`。
