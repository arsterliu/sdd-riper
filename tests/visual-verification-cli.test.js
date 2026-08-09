const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { runCli } = require('./helpers/sdd-fixtures');
const { writeText: write } = require('./helpers/test-fs');

function spec(projectDir) {
  return [
    '---',
    'task-name: "checkout-ui"',
    'mode: micro',
    'status: draft',
    'context-source: "mydocs/context/checkout-ui"',
    'visual-evidence: "required"',
    'visual-evidence-file: "mydocs/context/checkout-ui/visual-evidence.json"',
    '---',
    '## Plan',
    'Scope: fixture', 'Touched Files: fixture', 'Change: fixture', 'Impact Scope: fixture', 'Data Impact: fixture',
    'Interface Impact: fixture', 'Acceptance: fixture', 'Verification: fixture', 'Blast Radius: fixture',
    'Plan Approved By: agent:fixture', 'Approved At: 2026-08-04T00:00:00Z', 'Gate Evidence: fixture',
    ''
  ].join('\n');
}

function contract(mode) {
  const fidelity = mode === 'fidelity';
  return {
    schemaVersion: 1,
    mode,
    sources: [{ id: 'design', type: 'screenshot', path: fidelity ? 'design.png' : undefined, reference: fidelity ? undefined : 'direction note' }],
    scenarios: [{
      id: 'checkout-default', route: '/checkout', state: 'default', viewport: { width: 390, height: 844 },
      ...(fidelity ? { sourceId: 'design', baseline: { path: 'baseline.png', status: 'approved' } } : { baseline: { path: '', status: 'pending' } })
    }],
    approval: { approvedBy: 'human:design-owner', approvedAt: '2026-08-04T00:00:00Z' }
  };
}

test('verify visual treats direction contracts as not applicable and never creates a visual Run', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-cli-'));
  const specPath = path.join(projectDir, 'mydocs/specs/v1.0-checkout-ui.md');
  write(specPath, spec(projectDir));
  write(path.join(projectDir, 'mydocs/context/checkout-ui/visual-evidence.json'), JSON.stringify(contract('direction'), null, 2));

  const result = runCli(['verify', 'visual', projectDir, '--spec', specPath], projectDir);

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /state=not-applicable/);
  assert.equal(fs.existsSync(path.join(projectDir, 'mydocs/runs/visual')), false);
});

test('verify visual fails closed before browser execution when a fidelity contract has no configured visual provider', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-cli-'));
  const specPath = path.join(projectDir, 'mydocs/specs/v1.0-checkout-ui.md');
  write(specPath, spec(projectDir));
  write(path.join(projectDir, 'mydocs/context/checkout-ui/design.png'), 'design');
  write(path.join(projectDir, 'mydocs/context/checkout-ui/baseline.png'), 'baseline');
  write(path.join(projectDir, 'mydocs/context/checkout-ui/visual-evidence.json'), JSON.stringify(contract('fidelity'), null, 2));

  const result = runCli(['verify', 'visual', projectDir, '--spec', specPath], projectDir);

  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /SDD_VERIFY_VISUAL_PROVIDER_NOT_CONFIGURED/);
  assert.equal(fs.existsSync(path.join(projectDir, 'mydocs/runs/visual')), false);
});

test('verify init permits the dedicated visual adapter while preserving the controlled workspace contract', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-cli-'));
  write(path.join(projectDir, 'package.json'), JSON.stringify({ devDependencies: { '@playwright/test': '1.52.0' } }));
  write(path.join(projectDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/@playwright/test': { version: '1.52.0' } } }));
  write(path.join(projectDir, 'node_modules/@playwright/test/package.json'), JSON.stringify({ version: '1.52.0' }));
  write(path.join(projectDir, 'playwright.config.js'), 'module.exports = {};\n');

  const result = runCli(['verify', 'init', projectDir, '--provider', 'web-visual', '--adapter', 'playwright-visual',
    '--workspace-root', '.', '--package-root', '.', '--config', 'playwright.config.js', '--project', 'chromium'], projectDir);

  assert.equal(result.status, 0, result.output);
  const config = JSON.parse(fs.readFileSync(path.join(projectDir, '.sdd-verification.json'), 'utf8'));
  assert.equal(config.providers['web-visual'].adapter, 'playwright-visual');
});
