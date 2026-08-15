# SDD-RIPER 团队治理与观察指南

这份指南面向团队负责人、交付负责人和流程维护者。它不要求团队记住一组命令，而是规定：团队怎样设定自治边界，哪些角色必须分离，遇到什么事实必须停下，以及怎样从当前制品观察真实进度。

SDD-RIPER 的工作流是：Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> (Cruise) -> Learning Check -> Archive。活动 Spec 是当前任务的控制面；Design、Execute Log 和 Learning 由 Spec 引用，并共同构成可审计事实链。

## 1. 团队默认与每个任务的覆盖

团队应先选定项目的 autonomy 默认值。建议默认使用 `supervised`：它让人批准 Plan，同时允许团队在需要时另行授予后续自动推进权限。默认值只是新 Spec 的建议起点，不是对任何任务的授权。

创建 Spec 前，AI 必须主动询问当前用户选择 `auto`、`supervised` 或 `human`；项目默认值只能作为推荐，不能静默代选。若成员已经明确指定 autonomy mode，AI 只复述并请其确认，不再重复询问或呈现选择。Spec 创建后会冻结 effective autonomy mode 及其来源；项目默认值后来变化，不会静默改变已经活动的 Spec。需要切换时，必须针对当前 Spec、当前范围和当前风险显式办理，旧授权随相关摘要变化而失效。

| Autonomy | Plan Approval | 后续推进 | 适用判断 |
| :--- | :--- | :--- | :--- |
| `auto` | 必须记录 `Plan Approved By: agent:<id>`、`Approved At` 和明确可验证的 `Gate Evidence` | 仍需要新鲜的任务授权和与当前 Plan 匹配的 activation；只在授权范围内连续推进 | 边界清楚、可逆、验证充分且风险较低的任务 |
| `supervised` | 必须记录 `Plan Approved By: human:<name>` 和 `Approved At` | Plan Approval 与持续自动推进授权是两件独立事件；前者不能推出后者 | 团队常规任务和渐进采用 |
| `human` | 必须记录 `Plan Approved By: human:<name>` 和 `Approved At` | 在治理节点暂停，由人逐次决定是否继续；Plan Approval 不能推出后续授权 | 高风险、不确定或需要紧密控制的任务 |

`standard`、`lite`、`micro` 由任务风险、影响范围、可逆性和不确定性决定，不由成员身份决定。单文件、低风险、可逆的变更可采用 `micro`；跨模块、公共接口、安全、权限、计费、迁移、不可逆变更或高不确定性应升级工作流深度。团队可以指定 owner 和 reviewer，但不能用组织头衔替代 Spec 中的证据与门禁。

## 2. 风险升级规则

自治授权只对当时的范围、风险、Plan 和授权角色有效。出现以下任一变化时，停止复用原有自动推进循环，更新制品并重新取得所需授权：

- 范围扩大、目标改变或出现新的下游影响；
- 新风险出现，尤其是安全、权限、计费、数据迁移、公共 API 或不可逆性；
- Plan 内容变化，导致已有 Plan digest 或 activation 不再匹配；
- effective autonomy mode、执行角色或 reviewer 角色需要变化；
- 验证策略降低、关键 AC 无法覆盖，或需要跳过原定验证；
- 平台权限、外部写入或不可恢复操作超出当前授权。

风险升级不是“把文档补齐后继续”的形式动作。main agent 必须读取 `STOP_REASON`，判断应回到 Research、Design、Acceptance、Plan、Execute / Debug、Execute Log 或 Learning Check，并在对应阶段的写入边界内处理。

## 3. 角色分离与责任

团队治理关心职责是否分离，而不是固定某个职位承担全部审批。

- 当前用户：确认 Spec 的关键输入，办理需要人工决定的 Plan、持续推进、跳过验证、不可逆操作和归档授权。
- main agent：维护活动 Spec 的一致性，聚合证据，执行门禁决策，写入最终制品，并进行最终验证。
- worker：只在授权的 Plan 步骤和文件边界内执行；发现边界变化时报告偏差，不自行扩张范围。
- Research reviewer：核对需求、假设和证据；`standard` / `lite` 使用可审计的独立角色。
- Challenge reviewer：只读审查，不修改代码、Plan、Design 或 SDD 制品，只返回 verdict、回退目标和证据。
- 团队负责人：设定项目默认值和本地责任分工，观察风险与停机原因；不替代当前 Spec 的审批记录。

`standard` / `lite` 的 Challenge 必须由独立、可审计的 `subagent:<id>`、`external-agent:<id>` 或 `human:<name>` 执行，并保持 read-only。`micro` 可以使用 `inline`，但实现角色与对抗审查角色仍要明确分开，不能把实现者的自我确认包装成独立审查。

自动 reviewer 只有在当前 Spec 存在新鲜、明确包含该 reviewer actor 的任务或 Plan 授权时才能启动。项目配置和 Plan Approval 本身都不足以推出 reviewer 授权。

## 4. 不可委托的人工硬停

以下事项无论 effective autonomy mode 为何都必须停下，由当前用户针对本次事实作出明确决定：

1. **归档**：当出现 `NEXT_ACTION: request_archive_authorization` 时，必须请求当前用户对本次归档明确授权。Agent 不得自行构造授权参数，也不得从 Ready、PASS、Plan Approval、Challenge 结论或以前的授权推断许可。`human:<name>` 只是审计声明，不是身份认证。
2. **Project Profile**：执行 `profile confirm` 前，必须向当前用户展示并确认 exact reviewed digest；Profile 的 `commandRefs` 只是事实，不自动执行，也不因此安装依赖。
3. **E2E SKIPPED**：环境不可用时先排障；环境确实无法修复时先记录 `BLOCKED`，再由人决定 retry 或批准记录 `SKIPPED`。选择 `SKIPPED` 时必须写明 `Reason`、`Approved By: human:<name>` 和 `Approved At`。Flaky 结果不是 PASS，也不是跳过理由。
4. **严格视觉证据**：当前用户必须显式运行 `sdd visual init ...` 才能启用 fidelity / direction 合同，并明确批准设计方向或 baseline。Agent 不得创建、生成、替换、批准、版本化或管理 baseline，也不得伪造截图差异结果。
5. **不可逆动作**：数据删除、迁移、发布等不可逆或难恢复操作必须人工介入。
6. **范围扩大与新风险**：任何 scope expansion 或 new risk 都必须停下重新审视范围、Plan 和授权。
7. **平台权限**：需要新的 platform permission、项目外写入或外部系统操作时，必须单独请求授权。

这些硬停是权限边界，不因进度紧迫、测试通过或已有审批而消失。历史归档与 legacy 制品保持只读兼容，不做静默迁移或重写。

当前正式 E2E gate 为 `playwright-test`；`playwright-mcp` 仍是延后能力。消费端 workspace 负责锁定依赖与浏览器，流程不自动降级，也不支持 Yarn PnP 作为依赖传递方式。

## 5. 偏差、失败与回退

Execute 允许在已批准目标和边界内作出实现层判断，但所有事实必须写入 Spec 引用的 Execute Log。

| 状态 | 团队处理 |
| :--- | :--- |
| `DONE` | 记录实际修改、验证命令和 AC Coverage |
| `BUGFIX` | 缺陷在当前步骤边界内修复；先确定根因，再验证 |
| `DEVIATED_MINOR` | 目标和边界不变、实现方法调整；如实记录后可按授权继续 |
| `DEVIATED_MAJOR` | 目标无效、越界、下游 Plan 失效或发现新需求；立即停止并回到 Plan 或 Design |
| `BLOCKED` | 记录阻塞事实和已验证的根因，不以重复尝试掩盖问题 |
| `BUGFIX_ESCALATED` | 有界重试仍未解决；停止并升级给人工或上游阶段 |

任何步骤失败都先 debug 根因，再决定修复或重试。不得通过删减验证、改写证据或把 FAIL 记成 PASS 来恢复推进。

Challenge 的 `FAIL_SPEC`、`FAIL_DESIGN`、`FAIL_ACCEPTANCE`、`FAIL_PLAN`、`FAIL_CODE`、`FAIL_LOG`、`FAIL_LEARNING` 都会阻止归档，并映射回相应阶段。结果必须通过受控记录入口写入，不能手填 Challenge Evidence。

Cruise orchestrator 只读取 `BACKTRACK_TARGET`、控制迭代预算并协调阶段重入。main agent 在目标阶段按该阶段门禁修复，然后重新验证并请求新的 Challenge；Challenge reviewer 始终 read-only。Cruise 只能在新鲜授权范围内运行，受 `CRUISE_MAX_ITERATIONS` 限制；预算耗尽、授权失效、出现新风险或触发人工硬停时立即停止。

## 6. 团队应观察的事实

团队看板和状态检查是只读投影，不是审批工具。日常同步优先观察以下事实：

| 可观察事实 | 要回答的问题 | 异常信号 |
| :--- | :--- | :--- |
| Active Spec | 当前目标 Spec 是哪一个，状态和阶段是什么 | 当前目标 Spec 未明确、解析错误、引用缺失或读取了历史副本 |
| Effective autonomy | 当前 Spec 冻结的是哪种模式，来源是什么 | 团队口头认知与 Spec 不一致 |
| Authorization state / Stop reason | 当前授权是否新鲜，为什么停下 | `scope_changed`、`risk_changed`、`plan_activation_required` 等未处理 |
| AC Coverage | 每个 AC 是否有真实的 PASS / FAIL / SKIPPED 证据 | AC 无覆盖、测试路径缺失、人工跳过信息不全 |
| Challenge actor / verdict | 谁执行了只读审查，结论和回退目标是什么 | reviewer 不可审计、实现者自签、`FAIL_*` 后仍继续归档 |
| Learning | 偏差、修复、concern 或重开是否形成可复用规则 | 重复问题持续发生但没有 Learning Check |
| Archive authorization | 是否存在当前用户对本次归档的明确授权 | 借用旧授权、根据 PASS 推断或由 Agent 构造证据 |

`sdd resume` 和 `sdd next` 适合查看当前活动任务、effective autonomy、授权状态、`STOP_REASON` 和下一动作；`sdd console` 适合跨任务只读观察。若投影与制品冲突，以活动 Spec 及其引用制品为准，先排查引用和新鲜度，不为了消除告警而填充虚假内容。

归档摘要由当前 Spec、Design、Execute Log、Challenge 和 Learning 制品生成。团队成员不需要维护重复摘要；当前用户只对本次归档动作授权，授权不会自动延续到下一次任务或重开任务。

## 7. 渐进采用检查表

团队可以从一项边界清楚、可逆且容易验证的真实任务开始，再根据审计事实扩大采用范围。

### 开始前

- [ ] 已约定项目 autonomy 默认值，并明确它不是任务授权。
- [ ] 已说明每个 Spec 会冻结 effective autonomy，切换模式需要重新确认。
- [ ] 已选定任务 owner、worker 和独立 reviewer 的责任边界。
- [ ] 已让用户确认 version、task-name、参考资料和 autonomy mode。
- [ ] 已按任务风险选择 `standard`、`lite` 或 `micro`，没有按人员身份分级。
- [ ] UI 任务由当前用户确认最新目标 UI PNG；旧页面截图只作为可选 Context，候选图和项目默认图片未被当作批准。
- [ ] AI 已说明推荐 `direction` 或 `fidelity` 的理由；若采用 `fidelity`，baseline PNG 与计划生成的 current screenshot 像素宽度和高度分别完全一致。
- [ ] 团队或 Provider 维护者已确认静态、项目内的场景映射，并保持测试数据、字体、资源和验证环境稳定。

### 执行中

- [ ] 团队只从 active Spec 读取当前范围、风险、Plan 和制品引用。
- [ ] `supervised` 下已把 Plan Approval 与持续自动推进授权分开记录。
- [ ] 每个执行步骤都有结果、验证证据和 AC Coverage。
- [ ] 偏差和失败先记录、debug，再决定继续、回退或升级。
- [ ] 自动 reviewer 的当前授权明确包含其 actor，Challenge reviewer 保持只读。
- [ ] `STOP_REASON` 非空时没有复用旧循环继续推进。
- [ ] worker 发现或读取到 `stale` 时没有复用旧结果，已在 Execute Log 记录原因并重新获取证据。

### 完成前

- [ ] 所有 AC 都有可核验覆盖；E2E SKIPPED 如有发生，具备人工批准证据。
- [ ] Challenge actor、verdict、summary 与 backtrack target 可审计。
- [ ] `FAIL_*` 已按映射回退处理，并在预算与授权内重新验证。
- [ ] 偏差、修复、concern 或重开经验已完成 Learning Check。
- [ ] 归档就绪只被视为 readiness，没有被当作当前用户授权。
- [ ] 当前用户仅针对本次归档明确授权，归档摘要由现有制品生成。
- [ ] Visual 结果未因 Provider、配置、合同、baseline 或代码状态变化而 `stale`；团队没有把视觉合同当作新增 Archive Gate，证据缺口仍由当前任务的 AC 与 Execute Log 承担。

团队复盘应依据这些事实调整默认值、reviewer 配置、验证策略和采用范围。不要预设效率结论；先观察停机原因、AC 覆盖、失败回退和 Learning 是否让交付更可控，再决定下一阶段的推广范围。
