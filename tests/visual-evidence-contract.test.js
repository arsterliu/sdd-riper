const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const contract = require('../src/visual-evidence/contract');
const { writeText: write } = require('./helpers/test-fs');

test('direction 模式在方向已批准且首版基线待补齐时允许进入 Plan', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-contract-'));
  const contextDir = path.join(projectDir, 'mydocs', 'context', 'checkout-ui');
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');
  const manifestPath = path.join(contextDir, 'visual-evidence.json');

  write(specPath, [
    '---',
    'task-name: "checkout-ui"',
    'context-source: "mydocs/context/checkout-ui"',
    'visual-evidence: "required"',
    'visual-evidence-file: "mydocs/context/checkout-ui/visual-evidence.json"',
    '---'
  ].join('\n'));
  write(manifestPath, JSON.stringify({
    schemaVersion: 1,
    mode: 'direction',
    sources: [{ id: 'approved-direction', type: 'direction', reference: '结算表单优先展示总价与提交操作' }],
    scenarios: [{
      id: 'checkout-default', route: '/checkout', state: 'default', viewport: { width: 390, height: 844 },
      baseline: { path: '', status: 'pending' }
    }],
    approval: { approvedBy: 'human:product-owner', approvedAt: '2026-07-30T20:00:00Z' }
  }, null, 2));

  const result = contract.inspect(specPath, projectDir);

  assert.equal(result.state, 'ready');
  assert.equal(result.planReadiness, 'ready');
  assert.equal(result.baselineStatus, 'pending');
  assert.equal(result.diffStatus, 'not-run');
});

test('拒绝位于任务 Context 外的视觉清单', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-contract-'));
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');
  const outsideManifest = path.join(projectDir, 'mydocs', 'context', 'other-task', 'visual-evidence.json');

  write(specPath, [
    '---',
    'task-name: "checkout-ui"',
    'context-source: "mydocs/context/checkout-ui"',
    'visual-evidence: "required"',
    'visual-evidence-file: "mydocs/context/other-task/visual-evidence.json"',
    '---'
  ].join('\n'));
  write(outsideManifest, JSON.stringify({
    schemaVersion: 1,
    mode: 'direction',
    sources: [{ id: 'approved-direction', type: 'direction', reference: '结算表单优先展示总价与提交操作' }],
    scenarios: [{ id: 'checkout-default', route: '/checkout', state: 'default', viewport: { width: 390, height: 844 }, baseline: { path: '', status: 'pending' } }],
    approval: { approvedBy: 'human:product-owner', approvedAt: '2026-07-30T20:00:00Z' }
  }, null, 2));

  const result = contract.inspect(specPath, projectDir);

  assert.equal(result.state, 'blocked');
  assert.deepEqual(result.diagnostics, [{ code: 'VISUAL_EVIDENCE_PATH_OUTSIDE_CONTEXT' }]);
});

test('fidelity 模式在来源与基线均已批准时报告为 ready', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-contract-'));
  const contextDir = path.join(projectDir, 'mydocs', 'context', 'checkout-ui');
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');

  write(path.join(contextDir, 'design.png'), 'design');
  write(path.join(contextDir, 'baseline.png'), 'baseline');
  write(specPath, [
    '---',
    'task-name: "checkout-ui"',
    'context-source: "mydocs/context/checkout-ui"',
    'visual-evidence: "required"',
    'visual-evidence-file: "mydocs/context/checkout-ui/visual-evidence.json"',
    '---'
  ].join('\n'));
  write(path.join(contextDir, 'visual-evidence.json'), JSON.stringify({
    schemaVersion: 1,
    mode: 'fidelity',
    sources: [{ id: 'design-export', type: 'screenshot', path: 'design.png' }],
    scenarios: [{
      id: 'checkout-default', route: '/checkout', state: 'default', viewport: { width: 1440, height: 900 }, sourceId: 'design-export',
      baseline: { path: 'baseline.png', status: 'approved' }
    }],
    approval: { approvedBy: 'human:design-owner', approvedAt: '2026-07-30T20:00:00Z' }
  }, null, 2));

  const result = contract.inspect(specPath, projectDir);

  assert.equal(result.state, 'ready');
  assert.equal(result.planReadiness, 'ready');
  assert.equal(result.baselineStatus, 'approved');
  assert.equal(result.diffStatus, 'not-run');
});

test('拒绝借由 Context 内符号链接逃逸的视觉清单', function(t) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-contract-'));
  const contextDir = path.join(projectDir, 'mydocs', 'context', 'checkout-ui');
  const outsideDir = path.join(projectDir, 'outside');
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');

  write(specPath, [
    '---', 'task-name: "checkout-ui"', 'context-source: "mydocs/context/checkout-ui"',
    'visual-evidence: "required"', 'visual-evidence-file: "mydocs/context/checkout-ui/linked/visual-evidence.json"', '---'
  ].join('\n'));
  write(path.join(outsideDir, 'visual-evidence.json'), JSON.stringify({
    schemaVersion: 1, mode: 'direction', sources: [{ id: 'direction', type: 'direction', reference: 'x' }],
    scenarios: [{ id: 'checkout', route: '/checkout', state: 'default', viewport: { width: 390, height: 844 }, baseline: { path: '', status: 'pending' } }],
    approval: { approvedBy: 'human:owner', approvedAt: '2026-07-30T20:00:00Z' }
  }));
  fs.mkdirSync(contextDir, { recursive: true });
  try { fs.symlinkSync(outsideDir, path.join(contextDir, 'linked'), 'junction'); }
  catch (error) { t.skip('当前 Windows 未授予目录 symlink 权限'); return; }

  const result = contract.inspect(specPath, projectDir);

  assert.equal(result.state, 'blocked');
  assert.deepEqual(result.diagnostics, [{ code: 'VISUAL_EVIDENCE_PATH_OUTSIDE_CONTEXT' }]);
});

test('拒绝缺少场景 route、state 或有效视口的 direction 清单', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-contract-'));
  const contextDir = path.join(projectDir, 'mydocs', 'context', 'checkout-ui');
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');
  write(specPath, '---\ntask-name: "checkout-ui"\ncontext-source: "mydocs/context/checkout-ui"\nvisual-evidence: "required"\nvisual-evidence-file: "mydocs/context/checkout-ui/visual-evidence.json"\n---');
  write(path.join(contextDir, 'visual-evidence.json'), JSON.stringify({ schemaVersion: 1, mode: 'direction', sources: [{ id: 'd', type: 'direction', reference: 'x' }], scenarios: [{ id: 's', route: '', state: '', viewport: { width: 0, height: 0 }, baseline: { path: '', status: 'pending' } }], approval: { approvedBy: 'human:owner', approvedAt: '2026-07-30T20:00:00Z' } }));
  assert.equal(contract.inspect(specPath, projectDir).state, 'blocked');
});

test('拒绝形状正确但不可解析的视觉合同批准时间', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-contract-'));
  const contextDir = path.join(projectDir, 'mydocs', 'context', 'checkout-ui');
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');
  write(specPath, '---\ntask-name: "checkout-ui"\ncontext-source: "mydocs/context/checkout-ui"\nvisual-evidence: "required"\nvisual-evidence-file: "mydocs/context/checkout-ui/visual-evidence.json"\n---');
  write(path.join(contextDir, 'visual-evidence.json'), JSON.stringify({ schemaVersion: 1, mode: 'direction', sources: [{ id: 'd', type: 'direction', reference: 'x' }], scenarios: [{ id: 's', route: '/checkout', state: 'default', viewport: { width: 390, height: 844 }, baseline: { path: '', status: 'pending' } }], approval: { approvedBy: 'human:owner', approvedAt: '2026-02-30T20:00:00Z' } }));

  const result = contract.inspect(specPath, projectDir);

  assert.equal(result.state, 'pending-approval');
  assert.deepEqual(result.diagnostics, [{ code: 'VISUAL_EVIDENCE_APPROVAL_PENDING' }]);
});

test('拒绝 direction 模式中位于 Context 外的已批准基线', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-contract-'));
  const contextDir = path.join(projectDir, 'mydocs', 'context', 'checkout-ui');
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');
  write(path.join(projectDir, 'mydocs', 'context', 'outside.png'), 'outside');
  write(specPath, '---\ntask-name: "checkout-ui"\ncontext-source: "mydocs/context/checkout-ui"\nvisual-evidence: "required"\nvisual-evidence-file: "mydocs/context/checkout-ui/visual-evidence.json"\n---');
  write(path.join(contextDir, 'visual-evidence.json'), JSON.stringify({ schemaVersion: 1, mode: 'direction', sources: [{ id: 'd', type: 'direction', reference: 'x' }], scenarios: [{ id: 's', route: '/checkout', state: 'default', viewport: { width: 390, height: 844 }, baseline: { path: '../outside.png', status: 'approved' } }], approval: { approvedBy: 'human:owner', approvedAt: '2026-07-30T20:00:00Z' } }));

  assert.equal(contract.inspect(specPath, projectDir).state, 'blocked');
});

test('拒绝 direction 模式中借由 Context 内链接逃逸的已批准基线', function(t) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-contract-'));
  const contextDir = path.join(projectDir, 'mydocs', 'context', 'checkout-ui');
  const outsideDir = path.join(projectDir, 'outside');
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');
  write(path.join(outsideDir, 'baseline.png'), 'outside');
  write(specPath, '---\ntask-name: "checkout-ui"\ncontext-source: "mydocs/context/checkout-ui"\nvisual-evidence: "required"\nvisual-evidence-file: "mydocs/context/checkout-ui/visual-evidence.json"\n---');
  fs.mkdirSync(contextDir, { recursive: true });
  try { fs.symlinkSync(outsideDir, path.join(contextDir, 'linked'), 'junction'); }
  catch (error) { t.skip('当前 Windows 未授予目录链接权限'); return; }
  write(path.join(contextDir, 'visual-evidence.json'), JSON.stringify({ schemaVersion: 1, mode: 'direction', sources: [{ id: 'd', type: 'direction', reference: 'x' }], scenarios: [{ id: 's', route: '/checkout', state: 'default', viewport: { width: 390, height: 844 }, baseline: { path: 'linked/baseline.png', status: 'approved' } }], approval: { approvedBy: 'human:owner', approvedAt: '2026-07-30T20:00:00Z' } }));

  assert.equal(contract.inspect(specPath, projectDir).state, 'blocked');
});

test('拒绝 direction 模式中未知的基线状态', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-contract-'));
  const contextDir = path.join(projectDir, 'mydocs', 'context', 'checkout-ui');
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');
  write(specPath, '---\ntask-name: "checkout-ui"\ncontext-source: "mydocs/context/checkout-ui"\nvisual-evidence: "required"\nvisual-evidence-file: "mydocs/context/checkout-ui/visual-evidence.json"\n---');
  write(path.join(contextDir, 'visual-evidence.json'), JSON.stringify({ schemaVersion: 1, mode: 'direction', sources: [{ id: 'd', type: 'direction', reference: 'x' }], scenarios: [{ id: 's', route: '/checkout', state: 'default', viewport: { width: 390, height: 844 }, baseline: { path: '', status: 'draft' } }], approval: { approvedBy: 'human:owner', approvedAt: '2026-07-30T20:00:00Z' } }));

  assert.equal(contract.inspect(specPath, projectDir).state, 'blocked');
});
