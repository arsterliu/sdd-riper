const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const normalize = require('../src/verification/adapters/playwright-test/normalize');
const SddReporter = require('../src/verification/adapters/playwright-test/reporter');
const resultContract = require('../src/verification/adapters/playwright-test/result-contract');
const gateway = require('../src/verification/process-gateway');

function passed(id, project, tags) {
  return { id, project, tags, status: 'passed', expectedStatus: 'passed', retry: 0, duration: 5, attachments: [] };
}

test('normalizes strict many-to-many AC coverage across projects', () => {
  const result = normalize.aggregate({
    targetAcIds: ['AC-001', 'AC-002'], projects: ['chromium', 'firefox'], tests: [
      passed('c1', 'chromium', ['@AC-001', '@AC-002']),
      passed('f1', 'firefox', ['@AC-001']),
      passed('f2', 'firefox', ['@AC-002'])
    ]
  });
  assert.equal(result.gateDecision, 'PASS');
  assert.equal(result.acExecutions.length, 4);
  assert.deepEqual(result.testExecutions[0].acIds, ['AC-001', 'AC-002']);
});

test('fails closed for unknown tags or zero project coverage', () => {
  assert.throws(() => normalize.aggregate({
    targetAcIds: ['AC-001'], projects: ['chromium'], tests: [passed('x', 'chromium', ['@AC-999'])]
  }), e => e.code === 'UNKNOWN_AC_TAG');
  assert.throws(() => normalize.aggregate({
    targetAcIds: ['AC-001'], projects: ['chromium', 'firefox'], tests: [passed('x', 'chromium', ['@AC-001'])]
  }), e => e.code === 'AC_NOT_COVERED' && e.details.project === 'firefox');
});

test('never treats retries, skips, expected failures or interruptions as PASS', () => {
  const cases = [
    { status: 'passed', expectedStatus: 'passed', retry: 1 },
    { status: 'skipped', expectedStatus: 'skipped', retry: 0 },
    { status: 'failed', expectedStatus: 'failed', retry: 0 },
    { status: 'interrupted', expectedStatus: 'passed', retry: 0 },
    { status: 'timedOut', expectedStatus: 'passed', retry: 0 }
  ];
  for (const value of cases) {
    const result = normalize.aggregate({ targetAcIds: ['AC-001'], projects: ['chromium'], tests: [
      { id: 'x', project: 'chromium', tags: ['@AC-001'], attachments: [], ...value }
    ] });
    assert.notEqual(result.gateDecision, 'PASS', JSON.stringify(value));
  }
});

test('reporter emits hello first and captures official TestCase tags and TestResult fields', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-reporter-'));
  const output = path.join(dir, 'events.jsonl');
  const reporter = new SddReporter({ outputFile: output, nonce: 'once' });
  reporter.onBegin({ projects: [{ name: 'chromium' }] }, { allTests: () => [] });
  reporter.onTestEnd({ id: 't1', tags: ['@AC-001'], expectedStatus: 'passed', title: 'works', parent: { project: () => ({ name: 'chromium' }) } }, {
    status: 'passed', retry: 0, duration: 7, errors: [], attachments: []
  });
  reporter.onEnd({ status: 'passed' });
  const events = fs.readFileSync(output, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events[0], { type: 'hello', nonce: 'once', handshakeVersion: 1, capabilities: ['gate'] });
  assert.deepEqual(events[1].test.tags, ['@AC-001']);
  assert.equal(events[1].test.project, 'chromium');
  assert.equal(events[2].status, 'passed');
});

test('process and onEnd anomalies can never preserve a PASS gate', () => {
  assert.equal(resultContract.evaluate({ status: 0, signal: null }, null).gateDecision, 'BLOCKED');
  assert.equal(resultContract.evaluate({ status: 3, signal: null }, { type: 'end', status: 'passed' }).gateDecision, 'BLOCKED');
  assert.equal(resultContract.evaluate({ status: null, signal: 'SIGTERM' }, { type: 'end', status: 'passed' }).gateDecision, 'BLOCKED');
  assert.equal(resultContract.evaluate({ status: null, signal: null, error: { code: 'ETIMEDOUT' } }, { type: 'end', status: 'passed' }).gateDecision, 'BLOCKED');
  assert.equal(resultContract.evaluate({ status: 1, signal: null }, { type: 'end', status: 'failed' }).gateDecision, 'FAIL');
  assert.equal(resultContract.evaluate({ status: 0, signal: null }, { type: 'end', status: 'passed' }).gateDecision, 'PASS');
});

test('adapter derives a workspace-local browser cache without fingerprinting ambient browser path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-browser-cache-'));
  fs.mkdirSync(path.join(root, '.playwright-browsers'));
  const previous = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:\\ambient\\unstable';
  try {
    const inherited = gateway.inheritedEnvironment([]);
    assert.equal(inherited.PLAYWRIGHT_BROWSERS_PATH, undefined);
    const invocation = gateway.buildInvocation({ workspaceRoot: root, packageRoot: root,
      toolPackage: path.join(root, 'node_modules/@playwright/test/package.json') },
    { config: 'playwright.config.js', projects: ['chromium'] }, 'reporter.js', 'events.jsonl', 'nonce', []);
    assert.equal(invocation.env.PLAYWRIGHT_BROWSERS_PATH, path.join(root, '.playwright-browsers'));
  } finally {
    if (previous === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
