const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const visualContract = require('../src/visual-evidence/contract');
const visualRuns = require('../src/visual-verification/run-store');
const verificationRuns = require('../src/verification/run-store');
const fingerprint = require('../src/verification/fingerprint');

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function write(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, value, 'utf8'); }
function visualProvider() {
  return { adapter: 'playwright-visual', workspaceRoot: '.', packageRoot: '.', config: 'playwright.config.js', projects: ['chromium'] };
}

function createFixture() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-boundary-'));
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-checkout-ui.md');
  const contractPath = path.join(projectDir, 'mydocs', 'context', 'checkout-ui', 'visual-evidence.json');
  write(path.join(projectDir, '.gitignore'), '.sdd-verification.json\npackage.json\npackage-lock.json\nplaywright.config.js\nnode_modules/\n');
  write(path.join(projectDir, 'package.json'), '{"name":"fixture","devDependencies":{"@playwright/test":"1.52.0"}}\n');
  write(path.join(projectDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/@playwright/test': { version: '1.52.0' } } }));
  write(path.join(projectDir, 'node_modules', '@playwright', 'test', 'package.json'), '{"version":"1.52.0"}\n');
  write(path.join(projectDir, 'playwright.config.js'), 'module.exports = { projects: [{ name: "chromium" }] };\n');
  write(path.join(projectDir, '.sdd-verification.json'), JSON.stringify({ schemaVersion: 1, providers: { 'web-visual': visualProvider() } }));
  write(path.join(projectDir, 'sdd.visual.config.json'), '{"schemaVersion":1,"scenarios":{}}\n');
  write(path.join(projectDir, 'mydocs', 'context', 'checkout-ui', 'design.png'), 'design');
  write(path.join(projectDir, 'mydocs', 'context', 'checkout-ui', 'baseline.png'), 'baseline');
  write(specPath, ['---', 'task-name: "checkout-ui"', 'context-source: "mydocs/context/checkout-ui"', 'visual-evidence: "required"',
    'visual-evidence-file: "mydocs/context/checkout-ui/visual-evidence.json"', '---'].join('\n'));
  write(contractPath, JSON.stringify({ schemaVersion: 1, mode: 'fidelity', sources: [{ id: 'design', type: 'screenshot', path: 'design.png' }],
    scenarios: [{ id: 'checkout-default', route: '/checkout', state: 'default', viewport: { width: 1, height: 1 }, sourceId: 'design', baseline: { path: 'baseline.png', status: 'approved' } }],
    approval: { approvedBy: 'human:owner', approvedAt: '2026-08-04T00:00:00Z' } }));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', XDG_CONFIG_HOME: path.join(projectDir, '.xdg') };
  fs.mkdirSync(env.XDG_CONFIG_HOME, { recursive: true });
  execFileSync('git', ['init'], { cwd: projectDir, env });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectDir, env });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: projectDir, env });
  execFileSync('git', ['add', '.'], { cwd: projectDir, env });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: projectDir, env });
  return { projectDir, specPath, contractPath, codeState: fingerprint.captureCodeState(projectDir, 'mydocs') };
}

function visualRun(fixture, runId, createdAt, decision) {
  const provider = visualProvider();
  const adapter = require('../src/verification/registry').resolveAdapter('playwright-visual');
  const changedPixels = decision === 'PASS' ? 0 : 1;
  return {
    schemaVersion: 1, runId, createdAt, providerId: 'web-visual', adapterId: 'playwright-visual',
    providerDigest: sha(JSON.stringify(provider)), adapterManifestDigest: sha(JSON.stringify(adapter)), invocationDigest: sha('invocation-' + runId),
    spec: {
      path: 'mydocs/specs/v1.0-checkout-ui.md', specDigest: sha(fs.readFileSync(fixture.specPath)),
      visualContractDigest: sha(fs.readFileSync(fixture.contractPath)), configDigest: sha(fs.readFileSync(path.join(fixture.projectDir, 'sdd.visual.config.json')))
    },
    codeStateBefore: fixture.codeState, codeStateAfter: fixture.codeState,
    workspace: {
      workspaceRoot: '.', packageRoot: '.', resolvedToolVersion: '1.52.0',
      manifestDigest: sha(fs.readFileSync(path.join(fixture.projectDir, 'package.json'))),
      lockfileDigest: sha(fs.readFileSync(path.join(fixture.projectDir, 'package-lock.json'))),
      configDigest: sha(fs.readFileSync(path.join(fixture.projectDir, 'playwright.config.js')))
    },
    targets: { scenarioIds: ['checkout-default'], projects: ['chromium'] },
    status: decision === 'PASS' ? 'passed' : 'failed', freshness: 'fresh', gateDecision: decision,
    process: { status: decision === 'PASS' ? 0 : 1, signal: '' },
    visual: { scenarios: [{
      scenarioId: 'checkout-default', baselineDigest: sha('baseline'), currentDigest: sha('current-' + runId),
      changedPixels, totalPixels: 100, changedRatio: changedPixels / 100, threshold: 0, masks: [], maskedPixels: 0, decision
    }] },
    attachments: [], diagnostics: []
  };
}

function verificationRun() {
  return {
    schemaVersion: 1, runId: 'e2e-1', createdAt: '2026-08-04T00:00:00Z', providerId: 'web-e2e', adapterId: 'playwright-test',
    adapterManifestDigest: sha('adapter'), providerDigest: sha('provider'), invocationDigest: sha('invocation'),
    spec: { path: 'mydocs/specs/v1.0-checkout-ui.md', specDigest: sha('spec'), verificationContractDigest: sha('contract'), planDigest: sha('plan'), designPath: '', designDigest: sha('design'), diffBase: '' },
    codeStateBefore: { aggregateDigest: sha('before') }, codeStateAfter: { aggregateDigest: sha('after') },
    workspace: { workspaceRoot: '.', packageRoot: '.', manifest: 'package.json', lockfile: 'package-lock.json', resolvedToolVersion: '1.52.0', manifestDigest: sha('package'), lockfileDigest: sha('lock'), configDigest: sha('config') },
    environmentDigests: {}, allowedEnvironmentKeys: [], targets: { acIds: ['AC-001'], projects: ['chromium'] },
    status: 'passed', freshness: 'fresh', gateDecision: 'PASS',
    acExecutions: [{ acId: 'AC-001', project: 'chromium', testIds: ['t1'], status: 'passed' }],
    testExecutions: [{ id: 't1', project: 'chromium', acIds: ['AC-001'], status: 'passed', expectedStatus: 'passed', retry: 0, stablePass: true }],
    attachments: [], diagnostics: [], process: { status: 0, signal: '' }
  };
}

test('compatibility projection preserves Visual Run semantics without touching verification Runs', () => {
  const fixture = createFixture();
  verificationRuns.commitRun(fixture.projectDir, 'mydocs', verificationRun(), []);
  const verificationFile = path.join(fixture.projectDir, 'mydocs', 'runs', 'verification', 'e2e-1', 'run.json');
  const verificationBefore = fs.readFileSync(verificationFile, 'utf8');

  assert.equal(visualContract.inspect(fixture.specPath, fixture.projectDir).diffStatus, 'not-run');

  visualRuns.commitVisualRun(fixture.projectDir, 'mydocs', visualRun(fixture, 'visual-fail', '2026-08-04T01:00:00Z', 'FAIL'), []);
  assert.equal(visualContract.inspect(fixture.specPath, fixture.projectDir).diffStatus, 'fail');

  visualRuns.commitVisualRun(fixture.projectDir, 'mydocs', visualRun(fixture, 'visual-pass', '2026-08-04T02:00:00Z', 'PASS'), []);
  assert.equal(visualContract.inspect(fixture.specPath, fixture.projectDir).diffStatus, 'pass');

  write(path.join(fixture.projectDir, 'mydocs', 'context', 'checkout-ui', 'baseline.png'), 'changed baseline');
  const stale = visualContract.inspect(fixture.specPath, fixture.projectDir);
  assert.equal(stale.diffStatus, 'stale');
  assert.deepEqual(stale.diagnostics, [{ code: 'VISUAL_RUN_STALE' }]);

  assert.equal(fs.readFileSync(verificationFile, 'utf8'), verificationBefore);
  assert.ok(fs.existsSync(path.join(fixture.projectDir, 'mydocs', 'runs', 'visual', 'visual-fail', 'run.json')));
  assert.ok(fs.existsSync(path.join(fixture.projectDir, 'mydocs', 'runs', 'visual', 'visual-pass', 'run.json')));
});
