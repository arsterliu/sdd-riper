const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const CLI = path.resolve(__dirname, '..', 'bin', 'cli.js');

function run(projectDir, args) {
  return childProcess.execFileSync(process.execPath, [CLI].concat(args), { cwd: projectDir, encoding: 'utf-8' });
}

function createSpec(projectDir, taskName) {
  run(projectDir, ['init', projectDir, '--mode', 'standard']);
  run(projectDir, ['discover', projectDir, '--task-name', taskName, '--spec-version', 'v1.0', '--requirement', 'test', '--mode', 'standard']);
  return path.join(projectDir, 'mydocs', 'specs', 'v1.0-' + taskName + '.md');
}

function assertCommandRejectsWithoutWriting(projectDir, args, specPath, errorPattern) {
  const before = fs.readFileSync(specPath, 'utf-8');
  assert.throws(function() {
    run(projectDir, args);
  }, errorPattern);
  assert.equal(fs.readFileSync(specPath, 'utf-8'), before);
}

test('三种 Spec 模板包含空的视觉 Context 选择字段', function() {
  ['spec-standard.md', 'spec-lite.md', 'spec-micro.md'].forEach(function(name) {
    const template = fs.readFileSync(path.join(__dirname, '..', 'templates', name), 'utf-8');
    assert.match(template, /^ui-impact: ""$/m);
    assert.match(template, /^visual-context-intent: ""$/m);
  });
});

test('visual select 为前端 Spec 记录 direction 而不启用严格视觉合同', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-select-'));
  const specPath = createSpec(projectDir, 'checkout-ui');

  run(projectDir, ['visual', 'select', projectDir, '--spec', specPath, '--ui-impact', 'yes', '--intent', 'direction']);

  const spec = fs.readFileSync(specPath, 'utf-8');
  assert.match(spec, /^ui-impact: "yes"$/m);
  assert.match(spec, /^visual-context-intent: "direction"$/m);
  assert.match(spec, /^visual-evidence: ""$/m);
  assert.match(spec, /^visual-evidence-file: ""$/m);
  assert.equal(fs.existsSync(path.join(projectDir, 'mydocs', 'context', 'checkout-ui', 'visual-evidence.json')), false);
});

test('visual select 对纯后端任务写入 not-applicable', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-select-'));
  const specPath = createSpec(projectDir, 'api-only');

  run(projectDir, ['visual', 'select', projectDir, '--spec', specPath, '--ui-impact', 'no']);

  const spec = fs.readFileSync(specPath, 'utf-8');
  assert.match(spec, /^ui-impact: "no"$/m);
  assert.match(spec, /^visual-context-intent: "not-applicable"$/m);
});

test('visual select 不允许覆盖已记录的一次性选择', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-select-'));
  const specPath = createSpec(projectDir, 'one-time');
  run(projectDir, ['visual', 'select', projectDir, '--spec', specPath, '--ui-impact', 'yes', '--intent', 'direction']);

  assertCommandRejectsWithoutWriting(projectDir,
    ['visual', 'select', projectDir, '--spec', specPath, '--ui-impact', 'yes', '--intent', 'fidelity'],
    specPath,
    /VISUAL_CONTEXT_ALREADY_SELECTED/);
});

test('visual select 允许纠正非法或矛盾的历史视觉选择', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-select-'));
  const invalidIntentSpec = createSpec(projectDir, 'invalid-intent');
  const conflictingSpec = createSpec(projectDir, 'conflicting-intent');
  fs.writeFileSync(invalidIntentSpec, fs.readFileSync(invalidIntentSpec, 'utf-8')
    .replace(/^ui-impact: ""$/m, 'ui-impact: "yes"')
    .replace(/^visual-context-intent: ""$/m, 'visual-context-intent: "foo"'), 'utf-8');
  fs.writeFileSync(conflictingSpec, fs.readFileSync(conflictingSpec, 'utf-8')
    .replace(/^ui-impact: ""$/m, 'ui-impact: "no"')
    .replace(/^visual-context-intent: ""$/m, 'visual-context-intent: "fidelity"'), 'utf-8');

  run(projectDir, ['visual', 'select', projectDir, '--spec', invalidIntentSpec, '--ui-impact', 'yes', '--intent', 'direction']);
  run(projectDir, ['visual', 'select', projectDir, '--spec', conflictingSpec, '--ui-impact', 'no']);

  assert.match(fs.readFileSync(invalidIntentSpec, 'utf-8'), /^ui-impact: "yes"$/m);
  assert.match(fs.readFileSync(invalidIntentSpec, 'utf-8'), /^visual-context-intent: "direction"$/m);
  assert.match(fs.readFileSync(conflictingSpec, 'utf-8'), /^ui-impact: "no"$/m);
  assert.match(fs.readFileSync(conflictingSpec, 'utf-8'), /^visual-context-intent: "not-applicable"$/m);
  [invalidIntentSpec, conflictingSpec].forEach(function(specPath) {
    const spec = fs.readFileSync(specPath, 'utf-8');
    assert.match(spec, /^visual-evidence: ""$/m);
    assert.match(spec, /^visual-evidence-file: ""$/m);
  });
  assert.equal(fs.existsSync(path.join(projectDir, 'mydocs', 'context', 'invalid-intent', 'visual-evidence.json')), false);
  assert.equal(fs.existsSync(path.join(projectDir, 'mydocs', 'context', 'conflicting-intent', 'visual-evidence.json')), false);
});

test('visual select 拒绝缺少 intent 且不修改 Spec', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-select-'));
  const specPath = createSpec(projectDir, 'invalid-select');

  assertCommandRejectsWithoutWriting(projectDir,
    ['visual', 'select', projectDir, '--spec', specPath, '--ui-impact', 'yes'],
    specPath,
    /--intent must be not-required, direction, or fidelity/);
});

test('visual select 拒绝 archive 目录中的 Spec 且不修改它', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-select-'));
  const specPath = createSpec(projectDir, 'archived-directory');
  const archived = path.join(projectDir, 'mydocs', 'archive', 'v1.0-archived-directory.md');
  fs.mkdirSync(path.dirname(archived), { recursive: true });
  fs.renameSync(specPath, archived);

  assertCommandRejectsWithoutWriting(projectDir,
    ['visual', 'select', projectDir, '--spec', archived, '--ui-impact', 'no'],
    archived,
    /VISUAL_CONTEXT_SPEC_INVALID/);
});

test('visual init 与 select 都拒绝 specs 目录内 status archived 的 Spec 且不修改它', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-select-'));
  const selectSpec = createSpec(projectDir, 'archived-status-select');
  const initSpec = createSpec(projectDir, 'archived-status-init');
  [selectSpec, initSpec].forEach(function(specPath) {
    fs.writeFileSync(specPath, fs.readFileSync(specPath, 'utf-8').replace(/^status: draft.*$/m, 'status: archived'), 'utf-8');
  });

  assertCommandRejectsWithoutWriting(projectDir,
    ['visual', 'select', projectDir, '--spec', selectSpec, '--ui-impact', 'no'],
    selectSpec,
    /VISUAL_CONTEXT_SPEC_INVALID/);
  assertCommandRejectsWithoutWriting(projectDir,
    ['visual', 'init', projectDir, '--spec', initSpec, '--mode', 'direction'],
    initSpec,
    /VISUAL_EVIDENCE_SPEC_INVALID/);
});

test('visual select 拒绝通过符号链接逃逸 active specs 目录的 Spec', function(t) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-select-'));
  createSpec(projectDir, 'linked-select');

  const outside = path.join(projectDir, 'outside.md');
  const linked = path.join(projectDir, 'mydocs', 'specs', 'linked.md');
  fs.writeFileSync(outside, '---\ntask-name: "outside"\n---\n', 'utf-8');
  try { fs.symlinkSync(outside, linked, 'file'); }
  catch (error) { t.skip('当前环境未授予文件符号链接权限'); return; }
  assertCommandRejectsWithoutWriting(projectDir,
    ['visual', 'select', projectDir, '--spec', linked, '--ui-impact', 'no'],
    outside,
    /VISUAL_CONTEXT_SPEC_INVALID/);
});
