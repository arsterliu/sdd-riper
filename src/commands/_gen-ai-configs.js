const fs = require('fs');
const path = require('path');
const reviewerGuidance = require('../core/reviewer-guidance');
const governanceContract = require('../core/governance-contract');

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
    '- Follow the lifecycle: Research -> Innovate -> Design/Acceptance -> Plan -> Execute* -> Challenge -> (Cruise) -> Learning Check -> Archive.',
    '- When an AC declares `Verification: e2e`, it must also declare `Provider: <provider-id>`.',
    '- Archived and legacy artifacts remain readable without migration; do not silently rewrite historical records.',
    '- Before creating a Spec, ask the user to provide or confirm `version` and `task-name`; do not infer them silently.',
    '- Before creating a Spec, ask whether reference materials / context exist, and bind them with `context-source` when provided.',
    '- Before creating a Spec, if the user has not explicitly selected an autonomy mode, ask them to choose `auto`, `supervised`, or `human`, explain the trade-offs, and recommend `supervised`. The project default is a recommendation and must not be silently chosen for the user. If the user has already explicitly selected a mode, restate it and ask for confirmation without presenting the choice again.',
    '- Do not move past Plan without approval and gate evidence.',
    '- Follow `design-file`, `execute-log-file`, and `learning-file` references from the Spec.',
    '- Follow `context-source` to find raw materials (PRD, UI mockups, prototypes) in `mydocs/context/<task-name>/`.',
    '- For each new Spec, establish `ui-impact` from its exact Profile / `affected-units`, or ask once whether it affects a user interface when unknown. Backend-only Specs select `ui-impact: no` and skip visual guidance; frontend or mixed Specs select `ui-impact: yes` once with `sdd visual select ... --intent not-required|direction|fidelity`.',
    '- Users may put local images, documents, notes, and URL references together in `context-source`; run `sdd visual discover` to report inferred candidates, gaps, and only unresolved questions. A Figma URL is handled like any other URL: discovery records it but does not access the network to read its content. Figma MCP import is a separate future Spec.',
    '- Do not enable strict visual evidence until the user explicitly runs `sdd visual init ... --mode fidelity|direction`. For an approved fidelity contract only, configure the separate `playwright-visual` Provider plus exact project-local `sdd.visual.config.json` bindings, then run `sdd verify visual --spec <spec>`; it accepts no URL, command, selector, threshold, mask, or environment pass-through and never creates, approves, or replaces a baseline. Do not fabricate a visual baseline, approval, browser result, or screenshot diff PASS. Empty Context never blocks `not-required`.',
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
    '- `AUTONOMY_MODE=auto|supervised|human` sets the project default; each active Spec freezes its effective mode and authorization evidence.',
    '- Keep `CRUISE_MAX_ITERATIONS` as the bounded repair budget. Auto and supervised may continue only within fresh authorized scope; human pauses at governance gates.',
    '- Autonomy writes target only the current active Spec and recheck expected digests under `.sdd-autonomy.lock`. Supervised binds the exact Plan digest; auto requires `plan_activation` after Plan approval.',
    '- Never reuse a native loop while `STOP_REASON` is non-empty. Scope, risk, or Plan changes invalidate the matching authorization or activation.',
    '- Cruise Driver is selected with `sdd cruise --driver <driver>`.',
    '- Cruise orchestrator only routes and bounds iterations; the main agent re-enters `BACKTRACK_TARGET` under that phase\'s gates and write boundaries; the Challenge reviewer remains read-only.',
    '- Mode: ' + mode,
    ''
  ].concat(bodyLines || []).concat([BLOCK_END]).join('\n');
}

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : text + '\n';
}

function markerOffsets(text, marker) {
  var offsets = [];
  var offset = text.indexOf(marker);
  while (offset !== -1) {
    offsets.push(offset);
    offset = text.indexOf(marker, offset + marker.length);
  }
  return offsets;
}

function lastGeneratedManagedBlock(existing, starts, ends, block) {
  var candidate = null;
  starts.forEach(function(start) {
    var end = ends.find(function(offset) { return offset > start; });
    var nextStart = starts.find(function(offset) { return offset > start; });
    if (end === undefined || (nextStart !== undefined && nextStart < end)) return;

    var content = existing.slice(start, end + BLOCK_END.length);
    if (content !== block) return;
    candidate = { start: start, end: end + BLOCK_END.length };
  });
  return candidate;
}

function upsertManagedBlock(existing, block) {
  var starts = markerOffsets(existing, BLOCK_START);
  var ends = markerOffsets(existing, BLOCK_END);
  if (starts.length === 1 && ends.length === 1 && starts[0] < ends[0]) {
    var start = starts[0];
    var end = ends[0] + BLOCK_END.length;
    return {
      content: existing.slice(0, start) + block + existing.slice(end),
      action: 'update'
    };
  }
  if (starts.length !== 0 || ends.length !== 0) {
    var previous = lastGeneratedManagedBlock(existing, starts, ends, block);
    if (previous) {
      return {
        content: existing.slice(0, previous.start) + block + existing.slice(previous.end),
        action: 'update'
      };
    }
    return {
      content: ensureTrailingNewline(existing) + '\n' + block + '\n',
      action: 'merge'
    };
  }
  var prefix = ensureTrailingNewline(existing);
  return {
    content: prefix + '\n' + block + '\n',
    action: 'merge'
  };
}

function run(projectDir, mode, force) {
  if (!mode) mode = governanceContract.defaults.mode;
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
