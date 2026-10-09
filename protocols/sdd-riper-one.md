# SDD-RIPER 协议（Standard）

> AI 配置文件简要参考。完整规则见 `SKILL.md`。

## 核心规则

- **无 Spec 不写码**：没有活跃任务 Spec 时不写代码。
- **Spec 是控制面**：Spec 拥有目标、门禁、计划、裁定，并引用 Design / Execute Log / Learning。
- **Design 独立**：standard 模式在 `design-file` 中写技术设计；Plan 不能替代。
- **Execute Log 独立**：每个 Plan 步骤和偏差记录在 `execute-log-file`。
- **Learning 独立**：可复用规则记录在 `learning-file`。`BUGFIX_ESCALATED`、`DEVIATED_MAJOR`、`PASS_WITH_CONCERNS`仍要求 Learning；普通 `BUGFIX` / `DEVIATED_MINOR` 本身不强制创建，保留日志事实并按复用价值提炼规则。验收不足、重复失败模式仍应记录学习，`FAIL_LEARNING` 仍阻塞。
- **制品中文内容**：制品标题和可读标签保持英文；填写分析、决策、设计细节、计划步骤、证据和学习规则时使用中文。
- **Autonomy Mode**：`AUTONOMY_MODE=auto|supervised|human` 只提供项目默认值；每个 Spec 固定自己的模式与来源。`auto` 使用 Intake/Scope 授权，`supervised` 将人工 Plan Approval 与后续自动推进授权分别审计，`human` 在关键治理转换逐次确认。
- **Autonomy Write Safety**：自治写命令只操作当前活动 Spec，并在 `.sdd-autonomy.lock` 内复检摘要。明确当前任务请求＋本任务显式 auto 选择授权普通范围内推进；Agent 评估并记录 Scope/Risk 后用真实请求/模式证据自动记录 main、worker 及风险需要的 design-reviewer、challenge-reviewer，不重复确认普通范围或低风险。高风险须当前用户知悉风险影响并授权边界的实际证据，否则停机；同范围同风险充分证据可复用，默认配置与历史授权不能替代。Agent 批准 Plan 且 Scope、风险、Plan digest 仍匹配时，主 Agent 自动追加 `plan_activation`，不得为此再次询问用户批准 Plan 或 reviewer。supervised 同时绑定 Scope/Plan digest；Plan、Scope 或风险变化会使旧激活失效。存在任何 `STOP_REASON` 时不得继续原生循环。
- **Independent Review**：Design / Challenge 的 reviewer 必须可审计：`subagent:<id>`、`external-agent:<id>` 或 `human:<name>`；micro Challenge 可 `inline`。自动 reviewer 仅可在当前 Spec 存在新鲜且明确包含 reviewer actor 的任务/Plan 授权时免于再次询问；项目配置或 Plan Approval 本身不构成授权。否则必须暂停并请求当前用户明确授权；不得跳过门禁或伪造证据。
- **Archive Authorization**：Archive authorization rule: request explicit archive authorization from the current user when `NEXT_ACTION: request_archive_authorization` appears. Agents must not construct archive authorization parameters or infer permission from Ready, PASS, Plan Approval, Challenge, or prior authorization. A `human:<name>` record is an audit declaration, not identity authentication.
- **Autonomous Cruise**：获得当前 Spec 的新鲜授权后，使用 `sdd next`、`sdd challenge`、`sdd cruise --driver auto` 路由、对抗审核和有界修复；`human` 模式只输出当前治理节点导航。使用 `--emit-claude-prompt` 获取宿主指引，`--record-run` 写入 `<docs-root>/runs/*.cruise.jsonl`。Cruise orchestrator 只负责路由与迭代边界；main agent 重入 `BACKTRACK_TARGET` 并遵守目标阶段门禁和写入边界；Challenge reviewer 始终保持 read-only。
- **先 Debug 再重试**：失败步骤先经过 `sdd debug` 再重试。
- **无验证不声明**：声明完成前运行全新测试 / lint / build。

## 阶段

```text
Research -> Innovate -> Design -> Acceptance -> Plan -> Execute* -> Challenge -> Learning Check -> Archive
```

- **Research**：需求审视、发现、待澄清问题、假设、已确认需求。
- **Visual Evidence（按需）**：每个 Spec 先从绑定的精确 Profile 与 `affected-units` 确定 `ui-impact`，未知时只问一次。baseline 是当前 Spec 冻结且人工认可的目标 UI PNG，不是跨 Spec 历史基线库；新 Spec 可直接使用最新 UI PNG，旧页面截图只是可选 Context。`fidelity` 仅在目标为可解码 PNG、scenario / route / state / viewport 均明确、目标与开发后的 current screenshot 尺寸可比且像素宽度和高度分别完全一致、测试数据 / 字体 / 资源稳定时推荐，否则推荐 `direction`；Agent 必须解释推荐 `direction` 或 `fidelity` 的理由，候选图和默认图片不等同人工认可。Agent 不得代为启用严格合同；只有当前用户显式运行 `sdd visual init ...` 才激活，随后严格按合同 inspect 和执行。Agent 不得创建、生成、替换、批准、版本化或管理 baseline，不得自动启动浏览器，也不得把状态解释为 diff 通过。
- **Innovate**：比较按实质选择比较方案，记录被否决的方案。
- **Design**：在 `design-file` 中写技术设计；标签如 Approach、Impact、Interface / Data、Compatibility / Rollback、Verification 保持英文，内容用中文填写。
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

## 当前格式与风险门禁

活动任务只执行 `streamlined-v1`；缺失、旧版和未知格式明确拒绝。micro、lite、standard 分别设置低、中、高风险下限，Risk Signals 可提高要求。

- 低风险单步骤：Spec 中记录 Intake、Acceptance、Plan、Result、Verification 和 Verified At。
- 中风险或多步骤：独立 Execute Log；中高风险要求独立完成 Challenge。
- 高风险或 design-latitude：独立 Design，字段为 Approach、Impact、Interface / Data、Compatibility / Rollback、Verification；高风险在实施前独立审查 Design。
- 归档永久只读，不支持 reopen。后续修复使用 discover 创建独立新任务，历史仅作为 Context，不继承审批和授权。

## Verification Provider Boundary

`Verification: e2e` 必须显式声明 `Provider:`。Provider 是项目配置，Adapter 是注册实现，Transport 仅属于 Adapter manifest。v3.0 只实现 `playwright-test` process Adapter；状态命令保持只读，缺失能力 fail closed 且不自动降级。
