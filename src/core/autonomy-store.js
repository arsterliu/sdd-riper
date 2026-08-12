const fs = require('fs');
const path = require('path');
const common = require('../../lib/common');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function activeSpec(projectDir, requested) {
  const root = path.resolve(projectDir);
  const specsDir = path.resolve(common.getDocsRoot(root), 'specs');
  const file = path.resolve(root, requested || '');
  const relative = path.relative(specsDir, file);
  if (!requested || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file)) {
    fail('SDD_AUTONOMY_SPEC_NOT_ACTIVE', 'autonomy writes require the current active Spec');
  }
  const latest = common.findLatestSpec(specsDir);
  if (!latest || path.resolve(latest) !== file || common.getFrontmatterField(file, 'status') === 'archived') {
    fail('SDD_AUTONOMY_SPEC_NOT_ACTIVE', 'autonomy writes require the current active Spec');
  }
  return file;
}

function atomicWrite(file, content) {
  const temp = file + '.autonomy-' + process.pid + '-' + Date.now() + '.tmp';
  fs.writeFileSync(temp, content, 'utf-8');
  try { fs.renameSync(temp, file); }
  catch (error) { try { fs.rmSync(temp, { force: true }); } catch (_) {} throw error; }
}

function update(projectDir, requested, mutate) {
  const root = path.resolve(projectDir);
  const lock = path.join(root, '.sdd-autonomy.lock');
  let held = false;
  try {
    try { fs.mkdirSync(lock); held = true; }
    catch (error) {
      if (error.code === 'EEXIST') fail('SDD_AUTONOMY_LOCKED', 'another autonomy write is in progress');
      throw error;
    }
    const file = activeSpec(root, requested);
    const content = fs.readFileSync(file, 'utf-8');
    const next = mutate(content, file);
    if (typeof next === 'string' && next !== content) atomicWrite(file, next);
    return { file, content, next };
  } finally {
    if (held) fs.rmdirSync(lock);
  }
}

module.exports = { activeSpec, update };
