# Workflow Ceremony Reduction Context

## Source

当前会话。用户先要求分析项目的不合理与可简化之处，并提出“模型能力越强，sdd 应该要做减法”；随后关注简化是否导致目标漂移。主 Agent 建议先做保持目标约束不变的简化，用户回复“好，按这个推进”。

## Confirmed Intake

Version: v4.14
Task Name: workflow-ceremony-reduction
Autonomy Mode: supervised
Reference Materials: 本次对话，无其他资料。
User Confirmation: 用户明确确认上述版本、任务名与参考资料，并选择“supervised（推荐）：先给你审阅具体计划，经批准后实施”。

## Goal

减少普通任务中的重复确认、重复填写和机械流程要求，保留原始需求、目标与非目标、验收标准、授权边界及真实验证证据。

## Scope

- 已由当前用户明确提供或确认的任务创建信息不再次确认；缺失或存在实际歧义的信息仍需询问。
- micro 的指导与模板统一为现有五个必填 Plan 验证字段，减少重复描述和可选字段的默认填表负担；保留 Selected Option 单行真实方案记录以满足既有归档摘要，保留独立 Execute Log 与现有验收、批准、Challenge 证据要求。
- 将读取文件数、行数和固定任务规模引起的自动派发要求改为由宿主按上下文负担、任务边界和独立性收益判断；保留 standard/lite 独立 Research/Challenge 审查及 reviewer 授权要求。
- 普通 BUGFIX 和 DEVIATED_MINOR 不再单独强制创建 Learning；仍记录真实执行事实，保留重大偏差、升级失败、审查关注点和重开任务的既有处理。
- 同步代码、模板、Skill、生成规则、使用文档和相关回归测试，避免新旧指导同时生效。

## Non-Goals

- 不取消 Spec、Plan 批准、独立审查、验收覆盖或证据新鲜度要求。
- 不合并自治模式或更改授权摘要、Plan 激活、归档、Profile、E2E SKIPPED、Provider、视觉证据与外部权限门禁。
- 不拆分 Profile/Quality/视觉扩展，不改写历史归档，不同步或安装工作区外的 Skill。
- 不以现有实现倒推目标或降低验收标准，不加入用户未确认的新目标。

## Acceptance Intent

普通修复可以在既有验收与审查通过后继续到归档授权前，不因缺少没有复用价值的 Learning 而阻塞；缺失验收证据、失败审查、过期授权、范围或风险变化仍必须阻塞。用户已经确认的信息在规则与文档中被明确复用。micro 的五个必填字段与工具一致，可选描述不得成为隐式门禁。独立审查与实际验证证据要求不因派发阈值简化而减弱。

## Known Workspace State

工作区已有未跟踪文件 tests/fixtures/playwright-workspace/.gitignore；本任务不修改该文件。
