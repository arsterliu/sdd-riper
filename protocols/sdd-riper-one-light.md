# SDD-RIPER 协议（Lite / Micro）

> AI 配置文件简要参考，适用于 lite / micro 项目。完整规则见 `SKILL.md`。

## 核心规则

- **无 Spec 不写码**。
- **Spec 是控制面**：Spec 引用 Design / Execute Log / Learning，而非内嵌。
- **制品中文内容**：制品标题和可读标签保持英文；填写分析、决策、计划步骤、证据和学习规则时使用中文。
- **Autonomy Mode**：`AUTONOMY_MODE=auto|supervised|human` 只提供项目默认值；每个 Spec 固定自己的模式与来源。`auto` 使用 Intake/Scope 授权，`supervised` 将人工 Plan Approval 与后续自动推进授权分别审计，`human` 在关键治理转换逐次确认。
- **Autonomy Write Safety**：自治写命令只操作当前活动 Spec，并在 `.sdd-autonomy.lock` 内复检摘要。明确当前任务请求＋本任务显式 auto 选择授权普通范围内推进；Agent 评估并记录 Scope/Risk 后用真实请求/模式证据自动记录 main、worker 及风险需要的 design-reviewer、challenge-reviewer，不重复确认普通范围或低风险。高风险须当前用户知悉风险影响并授权边界的实际证据，否则停机；同范围同风险充分证据可复用，默认配置与历史授权不能替代。Agent 批准 Plan 且 Scope、风险、Plan digest 仍匹配时，主 Agent 自动追加 `plan_activation`，不得为此再次询问用户批准 Plan 或 reviewer。supervised 同时绑定 Scope/Plan digest；Plan、Scope 或风险变化会使旧激活失效。存在任何 `STOP_REASON` 时不得继续原生循环。
- **Independent Review**：Design / Challenge reviewer 使用 `subagent:<id>`、`external-agent:<id>` 或 `human:<name>`；micro Challenge 可 `inline`。自动 reviewer 仅可在当前 Spec 存在新鲜且包含 reviewer actor 的任务/Plan 授权时免于再次询问；否则暂停并请求当前用户明确授权。项目配置或 Plan Approval 不能代替授权；不得跳过门禁或伪造证据。
- **Archive Authorization**：Archive authorization rule: request explicit archive authorization from the current user when `NEXT_ACTION: request_archive_authorization` appears. Agents must not construct archive authorization parameters or infer permission from Ready, PASS, Plan Approval, Challenge, or prior authorization. A `human:<name>` record is an audit declaration, not identity authentication.
- **Autonomous Cruise**：获得当前 Spec 的新鲜授权后，使用 `sdd next`、`sdd challenge`、`sdd cruise --driver auto` 进行路由、对抗审核和有界修复；`human` 模式只输出当前治理节点导航。使用 `--emit-claude-prompt` 获取宿主指引，`--record-run` 写入 `<docs-root>/runs/*.cruise.jsonl`。Cruise orchestrator 只负责路由与迭代边界；main agent 重入 `BACKTRACK_TARGET` 并遵守目标阶段门禁和写入边界；Challenge reviewer 始终保持 read-only。
- **Execute Log 必需**：中高风险或多步骤任务将步骤结果写入 `execute-log-file`，低风险单步骤使用 Spec 验证。
- **Learning 条件性**：`BUGFIX_ESCALATED`、`DEVIATED_MAJOR`、`PASS_WITH_CONCERNS`仍要求 Learning；普通 `BUGFIX` / `DEVIATED_MINOR` 本身不强制创建，保留日志事实并按复用价值提炼规则。验收不足、重复失败模式仍应记录学习，`FAIL_LEARNING` 仍阻塞。
- **先 Debug 再重试**。
- **无验证不声明**。

## 当前格式与风险门禁

活动任务只执行 `streamlined-v1`；缺失、旧版和未知格式明确拒绝。micro、lite、standard 分别设置低、中、高风险下限，Risk Signals 可提高要求。

- 低风险单步骤：Spec 中记录 Intake、Acceptance、Plan、Result、Verification 和 Verified At。
- 中风险或多步骤：独立 Execute Log；中高风险要求独立完成 Challenge。
- 高风险或 design-latitude：独立 Design，字段为 Approach、Impact、Interface / Data、Compatibility / Rollback、Verification；高风险在实施前独立审查 Design。
- 归档永久只读，不支持 reopen。后续修复使用 discover 创建独立新任务，历史仅作为 Context，不继承审批和授权。

## Visual Context

每个 Spec 先从绑定的精确 Profile 与 affected-units 确定 ui-impact。baseline 是当前 Spec 冻结且人工认可的目标 UI PNG，不是跨 Spec 历史基线库。仅在目标为可解码 PNG、scenario / route / state / viewport 明确、目标与开发后的 current screenshot 尺寸可比且像素宽度和高度分别完全一致、测试数据 / 字体 / 资源稳定时推荐 fidelity；否则推荐 direction。Agent 必须解释推荐 direction 或 fidelity 的理由；候选图和默认图片不等同人工认可。

仅当前用户显式运行 sdd visual init 才激活严格合同；Agent 不得创建、生成、替换、批准、版本化或管理 baseline，不得自动启动浏览器，不得宣称未运行的截图 diff 已通过。历史 Context 只读；新增视觉证据必须写入当前任务的活动 Context。

## Verification Provider Boundary

E2E AC 使用 `Provider:` 引用具名配置；仅显式 `sdd verify run` 可以执行已注册 Adapter。v3.0 只实现 `playwright-test`，不支持 Yarn PnP、MCP 或任意 command 降级。
