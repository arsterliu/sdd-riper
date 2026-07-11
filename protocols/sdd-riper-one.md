# SDD-RIPER 协议（Standard）

> AI 配置文件简要参考。完整规则见 `SKILL.md`。

## 核心规则

- **无 Spec 不写码**：没有活跃任务 Spec 时不写代码。
- **Spec 是控制面**：Spec 拥有目标、门禁、计划、裁定，并引用 Design / Execute Log / Learning。
- **Design 独立**：standard 模式在 `design-file` 中写技术设计；Plan 不能替代。
- **Execute Log 独立**：每个 Plan 步骤和偏差记录在 `execute-log-file`。
- **Learning 独立**：偏差、修复、关注点或重开经验的可复用规则记录在 `learning-file`。
- **制品中文内容**：制品标题和可读标签保持英文；填写分析、决策、设计细节、计划步骤、证据和学习规则时使用中文。
- **Approval Policy**：`APPROVAL_POLICY=agent|human` 只控制 Plan Gate。默认 agent；agent 批准必须写 `Gate Evidence:`。
- **Independent Review**：Research / Challenge 的 reviewer 必须可审计：`subagent:<id>`、`external-agent:<id>` 或 `human:<name>`；micro Challenge 可 `inline`。If using a subagent, external-agent, review bot, or any other automated reviewer tool that requires authorization, pause and request explicit user authorization before proceeding; never skip the gate or fabricate reviewer evidence.
- **Autonomous Cruise**：cruise 默认开启，使用 `sdd next`、`sdd challenge`、`sdd cruise --driver auto` 路由、对抗审核和有界修复。`CRUISE_ENABLED=false` 禁用 cruise 输出和运行记录。使用 `--emit-claude-prompt` 获取 Claude Code ultracode/workflow 指引，`--record-run` 写入 `<docs-root>/runs/*.cruise.jsonl`。Cruise orchestrator 只负责路由与迭代边界；main agent 重入 `BACKTRACK_TARGET` 并遵守目标阶段门禁和写入边界；Challenge reviewer 始终保持 read-only。
- **先 Debug 再重试**：失败步骤先经过 `sdd debug` 再重试。
- **无验证不声明**：声明完成前运行全新测试 / lint / build。

## 阶段

```text
Research -> Innovate -> Design -> Acceptance -> Plan -> Execute* -> Challenge -> Learning Check -> Archive
```

- **Research**：需求审视、发现、待澄清问题、假设、已确认需求。
- **Innovate**：比较至少两个方案，记录被否决的方案。
- **Design**：在 `design-file` 中写技术设计；标签如 Selected Option / ADR、Requirement Traceability、Impact Scope、Architecture View、Data Model / Schema、Interface Contract、Compatibility / Rollback、Test Strategy 保持英文，内容用中文填写。
- **Acceptance**：在 Spec 中写 `AC-###` 验收标准；元数据标签如 `Requirement:`、`Verification:`、`Test:`、`Manual Evidence:` 保持英文，BDD / Gherkin 场景描述用中文。
- **Plan**：从 Design 和 Acceptance Criteria 派生原子步骤；Execute 前需要 gate evidence。
- **Execute**：严格遵循 Plan；每个步骤结果追加到 Execute Log。最后一步是 Completion Verification（四轴自检 + AC Coverage 汇总）。
- **Challenge**：独立对抗审核；FAIL_* 裁定回溯到映射的阶段并阻止归档。
- **Learning Check**：执行产生可复用经验时创建 `learning-file`。
- **Cruise Run**：cruise 记录运行时追加运行账本条目。
- **Archive**：运行 `sdd validate <dir> --archive-ready`；`archive` 将 Spec 及引用的 Design / Execute Log / Learning 移入归档目录。

## 子代理策略

不要让每个关键阶段都由子代理做决策。

- 子代理可负责证据收集、局部工作包、debug 调查或单个 challenge 轴。
- Challenge 代理是只读对抗审核者；返回裁定、证据和回溯目标。
- 编排者拥有需求边界、选定方案、Plan 门禁、最终裁定、completion verification、Learning 决策和归档一致性。
- 子代理的 PASS 不能替代编排者的新鲜验证。

## 上下文层

- **Hot**：活跃 Spec 阶段段落、Plan 和引用的制品路径。
- **Warm**：Design 文件、Execute Log 文件、Learning 文件、CodeMap、ProjectMap、相关历史 Spec。
- **Cold**：完整归档文件、外部上下文包、长源码读取。

## 模式总览

- `standard`：完整流程；需外部 Technical Design；需外部 Execute Log；建议子代理负责证据/工作包/challenge 轴。
- `lite`：需外部 Design Note；需外部 Execute Log；子代理可选。
- `micro`：无独立 Design；Plan 须包含 Impact Scope、Data Impact、Interface Impact、Acceptance 和 Verification；需外部 Execute Log；默认避免子代理。
