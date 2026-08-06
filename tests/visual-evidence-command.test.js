const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const CLI = path.resolve(__dirname, '..', 'bin', 'cli.js');
const visual = require('../src/commands/visual');

function run(projectDir, args) {
  return childProcess.execFileSync(process.execPath, [CLI].concat(args), { cwd: projectDir, encoding: 'utf-8' });
}

function runResult(projectDir, args) {
  return childProcess.spawnSync(process.execPath, [CLI].concat(args), { cwd: projectDir, encoding: 'utf-8' });
}

function treeSnapshot(root) {
  const snapshot = {};
  function visit(directory) {
    fs.readdirSync(directory, { withFileTypes: true }).sort(function(a, b) { return a.name.localeCompare(b.name); }).forEach(function(entry) {
      const entryPath = path.join(directory, entry.name);
      const relative = path.relative(root, entryPath).split(path.sep).join('/');
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile()) snapshot[relative] = fs.readFileSync(entryPath, 'utf-8');
    });
  }
  visit(root);
  return snapshot;
}

test('visual init 为指定活动 Spec 创建 direction 清单并写入 opt-in 引用', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-command-'));
  run(projectDir, ['init', projectDir, '--mode', 'standard']);
  run(projectDir, ['discover', projectDir, '--task-name', 'checkout-ui', '--spec-version', 'v1.0', '--requirement', 'checkout', '--context', 'mydocs/context/checkout-ui', '--mode', 'standard']);
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');

  const output = run(projectDir, ['visual', 'init', projectDir, '--spec', specPath, '--mode', 'direction']);
  const spec = fs.readFileSync(specPath, 'utf-8');
  const manifestPath = path.join(projectDir, 'mydocs', 'context', 'checkout-ui', 'visual-evidence.json');

  assert.match(output, /VISUAL_EVIDENCE_STATE: pending-approval/);
  assert.match(spec, /^context-source: "mydocs\/context\/checkout-ui"$/m);
  assert.match(spec, /^visual-evidence: "required"$/m);
  assert.match(spec, /^visual-evidence-file: "mydocs\/context\/checkout-ui\/visual-evidence.json"$/m);
  assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).mode, 'direction');
});

test('visual init 拒绝通过符号链接逃逸 active specs 目录的 Spec', function(t) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-command-'));
  const specsDir = path.join(projectDir, 'mydocs', 'specs');
  const outsideSpec = path.join(projectDir, 'outside', 'checkout.md');
  const linkedSpec = path.join(specsDir, 'linked-checkout.md');
  fs.mkdirSync(path.dirname(outsideSpec), { recursive: true });
  fs.mkdirSync(specsDir, { recursive: true });
  fs.writeFileSync(outsideSpec, '---\ntask-name: "checkout-ui"\ncontext-source: "mydocs/context/checkout-ui"\n---\n', 'utf-8');
  try { fs.symlinkSync(outsideSpec, linkedSpec, 'file'); }
  catch (error) { t.skip('当前环境未授予文件符号链接权限'); return; }

  assert.throws(function() {
    visual.init(projectDir, { spec: linkedSpec, mode: 'direction' });
  }, /VISUAL_EVIDENCE_SPEC_INVALID/);
});

test('visual discover 对已选择 direction 的活动 Spec 输出稳定分区且不写入任何制品', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-command-'));
  run(projectDir, ['init', projectDir, '--mode', 'standard']);
  run(projectDir, ['discover', projectDir, '--task-name', 'checkout-ui', '--spec-version', 'v1.0', '--requirement', 'checkout', '--context', 'mydocs/context/checkout-ui', '--mode', 'standard']);
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');
  const contextDir = path.join(projectDir, 'mydocs', 'context', 'checkout-ui');
  fs.mkdirSync(contextDir, { recursive: true });
  fs.writeFileSync(path.join(contextDir, 'checkout-desktop.png'), 'image', 'utf-8');
  fs.writeFileSync(path.join(contextDir, 'notes.md'), 'Reference: https://www.figma.com/file/example/Checkout', 'utf-8');
  fs.writeFileSync(path.join(contextDir, 'unknown.bin'), 'unknown', 'utf-8');
  run(projectDir, ['visual', 'select', projectDir, '--spec', specPath, '--ui-impact', 'yes', '--intent', 'direction']);
  const before = treeSnapshot(projectDir);

  const output = run(projectDir, ['visual', 'discover', projectDir, '--spec', specPath]);

  assert.match(output, /^MATERIAL: checkout-desktop\.png \[image\]$/m);
  assert.match(output, /^CANDIDATE: scenario-hint checkout-desktop\.png desktop \[low\]$/m);
  assert.match(output, /^CANDIDATE: reference notes\.md https:\/\/www\.figma\.com\/file\/example\/Checkout \[low\]$/m);
  assert.match(output, /^GAP: VISUAL_CONTEXT_MAPPING_REQUIRED$/m);
  assert.match(output, /^QUESTION: VISUAL_CONTEXT_MATERIAL_UNCLASSIFIED unknown\.bin$/m);
  assert.match(output, /^DIAGNOSTIC: none$/m);
  assert.deepEqual(treeSnapshot(projectDir), before);
  assert.equal(fs.existsSync(path.join(contextDir, 'visual-evidence.json')), false);
});

test('visual discover 对空 Context 和非活动 Spec 返回可预测结果', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-command-'));
  run(projectDir, ['init', projectDir, '--mode', 'standard']);
  run(projectDir, ['discover', projectDir, '--task-name', 'empty-ui', '--spec-version', 'v1.0', '--requirement', 'empty', '--context', 'mydocs/context/empty-ui', '--mode', 'standard']);
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-empty-ui.md');
  fs.mkdirSync(path.join(projectDir, 'mydocs', 'context', 'empty-ui'), { recursive: true });

  const emptyOutput = run(projectDir, ['visual', 'discover', projectDir, '--spec', specPath]);
  assert.match(emptyOutput, /^MATERIAL: none$/m);
  assert.match(emptyOutput, /^GAP: VISUAL_CONTEXT_EMPTY$/m);
  assert.match(emptyOutput, /^QUESTION: VISUAL_CONTEXT_MATERIALS_NEEDED$/m);

  const archived = fs.readFileSync(specPath, 'utf-8').replace(/^status: draft/m, 'status: archived');
  fs.writeFileSync(specPath, archived, 'utf-8');
  const result = runResult(projectDir, ['visual', 'discover', projectDir, '--spec', specPath]);
  assert.equal(result.status, 3);
  assert.match(result.stderr.toString('utf-8'), /VISUAL_CONTEXT_SPEC_INVALID/);
});
