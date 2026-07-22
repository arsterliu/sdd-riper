const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { commitRun } = require('../src/verification/run-store');
const gateway = require('../src/verification/process-gateway');

function root() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-run-store-')); }

function run(id) {
  return { schemaVersion: 1, runId: id, createdAt: new Date().toISOString(), providerId: 'web-e2e',
    adapterId: 'playwright-test', adapterManifestDigest: 'a'.repeat(64), providerDigest: 'b'.repeat(64),
    spec: { path: 'spec.md', specDigest: 'c'.repeat(64), verificationContractDigest: 'd'.repeat(64),
      planDigest: 'e'.repeat(64), designPath: '', designDigest: '5'.repeat(64), diffBase: '' },
    codeStateBefore: { aggregateDigest: 'f'.repeat(64) }, codeStateAfter: { aggregateDigest: 'f'.repeat(64) },
    workspace: { workspaceRoot: '.', packageRoot: '.', manifest: 'package.json', lockfile: 'package-lock.json',
      resolvedToolVersion: '1.52.0', manifestDigest: '1'.repeat(64), lockfileDigest: '2'.repeat(64), configDigest: '3'.repeat(64) },
    invocationDigest: '4'.repeat(64), environmentDigests: { PATH: '6'.repeat(64) },
    allowedEnvironmentKeys: [], targets: { acIds: ['AC-001'], projects: ['chromium'] },
    status: 'passed', freshness: 'fresh', gateDecision: 'PASS',
    acExecutions: [{ acId: 'AC-001', project: 'chromium', testIds: ['t1'], status: 'passed' }],
    testExecutions: [{ id: 't1', project: 'chromium', acIds: ['AC-001'], status: 'passed',
      expectedStatus: 'passed', retry: 0, stablePass: true }],
    attachments: [], diagnostics: [], process: { status: 0, signal: '' } };
}

test('atomically commits an immutable run and refuses collisions', () => {
  const project = root();
  const result = commitRun(project, 'mydocs', run('run-1'), []);
  assert.ok(fs.existsSync(path.join(result.runDir, 'run.json')));
  assert.throws(() => commitRun(project, 'mydocs', run('run-1'), []), e => e.code === 'RUN_ALREADY_EXISTS');
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.runDir, 'run.json'))).gateDecision, 'PASS');
});

test('copies content-addressed attachments and rejects path escape', () => {
  const project = root();
  const source = path.join(project, 'trace.zip');
  fs.writeFileSync(source, 'trace');
  const value = run('run-2');
  const result = commitRun(project, 'mydocs', value, [{ source, name: 'trace.zip', mediaType: 'application/zip' }]);
  const stored = JSON.parse(fs.readFileSync(path.join(result.runDir, 'run.json')));
  assert.equal(stored.attachments[0].size, 5);
  assert.match(stored.attachments[0].sha256, /^[a-f0-9]{64}$/);
  assert.throws(() => commitRun(project, 'mydocs', run('run-3'), [{ source: path.join(project, '../escape'), name: 'x' }]),
    e => e.code === 'PATH_ESCAPE');
});

test('rejects attachments outside the Provider workspaceRoot even when still inside the repository', () => {
  const project = root();
  fs.mkdirSync(path.join(project, 'apps/web'), { recursive: true });
  const outsideWorkspace = path.join(project, '.env');
  fs.writeFileSync(outsideWorkspace, 'secret');
  const value = run('workspace-escape');
  value.workspace.workspaceRoot = 'apps/web';
  assert.throws(() => commitRun(project, 'mydocs', value,
    [{ source: outsideWorkspace, name: '.env', mediaType: 'text/plain' }]), e => e.code === 'PATH_ESCAPE');
  assert.equal(fs.existsSync(path.join(project, 'mydocs/runs/verification/workspace-escape')), false);
});

test('safe gateway fixes executable, reporter and shell boundary', () => {
  const invocation = gateway.buildInvocation({ packageRoot: 'C:/repo/apps/web', toolPackage: 'C:/repo/node_modules/@playwright/test/package.json' },
    { config: 'apps/web/playwright.config.ts', projects: ['chromium'] }, 'C:/sdd/reporter.js', 'C:/tmp/events.jsonl', 'nonce');
  assert.equal(invocation.executable, process.execPath);
  assert.equal(invocation.shell, false);
  assert.ok(invocation.args.includes('--reporter=C:/sdd/reporter.js'));
  assert.equal(invocation.env.SDD_VERIFICATION_NONCE, 'nonce');
  assert.equal(invocation.env.PATH, process.env.PATH);
});

test('rejects a malformed Run before creating any immutable directory', () => {
  const project = root();
  const malformed = run('bad-run');
  malformed.gateDecision = 'MAYBE';
  assert.throws(() => commitRun(project, 'mydocs', malformed, []), e => e.code === 'RUN_SCHEMA_INVALID');
  assert.equal(fs.existsSync(path.join(project, 'mydocs/runs/verification/bad-run')), false);
  const incomplete = run('incomplete-run');
  delete incomplete.spec;
  assert.throws(() => commitRun(project, 'mydocs', incomplete, []), e => e.code === 'RUN_SCHEMA_INVALID');
  const emptyPass = run('empty-pass');
  emptyPass.acExecutions = [];
  emptyPass.testExecutions = [];
  assert.throws(() => commitRun(project, 'mydocs', emptyPass, []), e => e.code === 'RUN_SCHEMA_INVALID');
  const fakeMapping = run('fake-mapping');
  fakeMapping.acExecutions[0].testIds = ['missing'];
  assert.throws(() => commitRun(project, 'mydocs', fakeMapping, []), e => e.code === 'RUN_SCHEMA_INVALID');
  const fakeStable = run('fake-stable');
  fakeStable.testExecutions[0].status = 'failed';
  fakeStable.testExecutions[0].expectedStatus = 'passed';
  fakeStable.testExecutions[0].retry = 0;
  assert.throws(() => commitRun(project, 'mydocs', fakeStable, []), e => e.code === 'RUN_SCHEMA_INVALID');
  const incompleteProduct = run('incomplete-product');
  incompleteProduct.targets.projects.push('firefox');
  assert.throws(() => commitRun(project, 'mydocs', incompleteProduct, []), e => e.code === 'RUN_SCHEMA_INVALID');
});
