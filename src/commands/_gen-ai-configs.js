const fs = require('fs');
const path = require('path');
const reviewerGuidance = require('../core/reviewer-guidance');

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
    '- Do not move past Plan without approval and gate evidence.',
    '- Follow `design-file`, `execute-log-file`, and `learning-file` references from the Spec.',
    '- Follow `context-source` to find raw materials (PRD, UI mockups, prototypes) in `mydocs/context/<task-name>/`.',
    '- Only when the user explicitly requires UI visual fidelity or formal UI design-quality confirmation, ask whether to enable visual evidence; after confirmation use `sdd visual init ... --mode fidelity|direction` and `sdd visual inspect` before Plan approval. Do not infer this from a frontend role, fabricate a visual baseline, or treat readiness as visual diff PASS.',
    '- When a Spec declares `project-profile-revision`, Research must read that exact revision; never substitute `profiles/current.json`.',
    '- Before running `sdd profile confirm`, stop and obtain explicit current user authorization for the exact reviewed digest.',
    '- Profile `commandRefs` are facts and must not be executed automatically.',
    '- Profile detection and inheritance must not install dependencies or initialize a Verification Provider.',
    '- Record execution deviations in the referenced Execute Log.',
    '- Do not manually fill Challenge Evidence fields; use `sdd challenge --record-result "VERDICT" --summary "..." --executed-by "subagent:<id>|external-agent:<id>|human:<name>|inline"`.',
    '- Independent Review is separate from approval: Research/Challenge reviewers must be auditable (`subagent:<id>`, `external-agent:<id>`, or `human:<name>`; micro Challenge may use `inline`).',
    '- ' + reviewerGuidance.authorizationLine(),
    '- When `NEXT_ACTION: request_archive_authorization` appears, stop and request explicit archive authorization from the current user.',
    '- Agents must not construct archive authorization parameters or infer permission from Ready, PASS, Plan Approval, Challenge, or prior authorization.',
    '- A `human:<name>` archive record is an audit declaration, not identity authentication.',
    '- ' + reviewerGuidance.integrityLine(),
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
    '- `APPROVAL_POLICY=agent|human` controls only the Plan approval gate; `agent` approvals require `Gate Evidence`.',
    '- Cruise is enabled by default; set `CRUISE_ENABLED=false` to turn it off and keep `CRUISE_MAX_ITERATIONS` as the iteration budget.',
    '- Cruise Driver is selected with `sdd cruise --driver <driver>`.',
    '- Cruise orchestrator only routes and bounds iterations; the main agent re-enters `BACKTRACK_TARGET` under that phase\'s gates and write boundaries; the Challenge reviewer remains read-only.',
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
  if (!mode) mode = 'micro';
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
    '- Standard/lite Challenge execution must use auditable independent reviewer evidence (`subagent:<id>`, `external-agent:<id>`, or `human:<name>`); micro may use inline only when roles remain separated.'
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
