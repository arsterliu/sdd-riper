const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const contract = require('../src/visual-evidence/contract');
const { writeText: write } = require('./helpers/test-fs');

function createReadyFidelityContract() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-contract-inspection-'));
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
    sources: [{ id: 'design', type: 'screenshot', path: 'design.png' }],
    scenarios: [{
      id: 'checkout-default', route: '/checkout', state: 'default', viewport: { width: 390, height: 844 },
      sourceId: 'design', baseline: { path: 'baseline.png', status: 'approved' }
    }],
    approval: { approvedBy: 'human:owner', approvedAt: '2026-08-09T00:00:00Z' }
  }));
  return { projectDir, specPath };
}

test('pure Visual Contract inspection exposes only the stable contract projection', () => {
  const fixture = createReadyFidelityContract();

  const result = contract.inspectContract(fixture.specPath, fixture.projectDir);

  assert.deepEqual(result, {
    state: 'ready',
    planReadiness: 'ready',
    baselineStatus: 'approved',
    diffStatus: 'not-run',
    diagnostics: []
  });
  assert.deepEqual(Object.keys(result).sort(), ['baselineStatus', 'diagnostics', 'diffStatus', 'planReadiness', 'state']);
});

test('pure Visual Contract inspection ignores malformed runtime Visual Run evidence', () => {
  const fixture = createReadyFidelityContract();
  write(path.join(fixture.projectDir, 'mydocs', 'runs', 'visual', 'foreign-run', 'run.json'), '{not json');

  const result = contract.inspectContract(fixture.specPath, fixture.projectDir);

  assert.deepEqual(result, {
    state: 'ready',
    planReadiness: 'ready',
    baselineStatus: 'approved',
    diffStatus: 'not-run',
    diagnostics: []
  });
});
