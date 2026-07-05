const fs = require('fs');
const path = require('path');

var BLOCK_START = '<!-- sdd-riper:start -->';
var BLOCK_END = '<!-- sdd-riper:end -->';

function sddBlock(title, mode, bodyLines) {
  return [
    BLOCK_START,
    '## ' + title,
    '',
    'This project uses SDD-RIPER. Do not reconstruct the workflow manually; use the `sdd-riper` skill when available, or the `sdd` CLI as the procedural source of truth.',
    '',
    'Hard rules:',
    '- Load the latest active Spec before implementation.',
    '- Do not write code without an active Spec.',
    '- Before creating a Spec, ask the user to provide or confirm `version` and `task-name`; do not infer them silently.',
    '- Before creating a Spec, ask whether reference materials / context exist, and bind them with `context-source` when provided.',
    '- Do not move past Plan without gate evidence.',
    '- Follow `design-file`, `execute-log-file`, and `learning-file` references from the Spec.',
    '- Follow `context-source` to find raw materials (PRD, UI mockups, prototypes) in `mydocs/context/<task-name>/`.',
    '- Record execution deviations in the referenced Execute Log.',
    '- Do not manually fill Challenge Evidence fields; use `sdd challenge --record-result "VERDICT" --summary "..." --executed-by "subagent"`.',
    '- Keep artifact headings and field labels in English; write artifact content in Chinese.',
    '- Debug before retrying failed steps.',
    '',
    'Entry points:',
    '- `sdd resume <dir>` reloads active task context.',
    '- `sdd next <dir>` inspects current state and next action.',
    '- `sdd validate <dir> --archive-ready` checks archive readiness.',
    '- `sdd challenge <dir>` generates or records adversarial challenge.',
    '- `sdd cruise <dir>` produces bounded repair-loop guidance and run ledger entries.',
    '',
    'Project configuration:',
    '- Docs root defaults to `mydocs/`, override via `.sdd-config` (`DOCS_DIR=...`).',
    '- Mode: ' + mode,
    ''
  ].concat(bodyLines || []).concat([BLOCK_END]).join('\n');
}

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : text + '\n';
}

function upsertManagedBlock(existing, block) {
  var start = existing.indexOf(BLOCK_START);
  var end = existing.indexOf(BLOCK_END);
  if (start !== -1 && end !== -1 && end > start) {
    end += BLOCK_END.length;
    return {
      content: existing.slice(0, start) + block + existing.slice(end),
      action: 'update'
    };
  }
  var prefix = ensureTrailingNewline(existing.trimEnd());
  return {
    content: prefix + '\n' + block + '\n',
    action: 'merge'
  };
}

function run(projectDir, mode, force) {
  if (!mode) mode = 'standard';
  if (['standard','lite','micro'].indexOf(mode) === -1) {
    console.error('[ERROR] Invalid mode: ' + mode + ' (expected standard|lite|micro)');
    process.exit(3);
  }

  var created = 0, skipped = 0;

  function writeConfig(dst, block) {
    var dir = path.dirname(dst);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(dst)) {
      fs.writeFileSync(dst, block + '\n', 'utf-8');
      console.log('[CREATE] ' + dst);
      created++;
      return;
    }

    var existing = fs.readFileSync(dst, 'utf-8');
    var result = upsertManagedBlock(existing, block);
    if (result.content === existing) {
      console.log('[SKIP] ' + dst + ' SDD-RIPER block already current');
      skipped++;
      return;
    }
    fs.writeFileSync(dst, result.content, 'utf-8');
    console.log('[' + result.action.toUpperCase() + '] ' + dst + (result.action === 'merge' ? ' appended SDD-RIPER block' : ' refreshed SDD-RIPER block'));
    created++;
  }

  var agentsContent = sddBlock('SDD-RIPER Agent Instructions', mode);
  writeConfig(path.join(projectDir, 'AGENTS.md'), agentsContent);

  var claudeContent = sddBlock('Claude Project Instructions - SDD-RIPER', mode, [
    '',
    'Claude-specific reminder:',
    '- Explicitly track RIPER phase transitions.',
    '- Standard/lite Challenge execution must include `subagent`; micro may use inline only when roles remain separated.'
  ]);
  writeConfig(path.join(projectDir, 'CLAUDE.md'), claudeContent);

  var cursorContent = sddBlock('SDD-RIPER Cursor Rules', mode, [
    '',
    'Cursor-specific reminder:',
    '- Treat generated suggestions as invalid unless they fit the active Spec, Design, Plan, and referenced artifacts.'
  ]);
  writeConfig(path.join(projectDir, '.cursorrules'), cursorContent);

  var copilotContent = sddBlock('GitHub Copilot Instructions - SDD-RIPER', mode, [
    '',
    'Copilot-specific reminder:',
    '- Prefer suggestions that preserve SDD-RIPER gates and do not invent implementation work outside the active Spec.'
  ]);
  writeConfig(path.join(projectDir, '.github', 'copilot-instructions.md'), copilotContent);

  return { created: created, skipped: skipped };
}

module.exports = { run: run };
