'use strict';

var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var OWNER_FILE = '.sdd-console-e2e-owner.json';

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}
function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: Object.assign({}, process.env, {
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    XDG_CONFIG_HOME: path.join(root, '.git', 'sdd-empty-xdg')
  }) });
}

function ownedProject(state) {
  if (!state || !state.projectDir || !state.token || !fs.existsSync(state.projectDir)) return false;
  var tempRoot = fs.realpathSync(os.tmpdir());
  var projectRoot;
  try { projectRoot = fs.realpathSync(state.projectDir); } catch (_) { return false; }
  var relative = path.relative(tempRoot, projectRoot);
  if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) ||
      path.basename(projectRoot).indexOf('sdd-console-e2e-') !== 0) return false;
  var marker = path.join(projectRoot, OWNER_FILE);
  if (!fs.existsSync(marker)) return false;
  try {
    var owner = JSON.parse(fs.readFileSync(marker, 'utf8'));
    return owner.kind === 'sdd-console-e2e' && owner.token === state.token &&
      (!state.serverPid || owner.serverPid === state.serverPid);
  }
  catch (_) { return false; }
}

function recordServerOwner(state) {
  if (!state || !state.projectDir || !state.token || !state.serverPid) return false;
  fs.writeFileSync(path.join(state.projectDir, OWNER_FILE), JSON.stringify({
    kind: 'sdd-console-e2e', token: state.token, serverPid: state.serverPid
  }), 'utf8');
  return ownedProject(state);
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

async function terminateOwnedServer(state) {
  if (!ownedProject(state)) return false;
  if (!state.serverPid || !processExists(state.serverPid)) return true;
  process.kill(state.serverPid, 'SIGTERM');
  var deadline = Date.now() + 5000;
  while (Date.now() < deadline && processExists(state.serverPid)) {
    await new Promise(function(resolve) { setTimeout(resolve, 50); });
  }
  if (processExists(state.serverPid)) throw new Error('Console E2E server did not stop: ' + state.serverPid);
  return true;
}

function cleanupOwnedProject(state) {
  if (!ownedProject(state)) return false;
  fs.rmSync(state.projectDir, { recursive: true, force: true });
  return true;
}

function specContent(taskName, title, providerId, acIds) {
  var acceptance = acIds.map(function(id) {
    return ['### ' + id + ': ' + title, 'Verification: e2e', 'Provider: ' + providerId, 'Test: tests/console.spec.js'].join('\n');
  }).join('\n\n');
  return [
    '---', 'date: 2026-07-12', 'task-name: "' + taskName + '"', 'mode: standard', 'status: draft',
    'design-file: "mydocs/design/' + taskName + '.design.md"',
    'execute-log-file: "mydocs/logs/' + taskName + '.execute.md"', '---',
    '## Summary', title, '## Research', '### Confirmed Requirement', 'Scope Boundary: fixture',
    '## Acceptance Criteria', acceptance, '## Plan', 'Step 1: fixture verification.',
    'Plan Approved By: agent:fixture', 'Approved At: 2026-07-12T00:00:00Z', 'Gate Evidence: fixture evidence',
    '## Completion Verification', 'Challenge Verdict:'
  ].join('\n') + '\n';
}

function baseRun(root, specFile, provider, runId, createdAt, decision, targetAcs) {
  var fingerprint = require('../../src/verification/fingerprint');
  var readiness = require('../../src/verification/readiness');
  var manifest = require('../../src/verification/adapters/playwright-test/manifest');
  var gateway = require('../../src/verification/process-gateway');
  var spec = fs.readFileSync(specFile, 'utf8');
  var codeState = fingerprint.captureCodeState(root, 'mydocs');
  var env = gateway.inheritedEnvironment([]);
  var environmentDigests = {};
  Object.keys(env).sort().forEach(function(name) { environmentDigests[name] = sha(String(env[name])); });
  var configFile = path.join(root, 'playwright.config.js');
  var manifestFile = path.join(root, 'package.json');
  var lockFile = path.join(root, 'package-lock.json');
  var design = fingerprint.designEvidence(root, spec);
  var tests = targetAcs.map(function(acId, index) {
    return { id: 'fixture-' + runId + '-' + index, title: acId, project: 'chromium', acIds: [acId],
      status: decision === 'PASS' ? 'passed' : 'failed', expectedStatus: 'passed', retry: 0, duration: 1,
      errors: [], attachments: [], stablePass: decision === 'PASS' };
  });
  return {
    schemaVersion: 1, runId: runId, createdAt: createdAt, providerId: 'console-e2e', adapterId: 'playwright-test',
    adapterManifestDigest: sha(JSON.stringify(manifest)), providerDigest: sha(JSON.stringify(provider)),
    invocationDigest: sha('fixture-invocation-' + runId), allowedEnvironmentKeys: [], environmentDigests: environmentDigests,
    spec: { path: path.relative(root, specFile).replace(/\\/g, '/'), specDigest: sha(spec),
      verificationContractDigest: sha(JSON.stringify(readiness.verificationContract(spec, 'console-e2e'))),
      diffBase: '', planDigest: fingerprint.planDigest(spec), designPath: design.path, designDigest: design.digest },
    codeStateBefore: codeState, codeStateAfter: codeState,
    workspace: { workspaceRoot: '.', packageRoot: '.', manifest: 'package.json', lockfile: 'package-lock.json',
      resolvedToolVersion: '1.52.0', manifestDigest: sha(fs.readFileSync(manifestFile)),
      lockfileDigest: sha(fs.readFileSync(lockFile)), configDigest: sha(fs.readFileSync(configFile)) },
    process: { status: decision === 'PASS' ? 0 : 1, signal: '', stdout: '', stderr: '' },
    targets: { acIds: targetAcs, projects: ['chromium'] },
    status: decision === 'PASS' ? 'passed' : 'failed', freshness: 'fresh', gateDecision: decision,
    acExecutions: tests.map(function(test) { return { acId: test.acIds[0], project: 'chromium', testIds: [test.id], status: test.status }; }),
    testExecutions: tests, attachments: [], diagnostics: []
  };
}

function createConsoleE2EProject() {
  var token = crypto.randomBytes(16).toString('hex');
  var root = path.join(os.tmpdir(), 'sdd-console-e2e-' + process.pid + '-' + Date.now());
  fs.mkdirSync(root, { recursive: false });
  write(path.join(root, OWNER_FILE), JSON.stringify({ token: token, kind: 'sdd-console-e2e' }));
  write(path.join(root, '.gitignore'), OWNER_FILE + '\n');
  write(path.join(root, '.sdd-config'), 'DOCS_DIR="mydocs"\nAPPROVAL_POLICY="agent"\nCRUISE_ENABLED="true"\nCRUISE_MAX_ITERATIONS="5"\n');
  var provider = { adapter: 'playwright-test', workspaceRoot: '.', packageRoot: '.', config: 'playwright.config.js', projects: ['chromium'] };
  write(path.join(root, '.sdd-verification.json'), JSON.stringify({ schemaVersion: 1, providers: { 'console-e2e': provider } }, null, 2));
  write(path.join(root, 'package.json'), JSON.stringify({ name: 'console-e2e-project', private: true, devDependencies: { '@playwright/test': '1.52.0' } }, null, 2));
  write(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'console-e2e-project', lockfileVersion: 3, packages: {
    '': { devDependencies: { '@playwright/test': '1.52.0' } }, 'node_modules/@playwright/test': { version: '1.52.0' }
  } }, null, 2));
  write(path.join(root, 'node_modules/@playwright/test/package.json'), JSON.stringify({ name: '@playwright/test', version: '1.52.0' }));
  write(path.join(root, 'playwright.config.js'), 'module.exports = {};\n');

  var evidenceSpec = path.join(root, 'mydocs/specs/v1.0-evidence-view.md');
  var noRunsSpec = path.join(root, 'mydocs/specs/v1.0-no-runs.md');
  var requiredSpec = path.join(root, 'mydocs/specs/v1.0-provider-required.md');
  write(evidenceSpec, specContent('evidence-view', 'Evidence view', 'console-e2e', ['AC-003', 'AC-004', 'AC-005', 'AC-006', 'AC-007']));
  write(noRunsSpec, specContent('no-runs', 'No runs', 'console-e2e', ['AC-003']));
  write(requiredSpec, specContent('provider-required', 'Provider required', 'missing-e2e', ['AC-003']));
  ['evidence-view', 'no-runs', 'provider-required'].forEach(function(name) {
    write(path.join(root, 'mydocs/design/' + name + '.design.md'), '## Technical Design\nTest Strategy: fixture.\n');
    write(path.join(root, 'mydocs/logs/' + name + '.execute.md'), '# Execute Log\n');
  });
  git(root, ['init']);
  git(root, ['config', 'user.email', 'fixture@example.com']);
  git(root, ['config', 'user.name', 'SDD Fixture']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'fixture baseline']);

  var pass = baseRun(root, evidenceSpec, provider, 'old-pass', '2026-07-12T00:00:00Z', 'PASS', ['AC-003', 'AC-004', 'AC-005', 'AC-006']);
  var fail = baseRun(root, evidenceSpec, provider, 'new-fail', '2026-07-12T00:01:00Z', 'FAIL', ['AC-003']);
  fail.diagnostics = [{ code: 'TEST_FAILED', message: 'token=super-secret at C:\\Users\\alice\\repo\\failure.txt' }];
  fail.attachments = [{ name: 'trace.zip', mediaType: 'application/zip', size: 42, sha256: 'b'.repeat(64), path: 'artifacts/trace.zip' }];
  write(path.join(root, 'mydocs/runs/verification/old-pass/run.json'), JSON.stringify(pass, null, 2));
  write(path.join(root, 'mydocs/runs/verification/new-fail/run.json'), JSON.stringify(fail, null, 2));
  return { projectDir: root, token: token };
}

module.exports = { createConsoleE2EProject: createConsoleE2EProject, cleanupOwnedProject: cleanupOwnedProject,
  ownedProject: ownedProject, recordServerOwner: recordServerOwner, terminateOwnedServer: terminateOwnedServer,
  OWNER_FILE: OWNER_FILE };
