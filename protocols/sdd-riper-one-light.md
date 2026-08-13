# SDD-RIPER 协议（Lite / Micro）

> AI 配置文件简要参考，适用于 lite / micro 项目。完整规则见 `SKILL.md`。

## 核心规则

- **无 Spec 不写码**。
- **Spec 是控制面**：Spec 引用 Design / Execute Log / Learning，而非内嵌。
- **制品中文内容**：制品标题和可读标签保持英文；填写分析、决策、计划步骤、证据和学习规则时使用中文。
- **Autonomy Mode**：`AUTONOMY_MODE=auto|supervised|human` 只提供项目默认值；每个 Spec 固定自己的模式与来源。`auto` 使用 Intake/Scope 授权，`supervised` 将人工 Plan Approval 与后续自动推进授权分别审计，`human` 在关键治理转换逐次确认。
- **Autonomy Write Safety**：自治写命令只操作当前活动 Spec，并在 `.sdd-autonomy.lock` 内复检摘要。supervised 同时绑定 Scope/Plan digest；auto 的 Plan 批准后必须追加 `plan_activation`，Plan、Scope 或风险变化会使旧激活失效。存在任何 `STOP_REASON` 时不得继续原生循环。
- **Independent Review**：Research / Challenge reviewer 使用 `subagent:<id>`、`external-agent:<id>` 或 `human:<name>`；micro Challenge 可 `inline`。自动 reviewer 仅可在当前 Spec 存在新鲜且包含 reviewer actor 的任务/Plan 授权时免于再次询问；否则暂停并请求当前用户明确授权。项目配置或 Plan Approval 不能代替授权；不得跳过门禁或伪造证据。
- **Archive Authorization**：Archive authorization rule: request explicit archive authorization from the current user when `NEXT_ACTION: request_archive_authorization` appears. Agents must not construct archive authorization parameters or infer permission from Ready, PASS, Plan Approval, Challenge, or prior authorization. A `human:<name>` record is an audit declaration, not identity authentication.
- **Autonomous Cruise**：获得当前 Spec 的新鲜授权后，使用 `sdd next`、`sdd challenge`、`sdd cruise --driver auto` 进行路由、对抗审核和有界修复；`human` 模式只输出当前治理节点导航。使用 `--emit-claude-prompt` 获取宿主指引，`--record-run` 写入 `<docs-root>/runs/*.cruise.jsonl`。Cruise orchestrator 只负责路由与迭代边界；main agent 重入 `BACKTRACK_TARGET` 并遵守目标阶段门禁和写入边界；Challenge reviewer 始终保持 read-only。
- **Execute Log 必需**：所有模式都将步骤结果写入 `execute-log-file`。
- **Learning 条件性**：偏差、修复、关注点和重开经验需要 `learning-file`。
- **先 Debug 再重试**。
- **无验证不声明**。

## Lite 模式

流程：

```text
Research -> Innovate/Skip -> Design Note -> Acceptance -> Plan -> Execute* -> Challenge -> Learning Check -> Archive
```

必需制品：

- Spec 含已确认需求、创新方案或显式跳过原因、验收标准、计划、审批、评审摘要。
- `design-file` 中的 Design Note，英文标签、中文内容。
- `execute-log-file` 中的 Execute Log。
- 需要时 `learning-file` 中的 Learning Record。

Design Note 须覆盖 Approach、Impact Scope、Interface / Data Impact、Compatibility、Risks 和 Test Strategy。

## Micro 模式

流程：

```text
Plan -> Execute* -> Challenge -> Learning Check -> Archive
```

每个 Spec 先从绑定的精确 Profile 与 `affected-units` 确定 `ui-impact`，未知时只问一次。前端或混合任务由 Agent 根据任务事实路由 `not-required|direction|fidelity`，但 Agent 不得代为启用严格合同；只有当前用户显式运行 `sdd visual init <dir> --spec <path> --mode fidelity|direction` 才激活，随后严格按合同 inspect 和执行。不得伪造、创建、替换或批准基线，也不得宣称截图 diff 已通过。

Micro 跳过 Research、Innovate 和独立 Design。Plan 须包含：

- Selected Option
- Scope
- Touched Files
- Change
- Impact Scope
- Data Impact
- Interface Impact
- Acceptance
- Verification
- Blast Radius

Micro 仍需外部 Execute Log、条件性 Learning Record 和配置的 Plan 门禁。

## Challenge 与 Completion Verification

- Execute 最后一步是 Completion Verification（四轴自检；AC Coverage 仅记录在前序正式 Execute Step）。
- Lite 使用四轴自检：Intake、Design/Acceptance/Plan、Code Diff、Execute Log。
- Micro 默认 Axis 2，但归档校验仍需 Plan 审批、Execute Log 和 PASS challenge 裁定。
- Challenge 是 Execute 后的唯一质量门禁。FAIL_* 裁定回溯到映射的阶段并阻止归档。

## 子代理策略

- Lite 可用子代理进行大范围读取、debug 调查或 challenge 轴。
- Lite 有独立 challenge 代理时应使用它。
- Micro 默认单代理执行。
- 编排者拥有最终决策、Plan 审批、completion verification 和最终裁定。
## Verification Provider Boundary

E2E AC 使用 `Provider:` 引用具名配置；仅显式 `sdd verify run` 可以执行已注册 Adapter。v3.0 只实现 `playwright-test`，不支持 Yarn PnP、MCP 或任意 command 降级。
