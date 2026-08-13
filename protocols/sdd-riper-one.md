# SDD-RIPER 协议（Standard）

> AI 配置文件简要参考。完整规则见 `SKILL.md`。

## 核心规则

- **无 Spec 不写码**：没有活跃任务 Spec 时不写代码。
- **Spec 是控制面**：Spec 拥有目标、门禁、计划、裁定，并引用 Design / Execute Log / Learning。
- **Design 独立**：standard 模式在 `design-file` 中写技术设计；Plan 不能替代。
- **Execute Log 独立**：每个 Plan 步骤和偏差记录在 `execute-log-file`。
- **Learning 独立**：偏差、修复、关注点或重开经验的可复用规则记录在 `learning-file`。
- **制品中文内容**：制品标题和可读标签保持英文；填写分析、决策、设计细节、计划步骤、证据和学习规则时使用中文。
- **Autonomy Mode**：`AUTONOMY_MODE=auto|supervised|human` 只提供项目默认值；每个 Spec 固定自己的模式与来源。`auto` 使用 Intake/Scope 授权，`supervised` 将人工 Plan Approval 与后续自动推进授权分别审计，`human` 在关键治理转换逐次确认。
- **Autonomy Write Safety**：自治写命令只操作当前活动 Spec，并在 `.sdd-autonomy.lock` 内复检摘要。supervised 同时绑定 Scope/Plan digest；auto 的 Plan 批准后必须追加 `plan_activation`，Plan、Scope 或风险变化会使旧激活失效。存在任何 `STOP_REASON` 时不得继续原生循环。
- **Independent Review**：Research / Challenge 的 reviewer 必须可审计：`subagent:<id>`、`external-agent:<id>` 或 `human:<name>`；micro Challenge 可 `inline`。自动 reviewer 仅可在当前 Spec 存在新鲜且明确包含 reviewer actor 的任务/Plan 授权时免于再次询问；项目配置或 Plan Approval 本身不构成授权。否则必须暂停并请求当前用户明确授权；不得跳过门禁或伪造证据。
- **Archive Authorization**：Archive authorization rule: request explicit archive authorization from the current user when `NEXT_ACTION: request_archive_authorization` appears. Agents must not construct archive authorization parameters or infer permission from Ready, PASS, Plan Approval, Challenge, or prior authorization. A `human:<name>` record is an audit declaration, not identity authentication.
- **Autonomous Cruise**：获得当前 Spec 的新鲜授权后，使用 `sdd next`、`sdd challenge`、`sdd cruise --driver auto` 路由、对抗审核和有界修复；`human` 模式只输出当前治理节点导航。使用 `--emit-claude-prompt` 获取宿主指引，`--record-run` 写入 `<docs-root>/runs/*.cruise.jsonl`。Cruise orchestrator 只负责路由与迭代边界；main agent 重入 `BACKTRACK_TARGET` 并遵守目标阶段门禁和写入边界；Challenge reviewer 始终保持 read-only。
- **先 Debug 再重试**：失败步骤先经过 `sdd debug` 再重试。
- **无验证不声明**：声明完成前运行全新测试 / lint / build。

## 阶段

```text
Research -> Innovate -> Design -> Acceptance -> Plan -> Execute* -> Challenge -> Learning Check -> Archive
```

- **Research**：需求审视、发现、待澄清问题、假设、已确认需求。
- **Visual Evidence（按需）**：每个 Spec 先从绑定的精确 Profile 与 `affected-units` 确定 `ui-impact`，未知时只问一次。前端或混合任务由 Agent 根据任务事实路由 `not-required|direction|fidelity`，但 Agent 不得代为启用严格合同；只有当前用户显式运行 `sdd visual init ...` 才激活，随后严格按合同 inspect 和执行。不得伪造、创建、替换或批准基线，也不得把状态解释为 diff 通过。
- **Innovate**：比较至少两个方案，记录被否决的方案。
- **Design**：在 `design-file` 中写技术设计；标签如 Selected Option / ADR、Requirement Traceability、Impact Scope、Architecture View、Data Model / Schema、Interface Contract、Compatibility / Rollback、Test Strategy 保持英文，内容用中文填写。
- **Acceptance**：在 Spec 中写 `AC-###` 验收标准；元数据标签如 `Requirement:`、`Verification:`、`Test:`、`Manual Evidence:` 保持英文，BDD / Gherkin 场景描述用中文。
- **Plan**：从 Design 和 Acceptance Criteria 派生原子步骤；Execute 前需要 gate evidence。
- **Execute**：严格遵循 Plan；每个步骤结果追加到 Execute Log。最后一步是 Completion Verification（四轴自检；AC Coverage 仅记录在前序正式 Execute Step）。
- **Challenge**：独立对抗审核；FAIL_* 裁定回溯到映射的阶段并阻止归档。
- **Learning Check**：执行产生可复用经验时创建 `learning-file`。
- **Cruise Run**：cruise 记录运行时追加运行账本条目。
- **Archive**：运行 `sdd validate <dir> --archive-ready` 只确认完成条件；等待当前用户明确授权后，使用 `sdd archive <dir> <spec-name> --authorized-by "human:<name>" --authorization-evidence "<text>"` 移动 Spec 及引用产物并记录授权。

## 子代理策略

不要让每个关键阶段都由子代理做决策。

- 子代理可负责证据收集、局部工作包、debug 调查或单个 challenge 轴。
- Challenge 代理是只读对抗审核者；返回裁定、证据和回溯目标。
- 编排者拥有需求边界、选定方案、Plan 门禁、最终裁定、completion verification、Learning 决策和归档一致性。
- 子代理的 PASS 不能替代编排者的新鲜验证。

## 上下文层

- **Hot**：活跃 Spec 阶段段落、Plan 和引用的制品路径。
- **Warm**：Design 文件、Execute Log 文件、Learning 文件、CodeMap、相关历史 Spec。
- **Cold**：完整归档文件、外部上下文包、长源码读取。

## 模式总览

- `standard`：完整流程；需外部 Technical Design；需外部 Execute Log；建议子代理负责证据/工作包/challenge 轴。
- `lite`：需外部 Design Note；需外部 Execute Log；子代理可选。
- `micro`：无独立 Design；Plan 须包含 Impact Scope、Data Impact、Interface Impact、Acceptance 和 Verification；需外部 Execute Log；默认避免子代理。
## Verification Provider Boundary

`Verification: e2e` 必须显式声明 `Provider:`。Provider 是项目配置，Adapter 是注册实现，Transport 仅属于 Adapter manifest。v3.0 只实现 `playwright-test` process Adapter；状态命令保持只读，缺失能力 fail closed 且不自动降级。
