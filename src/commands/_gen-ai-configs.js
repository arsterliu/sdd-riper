const fs = require('fs');
const path = require('path');
const { SCAFFOLD_ROOT } = require('../../lib/common');

function run(projectDir, mode, force) {
  if (!mode) mode = 'standard';
  if (['standard','lite','micro'].indexOf(mode) === -1) {
    console.error('[ERROR] Invalid mode: ' + mode + ' (expected standard|lite|micro)');
    process.exit(3);
  }

  var protocolFile = mode === 'standard'
    ? path.join(SCAFFOLD_ROOT, 'protocols', 'sdd-riper-one.md')
    : path.join(SCAFFOLD_ROOT, 'protocols', 'sdd-riper-one-light.md');

  var protocolExcerpt = '(protocol excerpt unavailable)';
  var protocolExcerpt20 = '(protocol excerpt unavailable)';
  try {
    var lines = fs.readFileSync(protocolFile, 'utf-8').split(/\r?\n/);
    protocolExcerpt = lines.slice(0, 30).join('\n');
    protocolExcerpt20 = lines.slice(0, 20).join('\n');
  } catch (e) {}

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
    '# SDD-RIPER Agent Instructions',
    '',
    '## Core Rules (No Exceptions)',
    '- **No Spec, No Code** - Do not write code unless a task Spec exists.',
    '- **Spec is Control Plane** - Spec owns task gates and references Design / Execute Log artifacts.',
    '- **Design is Separate** - standard/lite write technical design in design-file; Plan cannot replace it.',
    '- **Execute Log is Separate** - record step results and deviations in execute-log-file.',
    '- **Reverse Sync** - sync descriptive facts only; normative requirement/design/plan changes require a human gate.',
    '- **Plan Approved** gate - do not execute until Plan is explicitly approved by a human.',
    '- **Debug Before Retry** - when a step fails, run debug to find root cause before retrying.',
    '',
    '## RIPER Workflow',
    'Follow the SDD-RIPER phases: Research -> Innovate -> Design/Acceptance -> Plan -> Execute -> Review.',
    '',
    '## Context Layers',
    '- **Spec**: Current task control plane (<docs-root>/specs/, defaults to mydocs/specs/).',
    '- **Design**: Technical Design / Design Note referenced by Spec design-file.',
    '- **Execute Log**: Step audit trail referenced by Spec execute-log-file.',
    '- **CodeMap**: Module structure and call chains (<docs-root>/codemap/, defaults to mydocs/codemap/).',
    '- **ProjectMap**: Cross-repo contracts and ownership (<docs-root>/projectmap.md, defaults to mydocs/projectmap.md).',
    '',
    '## Docs Root Configuration',
    'The docs root directory defaults to mydocs/ but can be overridden via .sdd-config (DOCS_DIR=...).',
    '',
    '## Mode: ' + mode,
    '',
    '## Protocol Reference',
    protocolExcerpt
  ].join('\n');
  writeConfig(path.join(projectDir, 'AGENTS.md'), agentsContent);

  var claudeContent = [
    '# Claude Project Instructions - SDD-RIPER',
    '',
    '## Memory',
    '- Always load the latest Spec before starting any task.',
    '- Follow design-file and execute-log-file references when Design or execution facts are needed.',
    '- Track RIPER phase transitions explicitly.',
    '',
    '## Behavior',
    '- NEVER write code without a Spec.',
    '- NEVER proceed past Plan without "Plan Approved By" being filled.',
    '- NEVER use Plan as a substitute for standard/lite Design.',
    '- ALWAYS record deviations from Plan in the Execute Log file referenced by execute-log-file.',
    '- ALWAYS run debug before retrying a failed step.',
    '',
    '## RIPER Phase Gate',
    'Current phase must be explicit. Prohibited: jumping phases silently.',
    '',
    '## Entry Commands',
    '- sdd discover <dir> --task-name <name> --version v1.0 ... = start a new task / Research phase.',
    '- sdd validate <dir> --archive-ready = check Spec, Design, Execute Log, approval, and review gates before archive.',
    '- sdd resume <dir> = resume an existing task / reload context.',
    '',
    '## Docs Root Configuration',
    'The docs root directory defaults to mydocs/ but can be overridden via .sdd-config (DOCS_DIR=...).',
    '',
    '## Mode: ' + mode,
    '',
    '## Protocol Reference',
    protocolExcerpt
  ].join('\n');
  writeConfig(path.join(projectDir, 'CLAUDE.md'), claudeContent);

  var cursorContent = [
    '# SDD-RIPER Rules for Cursor',
    '',
    'RULE: Never write code unless a task Spec exists in <docs-root>/specs/ (defaults to mydocs/specs/).',
    'RULE: SDD-RIPER phases are Research -> Innovate -> Design/Acceptance -> Plan -> Execute -> Review.',
    'RULE: Plan Approved By must be filled before Execute phase.',
    'RULE: Standard/lite Design lives in design-file; Execute Log lives in execute-log-file.',
    'RULE: Run sdd validate <dir> --archive-ready before archive.',
    'RULE: Spec is the control plane; code must match Spec and referenced artifacts.',
    'RULE: Debug before retry - when a step fails, run debug to find root cause first.',
    'RULE: ProjectMap defines cross-repo contracts; always check before touching APIs.',
    'RULE: Docs root defaults to mydocs/ but can be overridden via .sdd-config (DOCS_DIR=...).',
    'RULE: mode=' + mode,
    '',
    '## Protocol Reference',
    protocolExcerpt20
  ].join('\n');
  writeConfig(path.join(projectDir, '.cursorrules'), cursorContent);

  var copilotContent = [
    '# GitHub Copilot Instructions - SDD-RIPER',
    '',
    '## Workflow',
    'Always follow the SDD-RIPER methodology when generating code suggestions.',
    '',
    '## Key Rules',
    '- No Spec, No Code: check <docs-root>/specs/ (defaults to mydocs/specs/) before suggesting code.',
    '- SDD-RIPER phases: Research -> Innovate -> Design/Acceptance -> Plan -> Execute -> Review.',
    '- Design and Execute Log are separate artifacts referenced by design-file and execute-log-file.',
    '- Plan Approved gate: do not suggest implementation code until Plan is approved.',
    '- Archive gate: run sdd validate <dir> --archive-ready before archive.',
    '- Debug before retry: when code fails, run debug to find root cause before retrying.',
    '- ProjectMap: cross-repo interfaces are documented in <docs-root>/projectmap.md (defaults to mydocs/projectmap.md).',
    '',
    '## Docs Root Configuration',
    'The docs root directory defaults to mydocs/ but can be overridden via .sdd-config (DOCS_DIR=...).',
    '',
    '## Mode: ' + mode,
    '',
    '## Protocol Reference',
    protocolExcerpt20
  ].join('\n');
  writeConfig(path.join(projectDir, '.github', 'copilot-instructions.md'), copilotContent);

  return { created: created, skipped: skipped };
}

module.exports = { run: run };
