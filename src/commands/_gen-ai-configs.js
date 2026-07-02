const fs = require('fs');
const path = require('path');

function run(projectDir, mode, force) {
  if (!mode) mode = 'standard';
  if (['standard','lite','micro'].indexOf(mode) === -1) {
    console.error('[ERROR] Invalid mode: ' + mode + ' (expected standard|lite|micro)');
    process.exit(3);
  }

  var created = 0, skipped = 0;

  function writeConfig(dst, content) {
    var dir = path.dirname(dst);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(dst) && !force) {
      console.log('[SKIP] ' + dst + ' already exists');
      skipped++;
      return;
    }
    fs.writeFileSync(dst, content, 'utf-8');
    console.log('[CREATE] ' + dst);
    created++;
  }

  var agentsContent = [
    '# SDD-RIPER Agent 指令',
    '',
    '## 核心规则（不可违反）',
    '- **无 Spec 不写码** — 除非存在任务 Spec，否则不写代码。',
    '- **Spec 是控制面** — Spec 拥有任务门禁，引用 Design / Execute Log / Learning 制品。',
    '- **Design 独立** — standard/lite 模式在 design-file 中写技术设计；Plan 不能替代。',
    '- **Execute Log 独立** — 在 execute-log-file 中记录步骤结果和偏差。',
    '- **Learning Check** — 当偏差、修复、关注点或重开经验产生可复用规则时，创建 learning-file。',
    '- **制品中文内容** — 保持制品标题和字段标签为英文；填写分析、决策、计划、证据和学习规则时使用中文。',
    '- **Gate Policy** — 默认 gate-policy 为 auto；`auto-gate` 需要填写 `Gate Evidence:`；manual policy 需要人工审批。',
    '- **Autonomous Cruise** — 使用 `sdd next`、`sdd challenge`、`sdd cruise --engine auto` 进行动态路由、对抗审核和有界修复循环。仅在 `CRUISE_POLICY="autonomous"` 时复用宿主原生循环；否则使用 prompt-loop 补偿。使用 `--emit-claude-prompt` 获取 Claude Code ultracode/workflow 指引，`--record-run` 记录运行账本。',
    '- **先 Debug 再重试** — 步骤失败时，先运行 debug 找根因再重试。',
    '',
    '## RIPER 工作流',
    'Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> Learning Check',
    '',
    '## 上下文层',
    '- **Spec**：当前任务控制面（<docs-root>/specs/，默认 mydocs/specs/）。',
    '- **Design**：由 Spec design-file 引用的技术设计 / Design Note。',
    '- **Execute Log**：由 Spec execute-log-file 引用的步骤审计轨迹。',
    '- **Learning**：由 Spec learning-file 引用的可复用决策规则。',
    '- **Cruise Runs**：可观测的 cruise 迭代账本（<docs-root>/runs/，默认 mydocs/runs/）。',
    '- **CodeMap**（按需）：运行 `sdd codemap <dir>` 获取计算架构视图——不持久化，始终最新。',
    '',
    '## Docs Root 配置',
    'docs root 目录默认为 mydocs/，可通过 .sdd-config（DOCS_DIR=...）覆盖。',
    '',
    '## Mode: ' + mode
  ].join('\n');
  writeConfig(path.join(projectDir, 'AGENTS.md'), agentsContent);

  var claudeContent = [
    '# Claude 项目指令 - SDD-RIPER',
    '',
    '## 记忆',
    '- 开始任何任务前，始终加载最新的 Spec。',
    '- 需要 Design 或执行事实时，遵循 design-file 和 execute-log-file 引用。',
    '- 显式跟踪 RIPER 阶段转换。',
    '',
    '## 行为',
    '- 绝不在没有 Spec 的情况下写代码。',
    '- 绝不在没有 gate evidence 的情况下越过 Plan：人工审批，或 auto policy 下的 `Plan Approved By: auto-gate` 加 `Gate Evidence:`。',
    '- 绝不用 Plan 替代 standard/lite Design。',
    '- 绝不手动填写 Challenge Evidence 字段。始终使用 `sdd challenge --record-result "VERDICT" --summary "..." --executed-by "subagent"` 记录 challenge 结果。',
    '- 始终在 execute-log-file 引用的 Execute Log 中记录 Plan 偏差。',
    '- 当偏差、修复、关注点或重开经验产生可复用规则时，始终创建 Learning Record。',
    '- 始终保持制品标题和字段标签为英文，填写制品内容时使用中文。',
    '- 步骤失败时，始终先运行 debug 再重试。',
    '',
    '## RIPER 阶段门禁',
    '当前阶段必须显式。禁止：静默跳过阶段。',
    '',
    '## 入口命令',
    '- sdd discover <dir> --task-name <name> --version v1.0 ... = 启动新任务 / Research 阶段。',
    '- sdd validate <dir> --archive-ready = 归档前检查 Spec、Design、Execute Log、Learning、审批和 challenge 门禁。',
    '- sdd next <dir> = 检查动态工作流状态和下一步动作。',
    '- sdd challenge <dir> = 生成独立对抗审核提示。',
    '- sdd cruise <dir> [--engine auto|prompt|local-loop|claude-code|codex|opencode] [--emit-claude-prompt] [--record-run] [--iteration N] = 生成 cruise 提示，可选 Claude ultracode/workflow 提示和运行账本条目；local-loop 是 prompt-loop 补偿，不是 SDD 模型执行器。',
    '- sdd new-learning <dir> [spec-name] = 创建并绑定 Learning Record。',
    '- sdd codemap <dir> = 输出计算架构视图（按需，不持久化）。',
    '- sdd resume <dir> = 恢复已有任务 / 重载上下文。',
    '',
    '## Docs Root 配置',
    'docs root 目录默认为 mydocs/，可通过 .sdd-config（DOCS_DIR=...）覆盖。',
    '',
    '## Mode: ' + mode
  ].join('\n');
  writeConfig(path.join(projectDir, 'CLAUDE.md'), claudeContent);

  var cursorContent = [
    '# SDD-RIPER Cursor 规则',
    '',
    'RULE: 除非 <docs-root>/specs/（默认 mydocs/specs/）中存在任务 Spec，否则不写代码。',
    'RULE: SDD-RIPER 阶段为 Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> Learning Check。',
    'RULE: 制品标题和字段标签保持英文；填写的制品内容默认使用中文。',
    'RULE: Execute 阶段前必须填写 Plan Approved By 和 Approved At；auto-gate 还需要 Gate Evidence。',
    'RULE: 使用 sdd next / sdd challenge / sdd cruise --engine auto 进行自主工作流路由和对抗审核；使用 --emit-claude-prompt 获取 Claude Code ultracode 指引和 --record-run 记录运行账本。',
    'RULE: standard/lite Design 存在于 design-file；Execute Log 存在于 execute-log-file。',
    'RULE: 当偏差、修复、关注点或重开经验发生时，Learning Records 存在于 learning-file。',
    'RULE: 归档前运行 sdd validate <dir> --archive-ready。',
    'RULE: Spec 是控制面；代码必须匹配 Spec 和引用的制品。',
    'RULE: 先 Debug 再重试 — 步骤失败时，先运行 debug 找根因。',
    'RULE: 按需使用 `sdd codemap <dir>` 获取架构视图——扫描源代码实时生成，无过期文件。',
    'RULE: docs root 默认为 mydocs/，可通过 .sdd-config（DOCS_DIR=...）覆盖。',
    'RULE: mode=' + mode
  ].join('\n');
  writeConfig(path.join(projectDir, '.cursorrules'), cursorContent);

  var copilotContent = [
    '# GitHub Copilot 指令 - SDD-RIPER',
    '',
    '## 工作流',
    '生成代码建议时，始终遵循 SDD-RIPER 方法论。',
    '',
    '## 关键规则',
    '- 无 Spec 不写码：建议代码前检查 <docs-root>/specs/（默认 mydocs/specs/）。',
    '- SDD-RIPER 阶段：Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> Learning Check。',
    '- Design、Execute Log 和 Learning 是独立制品，分别由 design-file、execute-log-file 和 learning-file 引用。',
    '- 制品标题和字段标签保持英文；填写的制品内容默认使用中文。',
    '- Plan Approved 门禁：`Plan Approved By:` 和 `Approved At:` 填写前不建议实现代码；auto-gate 还需要 `Gate Evidence:`。',
    '- 自主工作流：使用 `sdd next`、`sdd challenge`、`sdd cruise --engine auto` 进行路由、对抗审核和有界修复；使用 `--emit-claude-prompt` 获取 Claude Code ultracode 指引和 `--record-run` 记录运行账本。',
    '- 归档门禁：归档前运行 sdd validate <dir> --archive-ready。',
    '- 先 Debug 再重试：代码失败时，先运行 debug 找根因再重试。',
    '- CodeMap（按需）：运行 `sdd codemap <dir>` 获取实时架构视图——不持久化，始终最新。',
    '',
    '## Docs Root 配置',
    'docs root 目录默认为 mydocs/，可通过 .sdd-config（DOCS_DIR=...）覆盖。',
    '',
    '## Mode: ' + mode
  ].join('\n');
  writeConfig(path.join(projectDir, '.github', 'copilot-instructions.md'), copilotContent);

  return { created: created, skipped: skipped };
}

module.exports = { run: run };
