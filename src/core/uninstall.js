const fs = require('fs');
const path = require('path');
const gitignore = require('./gitignore');
const aiConfigs = require('../commands/_gen-ai-configs');

const CONFIG_FILES = ['.sdd-config', '.sdd-verification.json'];
const AI_CONFIG_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  path.join('.github', 'copilot-instructions.md')
];

function removeManagedBlock(file) {
  if (!fs.existsSync(file)) return { changed: false, removed: false, missing: true };
  const existing = fs.readFileSync(file, 'utf8');
  const start = existing.indexOf(aiConfigs.BLOCK_START);
  const end = existing.indexOf(aiConfigs.BLOCK_END);
  if (start === -1 || end === -1 || end < start) return { changed: false, removed: false, missing: false };
  let before = existing.slice(0, start);
  let after = existing.slice(end + aiConfigs.BLOCK_END.length);
  if (before.endsWith('\n\n')) before = before.slice(0, -1);
  if (after.startsWith('\n')) after = after.slice(1);
  const next = before + after;
  if (!next.trim()) {
    fs.unlinkSync(file);
    return { changed: true, removed: true, missing: false };
  }
  if (next !== existing) fs.writeFileSync(file, next, 'utf8');
  return { changed: next !== existing, removed: false, missing: false };
}

function removeEmptyDir(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  if (fs.readdirSync(dir).length !== 0) return false;
  fs.rmdirSync(dir);
  return true;
}

function run(projectDir) {
  const result = { removed: [], updated: [], skipped: [] };
  CONFIG_FILES.forEach(function(relative) {
    const file = path.join(projectDir, relative);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      fs.unlinkSync(file);
      result.removed.push(relative);
    } else {
      result.skipped.push(relative);
    }
  });

  const lock = path.join(projectDir, '.sdd-verification.json.lock');
  if (fs.existsSync(lock)) {
    if (fs.statSync(lock).isDirectory() && fs.readdirSync(lock).length === 0) {
      fs.rmdirSync(lock);
      result.removed.push('.sdd-verification.json.lock');
    } else {
      result.skipped.push('.sdd-verification.json.lock (非空，保留)');
    }
  }

  AI_CONFIG_FILES.forEach(function(relative) {
    const file = path.join(projectDir, relative);
    const state = removeManagedBlock(file);
    if (state.removed) result.removed.push(relative);
    else if (state.changed) result.updated.push(relative);
    else result.skipped.push(relative);
  });

  const ignoreState = gitignore.removeManagedBlock(projectDir);
  if (ignoreState.changed) result.updated.push('.gitignore');
  else result.skipped.push('.gitignore');

  if (removeEmptyDir(path.join(projectDir, '.github'))) result.removed.push('.github/ (空目录)');
  return result;
}

module.exports = { run, _private: { removeManagedBlock, removeEmptyDir } };
