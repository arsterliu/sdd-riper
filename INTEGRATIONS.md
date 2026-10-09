# SDD-RIPER ↔ Superpowers 集成映射

SDD-RIPER 是阶段、门禁、制品与授权的唯一控制源。默认使用本地有界澄清、Plan 规则、派发协议和归档前状态检查；[obra/superpowers](https://github.com/obra/superpowers) 提供按需参考的方法，不为每个阶段再运行一套流程。

视觉 Context 引导与严格视觉证据合同是 SDD 的本地任务级能力，不依赖 Superpowers 或 Figma。每个新 Spec 先由精确 Profile / `affected-units` 或一次 UI 影响问题记录 `ui-impact`；纯后端跳过，前端或混合任务通过 `sdd visual select` 一次性记录 `visual-context-intent`。`sdd visual discover` 统一扫描本地材料、报告候选和缺口。Figma URL 与普通 URL 一样只作为 reference 候选：不联网读取、不自动批准；Figma MCP 获取器属于后续独立 Spec。只有显式 `sdd visual init` 才启用严格合同与对应 Plan 门禁。除显式 `sdd verify visual` 外，视觉 Context 与合同步骤不启动浏览器或执行截图 diff。对于人工批准基线的 fidelity 合同，显式配置的 `playwright-visual` Provider 可以通过 `sdd verify visual` 运行受控截图与显式 diff；它不替换 baseline，也不提供通用浏览器控制。

本文件声明方法触发条件与解析顺序。源码仓库保留七份 vendored 副本供维护参考；npm 包和 `install-skill` 产物不携带它们，也不会额外暴露技能入口。

## 触点索引

| SDD 触点 | 默认路径 | 可选参考 | vendored 路径 | 加载条件 |
|:---|:---|:---|:---|:---|
| 设计澄清 | `protocols/clarification.md`，仅处理阻塞决策 | `brainstorming` | `vendored/superpowers/brainstorming/` | 用户明确要求，或确需更广的备选方案探索；不继承上游审批 / 制品 / 交接 |
| Plan 步骤粒度 | SKILL.md 四项规则，按可独立验证变更组织 | `writing-plans` | `vendored/superpowers/writing-plans/` | 用户明确要求，或复杂依赖 / 文件映射确需额外指导 |
| 子 Agent 路由 | `protocols/subagent-dispatch.md` | `subagent-driven-development` | `vendored/superpowers/subagent-driven-development/` | 用户明确要求，或有具体 worker 协调问题；不能新增派发或审查门禁 |
| TDD 实施 | Execute 的适用性判断及 RED / GREEN / REFACTOR | `test-driven-development` | `vendored/superpowers/test-driven-development/` | 适用 TDD 的生产代码变更 |
| 调试排查 | 先 debug、查根因再重试 | `systematic-debugging` | `vendored/superpowers/systematic-debugging/` | 失败、缺陷或异常行为的调查 |
| 完成验证 | 新鲜命令、输出、退出码与 AC 对照 | `verification-before-completion` | `vendored/superpowers/verification-before-completion/` | 声明完成前；证据要求始终保留 |
| 分支收尾 | 只读检查与报告当前任务分支 / 工作区状态 | `finishing-a-development-branch` | `vendored/superpowers/finishing-a-development-branch/` | 明确请求或批准 Plan 覆盖合并、PR、清理，且该操作确需方法支持；不因准备归档自动加载 |

## SDD 适配优先级

**SDD adaptation takes precedence**：全局或 vendored 方法不能新增阶段、制品、审批或授权，也不能绕过既有门禁。读取方法不表示继承上游工作流交接。用户禁止使用 skills 时，直接使用 CLI 与 SDD 自有规则；证据与治理要求仍适用。

- 澄清协议借鉴 grill-me / grilling，不安装或调用其外部入口；默认不运行 `brainstorming`。可验证 AC 始终保留，方案比较和 Design 按 Spec 策略触发。
- `writing-plans` 不再默认加载；不得复制 Plan Header / Execution Handoff，不机械拆成固定时长小步，不把未集成的 `executing-plans` 写成必需技能。
- `subagent-driven-development` 不再默认加载；每任务新 worker、两阶段审查、跨会话 `executing-plans` 路由均不成为 SDD 要求。主 Agent 可内联执行，由另一个 reviewer 保持审查独立性。
- 分支状态检查不增加工作区必须干净的归档门禁，不因收尾自动提交、暂存、丢弃他人改动或删除 worktree。合并 / PR / 清理的任务授权不能替代专用人工停机要求。
- vendored 文件保持上游字节一致；所有覆盖规则写在 SDD 自有 `SKILL.md`、本映射和同步手册中。

## 解析语义

先判断上表触发条件，再解析所需方法。未触发的外部方法不加载；阶段开始或技能已全局安装不能绕过触发条件。已触发且允许使用 skill 时，解析顺序为：

1. **全局 superpowers 技能**——如果编辑器（Claude Code / OpenCode / 支持技能的 Cursor）报告已加载对应技能，编排器应通过编辑器的技能机制调用。用户可获得最新上游版本加本地自定义。
2. **源码仓库中的 Vendored 副本**——仅在该路径实际存在且用户允许使用 skill 时，编排器才可按需 `Read` `vendored/superpowers/<skill>/SKILL.md`。npm 包与安装后的 SDD skill 不含该路径；源码副本锁定到特定上游提交，哈希见 `vendored/superpowers/.upstream-commit`。
3. **内联摘要**——SDD-RIPER 的 `SKILL.md` 内保留了每条规则的简短摘要（如"RED → GREEN → REFACTOR; 无失败测试，不写生产代码"）作为最终 fallback。精度降低，但确保工作流不会完全中断。

SDD 自有协议不走外部方法 fallback 链。技能不可用或用户禁止调用时，保留内联执行质量规则，不把安装技能变成新门禁。

## 子 Agent 派发

SDD-RIPER 的子 agent 接收有界证据调查或工作包，返回压缩结论；主 agent 始终掌握控制面决策。

**独立审查按风险触发**：活动任务只支持 `streamlined-v1`；缺失、旧版或未知格式明确停止执行。低风险任务依靠新鲜验证，中风险完成后独立 Challenge，高风险另在实施前独立 Design 审查。独立 reviewer 使用可审计的 `subagent:<id>`、`external-agent:<id>` 或 `human:<name>`；自动 reviewer 仅在当前新鲜任务 / Plan 授权包含对应 actor，或当前用户明确授权时启动。历史归档永久只读，后续修复用普通 discover 新建独立任务并引用历史 Context，不继承审批和授权。

**普通工作是否派发**：依据任务边界、上下文成本与独立证据价值判断；文件数、行数与 mode 本身都不是派发门槛。内联实现与另派独立 reviewer 可以同时成立。

**何时不派**：需要跟用户对话的需求澄清、方案选择、Plan 审批、归档执行——这些是主 agent 的职责。

**三条硬规则**：

1. **Brief 自足**：给子 agent 的任务描述里直接贴相关内容，不让它自己找。
2. **子 agent 不写 SDD 产物**：spec / design / log / learning 由主 agent 统一写入，子 agent 不能碰。但子 agent **可以改代码**——代码不是 SDD 产物，且并行改代码是合理的执行方式。
3. **返回压缩**：只返回 verdict + 摘要 + 证据指针，不贴大段原文。

**三种门禁由主 agent 负责**：完成验证（亲自运行相关检查）、Plan 门禁（auto 凭证据由 agent 批准；supervised/human 获取人工批准）、Challenge 裁决（综合独立发现并用 CLI 记录）。Plan 批准不等于持续推进授权。

唯一派发契约是 `protocols/subagent-dispatch.md`；按需参考外部方法也不能改写其 brief/return、授权或角色边界。

## 与全局 Superpowers 的共存

已全局安装 `obra/superpowers` 的用户在触发条件满足时可优先使用自己的版本；安装状态本身不会激活可选方法：

- 高级用户获得最新上游版本 + 个人自定义。
- 新用户通过 SDD 自有协议及内联方法获得可用基线，不必安装上游技能。
- 两条路径共享相同的 SDD-RIPER 契约，契约层行为一致。

## 许可证与归属

Vendored 技能在 **MIT License** 下分发，Copyright © 2025 Jesse Vincent。许可证原文保留在 `vendored/superpowers/LICENSE`。维护者操作手册见 `vendored/superpowers/SYNC.md`（同步流程、范围说明、许可证合规说明）。

SDD-RIPER 自身的契约层（工作流阶段、门禁、文件系统布局、`protocols/`、`templates/`）遵循 SDD-RIPER 自有许可证。两个项目独立且可组合——互非 fork。

## 新增触点

如果未来 SDD-RIPER 阶段需要调用其他 superpowers 技能（或任何外部方法论），按以下顺序更新：

1. 在上方**触点索引**表中新增一行。
2. 若需 vendoring，在 `vendored/superpowers/` 下添加技能目录，更新 `vendored/superpowers/SYNC.md` 的 Scope 章节。
3. 更新 `SKILL.md` 对应章节，明确本地默认路径、外部方法触发条件及 SDD 覆盖边界；不能只添加无条件调用。
4. 若触点影响用户可见的工作流，更新 `README.md`。

**不要跳过任何一步**——未完整接线的触点会静默降级到内联摘要，失去 vendoring 的意义。
