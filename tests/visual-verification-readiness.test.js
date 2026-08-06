const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const visualContract = require('../src/visual-evidence/contract');
const visualRuns = require('../src/visual-verification/run-store');
const fingerprint = require('../src/verification/fingerprint');

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function write(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, value, 'utf8'); }

function visualProvider() {
  return { adapter: 'playwright-visual', workspaceRoot: '.', packageRoot: '.', config: 'playwright.config.js', projects: ['chromium'] };
}

test('visual contract projects the latest matching visual Run without changing e2e readiness semantics', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-readiness-'));
  const specPath = path.join(projectDir, 'mydocs/specs/v1.0-checkout-ui.md');
  const contractPath = path.join(projectDir, 'mydocs/context/checkout-ui/visual-evidence.json');
  write(path.join(projectDir, '.gitignore'), '.sdd-verification.json\npackage.json\npackage-lock.json\nplaywright.config.js\nnode_modules/\n');
  write(path.join(projectDir, 'package.json'), '{"name":"fixture","devDependencies":{"@playwright/test":"1.52.0"}}\n');
  write(path.join(projectDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/@playwright/test': { version: '1.52.0' } } }));
  write(path.join(projectDir, 'node_modules/@playwright/test/package.json'), '{"version":"1.52.0"}\n');
  write(path.join(projectDir, 'playwright.config.js'), 'module.exports = { projects: [{ name: "chromium" }] };\n');
  write(path.join(projectDir, '.sdd-verification.json'), JSON.stringify({ schemaVersion: 1, providers: { 'web-visual': visualProvider() } }));
  write(path.join(projectDir, 'sdd.visual.config.json'), '{"schemaVersion":1,"scenarios":{}}\n');
  write(path.join(projectDir, 'mydocs/context/checkout-ui/design.png'), 'design');
  write(path.join(projectDir, 'mydocs/context/checkout-ui/baseline.png'), 'baseline');
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
  const codeState = fingerprint.captureCodeState(projectDir, 'mydocs');
  const spec = fs.readFileSync(specPath, 'utf8');
  const provider = visualProvider();
  const adapter = require('../src/verification/registry').resolveAdapter('playwright-visual');
  const run = {
    schemaVersion: 1, runId: 'visual-fail', createdAt: '2026-08-04T01:00:00Z', providerId: 'web-visual', adapterId: 'playwright-visual',
    providerDigest: sha(JSON.stringify(provider)), adapterManifestDigest: sha(JSON.stringify(adapter)), invocationDigest: sha('invocation'),
    spec: { path: 'mydocs/specs/v1.0-checkout-ui.md', specDigest: sha(spec), visualContractDigest: sha(fs.readFileSync(contractPath)), configDigest: sha(fs.readFileSync(path.join(projectDir, 'sdd.visual.config.json'))) },
    codeStateBefore: codeState, codeStateAfter: codeState,
    workspace: {
      workspaceRoot: '.', packageRoot: '.', resolvedToolVersion: '1.52.0',
      manifestDigest: sha(fs.readFileSync(path.join(projectDir, 'package.json'))),
      lockfileDigest: sha(fs.readFileSync(path.join(projectDir, 'package-lock.json'))),
      configDigest: sha(fs.readFileSync(path.join(projectDir, 'playwright.config.js')))
    }, targets: { scenarioIds: ['checkout-default'], projects: ['chromium'] },
    status: 'failed', freshness: 'fresh', gateDecision: 'FAIL', process: { status: 1, signal: '' },
    visual: { scenarios: [{ scenarioId: 'checkout-default', baselineDigest: sha('baseline'), currentDigest: sha('current'), changedPixels: 1, totalPixels: 1, changedRatio: 1, threshold: 0, masks: [], maskedPixels: 0, decision: 'FAIL' }] }, attachments: [], diagnostics: []
  };
  visualRuns.commitVisualRun(projectDir, 'mydocs', run, []);

  const result = visualContract.inspect(specPath, projectDir);

  assert.equal(result.state, 'ready');
  assert.equal(result.diffStatus, 'fail');
  assert.deepEqual(result.diagnostics, []);

  write(path.join(projectDir, '.sdd-verification.json'), JSON.stringify({ schemaVersion: 1, providers: {
    'web-visual': { ...visualProvider(), projects: ['firefox'] }
  } }));
  const providerStale = visualContract.inspect(specPath, projectDir);
  assert.equal(providerStale.diffStatus, 'stale');

  write(path.join(projectDir, '.sdd-verification.json'), JSON.stringify({ schemaVersion: 1, providers: { 'web-visual': visualProvider() } }));
  const providerRestored = visualContract.inspect(specPath, projectDir);
  assert.equal(providerRestored.diffStatus, 'fail');

  write(path.join(projectDir, 'playwright.config.js'), 'module.exports = { projects: [{ name: "chromium" }], timeout: 1000 };\n');
  const workspaceStale = visualContract.inspect(specPath, projectDir);
  assert.equal(workspaceStale.diffStatus, 'stale');

  write(path.join(projectDir, 'mydocs/context/checkout-ui/baseline.png'), 'changed baseline');
  const stale = visualContract.inspect(specPath, projectDir);
  assert.equal(stale.diffStatus, 'stale');
  assert.deepEqual(stale.diagnostics, [{ code: 'VISUAL_RUN_STALE' }]);
});
