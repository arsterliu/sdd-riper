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

function removeManagedBlock(projectDir) {
  const ignoreFile = path.join(projectDir, '.gitignore');
  if (!fs.existsSync(ignoreFile)) return { file: ignoreFile, changed: false, missing: true };
  const existing = fs.readFileSync(ignoreFile, 'utf8');
  const start = existing.indexOf(START_MARKER);
  const end = existing.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) return { file: ignoreFile, changed: false, missing: false };
  let before = existing.slice(0, start);
  let after = existing.slice(end + END_MARKER.length);
  if (before.endsWith('\n\n')) before = before.slice(0, -1);
  if (after.startsWith('\n')) after = after.slice(1);
  const next = before + after;
  if (next !== existing) fs.writeFileSync(ignoreFile, next, 'utf8');
  return { file: ignoreFile, changed: next !== existing, missing: false };
}

module.exports = { ensure, removeManagedBlock, managedBlock, FRAMEWORK_RULES, START_MARKER, END_MARKER };
