const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runCli } = require('./helpers/sdd-fixtures');
const { execFileSync } = require('node:child_process');
const providerReadiness = require('../src/verification/readiness');
const specState = require('../src/core/spec-state');
const { commitRun } = require('../src/verification/run-store');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-verify-cli-'));
  writeJson(path.join(root, 'package.json'), {
    private: true, workspaces: ['apps/*'], devDependencies: { '@playwright/test': '^1.52.0' }
  });
  writeJson(path.join(root, 'package-lock.json'), { lockfileVersion: 3, packages: {
    'node_modules/@playwright/test': { version: '1.52.0' }
  } });
  writeJson(path.join(root, 'apps/web/package.json'), { name: 'web' });
  fs.writeFileSync(path.join(root, 'apps/web/playwright.config.ts'), 'module.exports = {};');
  writeJson(path.join(root, 'node_modules/@playwright/test/package.json'), {
    name: '@playwright/test', version: '1.52.0'
  });
  return root;
}

function initArgs(root, provider = 'web-e2e') {
  return ['verify', 'init', root, '--provider', provider, '--adapter', 'playwright-test',
    '--workspace-root', '.', '--package-root', 'apps/web',
    '--config', 'apps/web/playwright.config.ts', '--project', 'chromium'];
}

function injectedInit(root, injections) {
  const modulePath = path.resolve(__dirname, '..', 'src', 'commands', 'verify.js');
  const script = [
    "const fs = require('fs');",
    `const verify = require(${JSON.stringify(modulePath)});`,
    injections,
    "verify.init(process.argv[1], { provider: 'web-e2e', adapter: 'playwright-test', workspaceRoot: '.', packageRoot: 'apps/web', config: 'apps/web/playwright.config.ts', project: ['chromium'] });"
  ].join('\n');
  try {
    return { status: 0, output: execFileSync(process.execPath, ['-e', script, root], { cwd: root, encoding: 'utf8' }) };
  } catch (error) {
    return { status: error.status, output: String(error.stdout || '') + String(error.stderr || '') };
  }
}

test('verify init atomically creates a named configured provider without browser installation', () => {
  const root = project();
  const result = runCli(initArgs(root), root);
  assert.equal(result.status, 0, result.output);
  const config = JSON.parse(fs.readFileSync(path.join(root, '.sdd-verification.json'), 'utf8'));
  assert.deepEqual(config, { schemaVersion: 1, providers: { 'web-e2e': {
    adapter: 'playwright-test', workspaceRoot: '.', packageRoot: 'apps/web',
    config: 'apps/web/playwright.config.ts', projects: ['chromium']
  } } });
  assert.match(result.output, /configured/i);
  const retry = runCli(initArgs(root), root);
  assert.equal(retry.status, 0, retry.output);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '.sdd-verification.json'), 'utf8')), config);
});

test('verify init fails fast when the project config lock already exists', () => {
  const root = project();
  const file = path.join(root, '.sdd-verification.json');
  const original = '{\n  "schemaVersion": 1,\n  "providers": {}\n}\n';
  fs.writeFileSync(file, original);
  fs.mkdirSync(path.join(root, '.sdd-verification.json.lock'));
  const started = Date.now();
  const result = runCli(initArgs(root), root);
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /SDD_VERIFY_INIT_LOCKED/);
  assert.ok(Date.now() - started < 1000, 'lock conflict must not wait or retry');
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('verify init releases the lock and preserves original config when atomic write fails, then retry succeeds', () => {
  const root = project();
  const file = path.join(root, '.sdd-verification.json');
  const original = '{\n  "schemaVersion": 1,\n  "providers": {}\n}\n';
  fs.writeFileSync(file, original);
  const result = injectedInit(root, "const original = fs.renameSync; fs.renameSync = function(source, target) { if (String(target).endsWith('.sdd-verification.json')) { const error = new Error('injected write failure'); error.code = 'INJECTED_WRITE'; throw error; } return original.apply(this, arguments); };");
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /SDD_VERIFY_INJECTED_WRITE/);
  assert.equal(fs.existsSync(path.join(root, '.sdd-verification.json.lock')), false);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  const retry = runCli(initArgs(root), root);
  assert.equal(retry.status, 0, retry.output);
});

test('verify init reports an unlock-only failure with inspect-config guidance', () => {
  const root = project();
  const result = injectedInit(root, "const original = fs.rmdirSync; fs.rmdirSync = function(target) { if (String(target).endsWith('.sdd-verification.json.lock')) { const error = new Error('injected unlock failure'); error.code = 'ENOTEMPTY'; throw error; } return original.apply(this, arguments); };");
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /\[SDD_VERIFY_INIT_UNLOCK_FAILED\]/);
  assert.match(result.output, /configuration may have been written|check .*\.sdd-verification\.json/i);
  assert.doesNotMatch(result.output, /configured/);
});

test('verify init prioritizes unlock failure while preserving the transaction error diagnostic', () => {
  const root = project();
  const result = injectedInit(root, "const rename = fs.renameSync; fs.renameSync = function(source, target) { if (String(target).endsWith('.sdd-verification.json')) { const error = new Error('injected write failure'); error.code = 'INJECTED_WRITE'; throw error; } return rename.apply(this, arguments); }; const remove = fs.rmdirSync; fs.rmdirSync = function(target) { if (String(target).endsWith('.sdd-verification.json.lock')) { const error = new Error('injected unlock failure'); error.code = 'ENOTEMPTY'; throw error; } return remove.apply(this, arguments); };");
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /\[SDD_VERIFY_INIT_UNLOCK_FAILED\]/);
  assert.match(result.output, /SDD_VERIFY_INJECTED_WRITE.*injected write failure/);
  assert.doesNotMatch(result.output, /configured/);
});

test('verify init runtime exposes only the single project lock contract and guide stays user-level', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'commands', 'verify.js'), 'utf8');
  const guide = fs.readFileSync(path.resolve(__dirname, '..', 'GUIDE.md'), 'utf8');
  assert.doesNotMatch(source, /acquireProviderLock|INIT_CONFLICT|\.sdd-verification\.['"]?\s*\+\s*providerId/);
  assert.doesNotMatch(guide, /Provider 级锁|INIT_CONFLICT|\.sdd-verification\.<provider>\.lock|SDD_VERIFY_INIT_LOCKED/);
});

test('verify init preserves the original config byte-for-byte when preflight fails', () => {
  const root = project();
  const file = path.join(root, '.sdd-verification.json');
  const original = '{\n  "schemaVersion": 1,\n  "providers": {}\n}\n';
  fs.writeFileSync(file, original);
  const args = initArgs(root, 'broken');
  args[args.indexOf('--config') + 1] = 'apps/web/missing.config.ts';
  const result = runCli(args, root);
  assert.equal(result.status, 2, result.output);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.match(result.output, /CONFIG_NOT_FOUND/);
});

test('verify init rejects a config whose realpath escapes through a directory link', () => {
  const root = project();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-config-outside-'));
  fs.writeFileSync(path.join(outside, 'playwright.config.ts'), 'module.exports = {};');
  fs.symlinkSync(outside, path.join(root, 'apps/web/linked'), 'junction');
  const args = initArgs(root, 'escaped');
  args[args.indexOf('--config') + 1] = 'apps/web/linked/playwright.config.ts';
  const result = runCli(args, root);
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /PATH_ESCAPE/);
  assert.equal(fs.existsSync(path.join(root, '.sdd-verification.json')), false);
});

test('verify help does not expose execution internals as provider options', () => {
  const result = runCli(['verify', 'init', '--help'], process.cwd());
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Usage: sdd verify init/);
  assert.doesNotMatch(result.output, /--transport|--command|--cli|--browser-executable/);
});

function runnableProject(approved = true, acIds = ['AC-001']) {
  const root = project();
  fs.writeFileSync(path.join(root, 'node_modules/@playwright/test/cli.js'), [
    "const reporterArg = process.argv.find(a => a.startsWith('--reporter='));",
    "const Reporter = require(reporterArg.slice('--reporter='.length));",
    "const projectArg = process.argv.find(a => a.startsWith('--project='));",
    "const name = projectArg ? projectArg.slice('--project='.length) : 'chromium';",
    "if (process.env.FAKE_BROWSER_MISSING === 'pre-business') { console.error(\"Executable doesn't exist at /srv/app-helper\"); process.exit(1); }",
    "const reporter = new Reporter();",
    "reporter.onBegin({}, {});",
    "const browserMissing = process.env.FAKE_BROWSER_MISSING === '1';",
    "const businessFailure = process.env.FAKE_BROWSER_MISSING === 'business';",
    "const globalBrowserMissing = process.env.FAKE_BROWSER_MISSING === 'global';",
    `const acIds = ${JSON.stringify(acIds)};`,
    "if (!globalBrowserMissing) acIds.forEach((acId, index) => reporter.onTestEnd({ id: 't' + (index + 1), title: 'works ' + acId, tags: ['@' + acId].concat(process.env.TEST_SECRET ? ['@AC-' + process.env.TEST_SECRET] : []), expectedStatus: 'passed', parent: { project: () => ({ name }) } }, { status: browserMissing || businessFailure ? 'failed' : 'passed', retry: 0, duration: 1, errors: browserMissing ? [{ message: \"browserType.launch: Executable doesn't exist at /cache/chromium\" }] : businessFailure ? [{ message: \"Executable doesn't exist at /srv/app-helper\" }] : process.env.TEST_SECRET ? [{ message: 'failure=' + process.env.TEST_SECRET }] : [], attachments: process.env.TEST_SECRET ? [{ name: 'evidence', contentType: 'x-secret/' + process.env.TEST_SECRET }] : [] }));",
    "if (process.env.TEST_SECRET) console.log('secret=' + process.env.TEST_SECRET);",
    "if (globalBrowserMissing) console.error(\"browserType.launch: Executable doesn't exist at /cache/chromium\");",
    "reporter.onEnd({ status: browserMissing || businessFailure || globalBrowserMissing ? 'failed' : 'passed' });",
    "if (browserMissing || businessFailure || globalBrowserMissing) process.exitCode = 1;"
  ].join('\n'));
  const spec = path.join(root, 'mydocs/specs/spec.md');
  fs.mkdirSync(path.dirname(spec), { recursive: true });
  const acceptance = acIds.flatMap((id) => [
    `### ${id}: web works`, 'Verification: e2e', 'Provider: web-e2e', `Test: tests/${id.toLowerCase()}.test.js`
  ]);
  fs.writeFileSync(spec, [
    '---', 'mode: standard', 'autonomy-mode: "auto"', 'autonomy-mode-source: "fixture"', 'task-name: fixture-e2e', 'design-file: design.md', '---',
    '## Acceptance Criteria', ...acceptance,
    '## Plan', 'Step: sdd verify init --provider web-e2e',
    'Plan Approved By:' + (approved ? ' agent:test' : ''),
    'Approved At:' + (approved ? ' 2026-07-12T00:00:00Z' : ''),
    'Gate Evidence:' + (approved ? ' test plan' : '')
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'design.md'), '## Technical Design\nTest Strategy: real fixture strategy\n');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', XDG_CONFIG_HOME: path.join(root, '.xdg') };
  fs.mkdirSync(env.XDG_CONFIG_HOME, { recursive: true });
  execFileSync('git', ['init'], { cwd: root, env });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, env });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root, env });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, env });
  execFileSync('git', ['add', '.'], { cwd: root, env });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root, env });
  const initialized = runCli(initArgs(root), root);
  assert.equal(initialized.status, 0, initialized.output);
  return { root, spec };
}

test('verify run executes the registered adapter and commits a fresh immutable PASS run', () => {
  const fixture = runnableProject(true);
  const secondSpec = path.join(fixture.root, 'second-spec.md');
  fs.copyFileSync(fixture.spec, secondSpec);
  const previousSecret = process.env.TEST_SECRET;
  process.env.TEST_SECRET = 'super-secret-value';
  const result = runCli(['verify', 'run', fixture.root, '--spec', fixture.spec, '--allow-env', 'TEST_SECRET'], fixture.root);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /gate=PASS/);
  const runRoot = path.join(fixture.root, 'mydocs/runs/verification');
  const runDir = fs.readdirSync(runRoot).find(name => !name.startsWith('.staging-'));
  const run = JSON.parse(fs.readFileSync(path.join(runRoot, runDir, 'run.json')));
  assert.equal(run.gateDecision, 'PASS');
  assert.equal(run.freshness, 'fresh');
  assert.equal(run.acExecutions[0].acId, 'AC-001');
  assert.doesNotMatch(run.process.stdout, /super-secret-value/);
  assert.match(run.process.stdout, /REDACTED/);
  assert.doesNotMatch(JSON.stringify(run), /super-secret-value/);
  assert.match(run.testExecutions[0].errors[0].message, /REDACTED/);
  const ready = providerReadiness.inspect(fs.readFileSync(fixture.spec, 'utf8'), fixture.root, fixture.spec);
  assert.equal(ready.state, 'ready');
  process.env.TEST_SECRET = 'changed-secret-value';
  const environmentStale = providerReadiness.inspect(fs.readFileSync(fixture.spec, 'utf8'), fixture.root, fixture.spec);
  assert.equal(environmentStale.state, 'blocked');
  assert.ok(environmentStale.issues.some(issue => /environment/.test(issue)));
  process.env.TEST_SECRET = 'super-secret-value';
  const replay = providerReadiness.inspect(fs.readFileSync(secondSpec, 'utf8'), fixture.root, secondSpec);
  assert.equal(replay.state, 'configured');
  const originalSpec = fs.readFileSync(fixture.spec, 'utf8');
  fs.writeFileSync(fixture.spec, originalSpec.replace('Test: tests/ac-001.test.js', 'Test: tests/changed.test.js'));
  const contractStale = providerReadiness.inspect(fs.readFileSync(fixture.spec, 'utf8'), fixture.root, fixture.spec);
  assert.equal(contractStale.state, 'blocked');
  assert.ok(contractStale.issues.some(issue => /verificationContract/.test(issue)));
  fs.writeFileSync(fixture.spec, originalSpec.replace('mode: standard', 'mode: lite'));
  const identityStale = providerReadiness.inspect(fs.readFileSync(fixture.spec, 'utf8'), fixture.root, fixture.spec);
  assert.equal(identityStale.state, 'blocked');
  assert.ok(identityStale.issues.some(issue => /verificationContract/.test(issue)));
  fs.writeFileSync(fixture.spec, originalSpec);
  fs.appendFileSync(path.join(fixture.root, 'design.md'), 'changed\n');
  const designStale = providerReadiness.inspect(fs.readFileSync(fixture.spec, 'utf8'), fixture.root, fixture.spec);
  assert.equal(designStale.state, 'blocked');
  assert.ok(designStale.issues.some(issue => /design/.test(issue)));
  fs.writeFileSync(path.join(fixture.root, 'design.md'), '## Technical Design\nTest Strategy: real fixture strategy\n');
  fs.appendFileSync(fixture.spec, '\n<!-- contract changed -->\n');
  const stale = providerReadiness.inspect(fs.readFileSync(fixture.spec, 'utf8'), fixture.root, fixture.spec);
  assert.equal(stale.state, 'blocked');
  assert.ok(stale.issues.some(issue => /stale/.test(issue)));
  const workflow = specState.evaluate({ exists: true, projectDir: fixture.root, specPath: fixture.spec, mode: 'standard', status: 'draft',
    content: fs.readFileSync(fixture.spec, 'utf8') });
  assert.ok(workflow.blockers.some(blocker => blocker.gate === 'completion' && /stale/.test(blocker.message)));
  if (previousSecret === undefined) delete process.env.TEST_SECRET; else process.env.TEST_SECRET = previousSecret;
});

test('verify run aggregates fresh subset Runs before declaring complete provider coverage', () => {
  const fixture = runnableProject(true, ['AC-001', 'AC-002']);
  const first = runCli(['verify', 'run', fixture.root, '--spec', fixture.spec, '--ac', 'AC-001'], fixture.root);
  assert.equal(first.status, 0, first.output);
  const incomplete = providerReadiness.inspect(fs.readFileSync(fixture.spec, 'utf8'), fixture.root, fixture.spec);
  assert.equal(incomplete.state, 'blocked');
  assert.ok(incomplete.issues.some(issue => /coverage incomplete/i.test(issue)));

  const second = runCli(['verify', 'run', fixture.root, '--spec', fixture.spec, '--ac', 'AC-002'], fixture.root);
  assert.equal(second.status, 0, second.output);
  const complete = providerReadiness.inspect(fs.readFileSync(fixture.spec, 'utf8'), fixture.root, fixture.spec);
  assert.equal(complete.state, 'ready');
});

test('verify run validates raw identity fields before redacting persisted diagnostics', () => {
  const unknownFixture = runnableProject(true);
  const previous = process.env.TEST_SECRET;
  process.env.TEST_SECRET = '999';
  const unknown = runCli(['verify', 'run', unknownFixture.root, '--spec', unknownFixture.spec,
    '--allow-env', 'TEST_SECRET'], unknownFixture.root);
  assert.equal(unknown.status, 1, unknown.output);
  assert.match(unknown.output, /UNKNOWN_AC_TAG/);

  const projectFixture = runnableProject(true);
  process.env.TEST_SECRET = 'chromium';
  const commonValue = runCli(['verify', 'run', projectFixture.root, '--spec', projectFixture.spec,
    '--allow-env', 'TEST_SECRET'], projectFixture.root);
  assert.equal(commonValue.status, 0, commonValue.output);
  if (previous === undefined) delete process.env.TEST_SECRET; else process.env.TEST_SECRET = previous;
});

test('readiness uses the latest fresh evidence for each AC and project pair', () => {
  const fixture = runnableProject(true);
  const passed = runCli(['verify', 'run', fixture.root, '--spec', fixture.spec], fixture.root);
  assert.equal(passed.status, 0, passed.output);
  const runRoot = path.join(fixture.root, 'mydocs/runs/verification');
  const passDir = fs.readdirSync(runRoot).find(name => !name.startsWith('.staging-'));
  const failed = JSON.parse(fs.readFileSync(path.join(runRoot, passDir, 'run.json')));
  failed.runId = 'newer-failed-run';
  failed.createdAt = new Date(Date.parse(failed.createdAt) + 1000).toISOString();
  failed.status = 'failed';
  failed.gateDecision = 'FAIL';
  failed.acExecutions[0].status = 'failed';
  failed.testExecutions[0].status = 'failed';
  failed.testExecutions[0].stablePass = false;
  commitRun(fixture.root, 'mydocs', failed, []);
  const readiness = providerReadiness.inspect(fs.readFileSync(fixture.spec, 'utf8'), fixture.root, fixture.spec);
  assert.equal(readiness.state, 'blocked');
});

test('verify run blocks before adapter execution when Plan Gate is not approved', () => {
  const fixture = runnableProject(false);
  const result = runCli(['verify', 'run', fixture.root, '--spec', fixture.spec], fixture.root);
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /PLAN_GATE_NOT_APPROVED/);
  assert.equal(fs.existsSync(path.join(fixture.root, 'mydocs/runs/verification')), false);
});

test('verify run help exposes explicit environment authorization but no arbitrary command', () => {
  const result = runCli(['verify', 'run', '--help'], process.cwd());
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /--allow-env/);
  assert.doesNotMatch(result.output, /--command|--transport|--executable/);
});

test('verify usage errors use a stable code and exit 3', () => {
  const missingSpec = runCli(['verify', 'run', '.'], process.cwd());
  assert.equal(missingSpec.status, 3, missingSpec.output);
  assert.match(missingSpec.output, /SDD_VERIFY_USAGE/);
});

test('browser missing after Reporter handshake is BLOCKED with an install suggestion', () => {
  const fixture = runnableProject(true);
  const previous = process.env.FAKE_BROWSER_MISSING;
  process.env.FAKE_BROWSER_MISSING = '1';
  const result = runCli(['verify', 'run', fixture.root, '--spec', fixture.spec,
    '--allow-env', 'FAKE_BROWSER_MISSING'], fixture.root);
  if (previous === undefined) delete process.env.FAKE_BROWSER_MISSING; else process.env.FAKE_BROWSER_MISSING = previous;
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /SDD_VERIFY_BROWSER_NOT_INSTALLED/);
  assert.match(result.output, /npm exec playwright install/);
  const runRoot = path.join(fixture.root, 'mydocs/runs/verification');
  const runDir = fs.readdirSync(runRoot).find(name => !name.startsWith('.staging-'));
  const run = JSON.parse(fs.readFileSync(path.join(runRoot, runDir, 'run.json')));
  assert.equal(run.gateDecision, 'BLOCKED');
  assert.ok(run.diagnostics.some(item => item.code === 'BROWSER_NOT_INSTALLED'));
});

test('business errors mentioning browser installation remain ordinary gate failures', () => {
  const fixture = runnableProject(true);
  const previous = process.env.FAKE_BROWSER_MISSING;
  process.env.FAKE_BROWSER_MISSING = 'business';
  const result = runCli(['verify', 'run', fixture.root, '--spec', fixture.spec,
    '--allow-env', 'FAKE_BROWSER_MISSING'], fixture.root);
  if (previous === undefined) delete process.env.FAKE_BROWSER_MISSING; else process.env.FAKE_BROWSER_MISSING = previous;
  assert.equal(result.status, 1, result.output);
  assert.doesNotMatch(result.output, /BROWSER_NOT_INSTALLED/);
});

test('pre-handshake business executable errors remain HANDSHAKE_FAILED', () => {
  const fixture = runnableProject(true);
  const previous = process.env.FAKE_BROWSER_MISSING;
  process.env.FAKE_BROWSER_MISSING = 'pre-business';
  const result = runCli(['verify', 'run', fixture.root, '--spec', fixture.spec,
    '--allow-env', 'FAKE_BROWSER_MISSING'], fixture.root);
  if (previous === undefined) delete process.env.FAKE_BROWSER_MISSING; else process.env.FAKE_BROWSER_MISSING = previous;
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /SDD_VERIFY_HANDSHAKE_FAILED/);
  assert.doesNotMatch(result.output, /BROWSER_NOT_INSTALLED/);
});

test('global setup browser missing with no tests still commits a BLOCKED Run', () => {
  const fixture = runnableProject(true);
  const previous = process.env.FAKE_BROWSER_MISSING;
  process.env.FAKE_BROWSER_MISSING = 'global';
  const result = runCli(['verify', 'run', fixture.root, '--spec', fixture.spec,
    '--allow-env', 'FAKE_BROWSER_MISSING'], fixture.root);
  if (previous === undefined) delete process.env.FAKE_BROWSER_MISSING; else process.env.FAKE_BROWSER_MISSING = previous;
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /BROWSER_NOT_INSTALLED/);
  const root = path.join(fixture.root, 'mydocs/runs/verification');
  const run = JSON.parse(fs.readFileSync(path.join(root, fs.readdirSync(root)[0], 'run.json')));
  assert.equal(run.gateDecision, 'BLOCKED');
  assert.equal(run.testExecutions.length, 0);
});
