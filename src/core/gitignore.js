const fs = require('fs');
const path = require('path');

const START_MARKER = '<!-- sdd-riper:gitignore:start -->';
const END_MARKER = '<!-- sdd-riper:gitignore:end -->';
const FRAMEWORK_RULES = [
  '.sdd-config',
  '.sdd-verification.json',
  '.cursorrules',
  'AGENTS.md',
  'CLAUDE.md',
  '**/.github/copilot-instructions.md',
  '/.claude/',
  '/.codex/',
  '/.agents/'
];

function managedBlock() {
  return [
    START_MARKER,
    '# Local SDD framework configuration (keep files in the workspace, do not commit)',
    ...FRAMEWORK_RULES,
    END_MARKER
  ].join('\n');
}

function ensure(projectDir) {
  const ignoreFile = path.join(projectDir, '.gitignore');
  const existing = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, 'utf8') : '';
  const block = managedBlock();
  const start = existing.indexOf(START_MARKER);
  const end = existing.indexOf(END_MARKER);
  let next;
  if (start !== -1 && end !== -1 && end >= start) {
    next = existing.slice(0, start) + block + existing.slice(end + END_MARKER.length);
  } else {
    const prefix = existing && !existing.endsWith('\n') ? existing + '\n' : existing;
    next = prefix + (prefix ? '\n' : '') + block + '\n';
  }
  if (next !== existing) fs.writeFileSync(ignoreFile, next, 'utf8');
  return { file: ignoreFile, changed: next !== existing };
}

module.exports = { ensure, managedBlock, FRAMEWORK_RULES, START_MARKER, END_MARKER };
