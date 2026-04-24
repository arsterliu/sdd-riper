# SDD-RIPER Protocol (Lite)

**适用前提**:
- 需配合顶级模型（GPT-4 / Claude 3.5+）
- 团队已熟悉 RIPER 各阶段含义
- 不建议新团队直接使用 lite 模式

## 三铁律 (精简版)
- **铁律一：No Spec, No Code** — 没有 Spec 就不写代码
- **铁律二：Spec is Truth** — Spec 是代码的唯一真相源
- **铁律三：Reverse Sync** — 发现代码与 Spec 不一致，回写 Spec

## Pre-Research 与输入定义
### micro-spec 概念 (最小结构)
micro-spec 必须包含 5 个字段：**目标 / 范围 / 约束 / 风险 / Checklist**。
- micro-spec 是 requirement，绝不等于 context。

### 最小输入定义
- **requirement** = micro-spec（当前执行口径）。
- **context** = 背景材料包（可选，但不替代 requirement）。

## 分流规则
- **Fast / Standard / Deep 三档分流规则**：简单任务走 Fast（当前 Lite 模式），复杂任务必须回退到 Deep/Standard 模式。

## RIPER 各阶段轻量约束

### 1. Research 阶段
最小强制澄清动作（仅保留两个）：
1. Requirement Restatement
2. Open Questions

### 2. Innovate 阶段
- 允许跳过。如果跳过，必须写明：`Innovate: Skipped, Reason: [跳过原因]`。

### 3. Plan 阶段
- 允许 micro-plan（仅包含：文件 / 改动点 / 验收条件）。
- 依然需要获取 **Plan Approved By**。

### 4. Execute 阶段
- 只要求简短的 Change Summary。

### 5. Review 阶段
- 只要求输出：verdict + deviation summary。

### 6. Archive 阶段
- 允许简版 summary，不要求完整双份深度沉淀（免除 _human 和 _llm 双份强制）。

## 精简版禁止事项清单
- 未经 Plan Approved 不得写代码。
- 不得将 context 当作 requirement。
- Review 不得只写“没问题”。
- Archive 不得简单复制 Spec 原文。

## 热/冷两层加载规则（Lite 模式）

Lite 模式只有热/冷两层，无温层：

### 热层（Hot）— 每轮必带
- 当前 Spec 的活跃阶段区块（仅活跃部分，非全文）
- Micro Plan（若已存在）

### 冷层（Cold）— 默认不带
- 历史 Spec、archive 文件、其他任务 Spec、context 目录内容
- CodeMap / ProjectMap（Lite 模式默认不加载，除非开发者明确指定）

> 注：Lite 模式精简原则——宁可按需再请求，不预先装载所有上下文。
>
> CodeMap 治理规则在 Lite 模式下依然成立：CodeMap 仍是模块级活文档，默认不加载，但若开发者显式指定，必须优先复用已有 CodeMap，并且仅在架构事实变化时更新。
