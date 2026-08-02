const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const validate = require('../src/commands/validate');
const workflow = require('../src/core/workflow');

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

test('普通 validate 与 next 投影已启用但待批准的视觉合同', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-workflow-'));
  const contextDir = path.join(projectDir, 'mydocs', 'context', 'checkout-ui');
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');
  const logPath = path.join(projectDir, 'mydocs', 'logs', 'v1.0-checkout-ui.execute.md');

  write(specPath, [
    '---', 'task-name: "checkout-ui"', 'mode: micro', 'context-source: "mydocs/context/checkout-ui"',
    'visual-evidence: "required"', 'visual-evidence-file: "mydocs/context/checkout-ui/visual-evidence.json"',
    'execute-log-file: "mydocs/logs/v1.0-checkout-ui.execute.md"', '---',
    '## Plan', 'Scope: x', 'Touched Files: x', 'Change: x', 'Impact Scope: x', 'Data Impact: x', 'Interface Impact: x', 'Acceptance: x', 'Verification: x', 'Blast Radius: x',
    'Plan Approved By: agent:fixture', 'Approved At: 2026-07-30T20:00:00Z', 'Gate Evidence: fixture'
  ].join('\n'));
  write(logPath, '## Execute Log\n');
  write(path.join(contextDir, 'visual-evidence.json'), JSON.stringify({
    schemaVersion: 1, mode: 'direction',
    sources: [{ id: 'direction', type: 'direction', reference: '确认前补充' }],
    scenarios: [{ id: 'checkout', route: '/checkout', state: 'default', viewport: { width: 390, height: 844 }, baseline: { path: '', status: 'pending' } }],
    approval: { approvedBy: '', approvedAt: '' }
  }));

  const validation = validate.validateSpec(specPath, { projectDir: projectDir });
  const state = workflow.analyzeSpec(projectDir, specPath);

  assert.ok(validation.issues.some(function(issue) { return issue.indexOf('VISUAL_EVIDENCE_APPROVAL_PENDING') !== -1; }));
  assert.equal(state.visualEvidence.state, 'pending-approval');
  assert.equal(state.visualEvidence.planReadiness, 'blocked');
  assert.equal(state.gates.plan.state, 'blocked');
  assert.ok(state.gates.plan.blockers.some(function(blocker) {
    return blocker.message.indexOf('VISUAL_EVIDENCE_APPROVAL_PENDING') !== -1 && blocker.target === 'Plan';
  }));
});
