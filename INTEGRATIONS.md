# SDD-RIPER ↔ Superpowers 集成映射

SDD-RIPER 提供**工作流契约**（阶段、门禁、审计链、文件系统状态）。[obra/superpowers](https://github.com/obra/superpowers) 项目提供**执行质量方法论**（如何做好 TDD、系统性调试、完成前验证等），以及 Innovate 阶段使用的**设计澄清方法**（`brainstorming`）。

本文件是两者的桥梁：列出每个调用 superpowers 的 SDD-RIPER 触点、对应技能、vendored 备份路径和运行时解析顺序。

## 触点索引

| SDD 触点 | SKILL.md 章节 | superpowers 技能 | vendored 路径 | 解析顺序 |
|:---|:---|:---|:---|:---|
| 设计澄清 | Innovate 阶段 | `brainstorming` | `vendored/superpowers/brainstorming/` | 全局 → vendored → 内联摘要（产物写入 SDD 的 Spec/`design-file`，而非 brainstorming 默认路径；可视化伴侣需要全局技能——其 `scripts/` 未被 vendored） |
| Plan 步骤粒度 | Plan 阶段 | `writing-plans` | `vendored/superpowers/writing-plans/` | 全局 → vendored → 内联摘要 |
| 子 Agent 路由 | 子 Agent 策略 | `subagent-driven-development` | `vendored/superpowers/subagent-driven-development/` | 全局 → vendored → 内联摘要（另见 `protocols/subagent-dispatch.md` 中 SDD-RIPER 自有的派发契约） |
| TDD 实施 | Execute 阶段（TDD） | `test-driven-development` | `vendored/superpowers/test-driven-development/` | 全局 → vendored → 内联摘要 |
| 调试排查 | Execute 阶段（调试） | `systematic-debugging` | `vendored/superpowers/systematic-debugging/` | 全局 → vendored → 内联摘要 |
| 完成验证 | Execute 阶段（完成验证门禁） | `verification-before-completion` | `vendored/superpowers/verification-before-completion/` | 全局 → vendored → 内联摘要 |
| 归档前 git 门禁 | Archive 阶段 | `finishing-a-development-branch` | `vendored/superpowers/finishing-a-development-branch/` | 全局 → vendored → 内联摘要 |

## SDD 适配优先级

**SDD adaptation takes precedence**：全局或 vendored Superpowers 技能提供方法论参考，SDD-RIPER 的阶段、制品路径、门禁和执行路由拥有最终控制权。读取一个技能不表示继承它的全部上游工作流交接。

- `writing-plans` 仅用于文件映射、原子步骤、TDD 和验证命令粒度；不得复制其上游 Plan Header 或 Execution Handoff，不得把未集成的 `executing-plans` 写成 SDD 必需技能。
- `subagent-driven-development` 仅提供子 Agent 路由方法；其指向 `executing-plans` 的跨会话分支不适用于 SDD。非子 Agent 路径由主 Agent 进入 SDD Execute Phase，并复用宿主原生持续执行能力。
- vendored 文件保持上游字节一致；所有覆盖规则写在 SDD 自有 `SKILL.md`、本映射和同步手册中。

## 解析语义

每个触点的 SKILL.md 指令要求 AI 编排器在执行门禁前**先加载方法论**。解析按以下顺序：

1. **全局 superpowers 技能**——如果编辑器（Claude Code / OpenCode / 支持技能的 Cursor）报告已加载对应技能，编排器应通过编辑器的技能机制调用。用户可获得最新上游版本加本地自定义。
2. **Vendored 副本**——若无全局技能，编排器应 `Read` `vendored/superpowers/<skill>/SKILL.md`。Vendored 副本锁定到特定上游提交，哈希见 `vendored/superpowers/.upstream-commit`。
3. **内联摘要**——SDD-RIPER 的 `SKILL.md` 内保留了每条规则的简短摘要（如"RED → GREEN → REFACTOR; 无失败测试，不写生产代码"）作为最终 fallback。精度降低，但确保工作流不会完全中断。

AI 不需要特殊协议来切换——它选择当前环境中可用的最高优先级选项。

## 子 Agent 派发

SDD-RIPER 的子 agent 不是通用并行工人，而是**一次性调查员**：替主 agent 读文件、跑调试、做审查，只带结论回来。主 agent 始终掌握决策权。

**对抗审查是强制派发场景**：standard/lite 必须派子 agent 执行 `sdd challenge`。对抗审查的核心价值是"不是自己审自己"——主 agent 写了代码再自己审，确认偏差不可避免。micro 可在主上下文内执行，但必须保持对抗角色与实现角色分离。

**其他何时派子 agent**：需要读 3+ 个文件或 500+ 行、调试排查、独立审查某个 Challenge 轴、大步执行任务。

**何时不派**：需要跟用户对话的需求澄清、方案选择、Plan 审批、归档执行——这些是主 agent 的职责。

**三条硬规则**：

1. **Brief 自足**：给子 agent 的任务描述里直接贴相关内容，不让它自己找。
2. **子 agent 不写 SDD 产物**：spec / design / log / learning 由主 agent 统一写入，子 agent 不能碰。但子 agent **可以改代码**——代码不是 SDD 产物，且并行改代码是合理的执行方式。
3. **返回压缩**：只返回 verdict + 摘要 + 证据指针，不贴大段原文。

**三种门禁主 agent 必须亲自确认，不能委托子 agent**：完成验证（跑测试）、Plan 批准（问用户）、Challenge 裁决（综合各方发现写最终 verdict）。

详细契约见 `protocols/subagent-dispatch.md`。superpowers 的 `subagent-driven-development` 提供高层方法论（何时派、生命周期），但 SDD-RIPER 的 brief/return 格式和硬规则以 `protocols/subagent-dispatch.md` 为准。

## 与全局 Superpowers 的共存

已全局安装 `obra/superpowers` 的用户**不需要**使用锁定的 vendored 版本。上述 fallback 链确保用户自己的安装优先：

- 高级用户获得最新上游版本 + 个人自定义。
- 新用户通过 vendored 副本获得保底可用的基线。
- 两条路径共享相同的 SDD-RIPER 契约，契约层行为一致。

## 许可证与归属

Vendored 技能在 **MIT License** 下分发，Copyright © 2025 Jesse Vincent。许可证原文保留在 `vendored/superpowers/LICENSE`。维护者操作手册见 `vendored/superpowers/SYNC.md`（同步流程、范围说明、许可证合规说明）。

SDD-RIPER 自身的契约层（工作流阶段、门禁、文件系统布局、`protocols/`、`templates/`）遵循 SDD-RIPER 自有许可证。两个项目独立且可组合——互非 fork。

## 新增触点

如果未来 SDD-RIPER 阶段需要调用其他 superpowers 技能（或任何外部方法论），按以下顺序更新：

1. 在上方**触点索引**表中新增一行。
2. 若需 vendoring，在 `vendored/superpowers/` 下添加技能目录，更新 `vendored/superpowers/SYNC.md` 的 Scope 章节。
3. 更新 `SKILL.md` 对应章节，使用 `(see vendored/superpowers/<X>/SKILL.md — read on demand; prefer global skill if loaded):` 模式。
4. 若触点影响用户可见的工作流，更新 `README.md`。

**不要跳过任何一步**——未完整接线的触点会静默降级到内联摘要，失去 vendoring 的意义。
