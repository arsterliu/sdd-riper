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

test('visual init 为指定活动 Spec 创建 direction 清单并写入 opt-in 引用', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-command-'));
  run(projectDir, ['init', projectDir, '--mode', 'standard']);
  run(projectDir, ['discover', projectDir, '--task-name', 'checkout-ui', '--spec-version', 'v1.0', '--requirement', 'checkout', '--mode', 'standard']);
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
