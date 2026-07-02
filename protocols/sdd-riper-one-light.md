# SDD-RIPER 协议（Lite / Micro）

> AI 配置文件简要参考，适用于 lite / micro 项目。完整规则见 `SKILL.md`。

## 核心规则

- **无 Spec 不写码**。
- **Spec 是控制面**：Spec 引用 Design / Execute Log / Learning，而非内嵌。
- **制品中文内容**：制品标题和可读标签保持英文；填写分析、决策、计划步骤、证据和学习规则时使用中文。
- **Gate Policy**：默认 auto。人工审批填写 `Plan Approved By:`；auto 审批填写 `Plan Approved By: auto-gate` 加 `Gate Evidence:`。
- **Autonomous Cruise**：使用 `sdd next`、`sdd challenge`、`sdd cruise` 进行路由、对抗审核和有界修复。仅在 `CRUISE_POLICY="autonomous"` 时优先使用宿主原生循环；否则回退到 prompt-loop 补偿。使用 `--emit-claude-prompt` 获取 Claude Code ultracode/workflow 指引，`--record-run` 写入 `<docs-root>/runs/*.cruise.jsonl`。`CRUISE_POLICY="off"` 禁用 cruise 输出和运行记录。
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

Micro 跳过 Research、Innovate 和独立 Design。Plan 须包含：

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

- Execute 最后一步是 Completion Verification（四轴自检 + AC Coverage 汇总）。
- Lite 使用四轴自检：Intake、Design/Acceptance/Plan、Code Diff、Execute Log。
- Micro 默认 Axis 2，但归档校验仍需 Plan 审批、Execute Log 和 PASS challenge 裁定。
- Challenge 是 Execute 后的唯一质量门禁。FAIL_* 裁定回溯到映射的阶段并阻止归档。

## 子代理策略

- Lite 可用子代理进行大范围读取、debug 调查或 challenge 轴。
- Lite 有独立 challenge 代理时应使用它。
- Micro 默认单代理执行。
- 编排者拥有最终决策、Plan 审批、completion verification 和最终裁定。
