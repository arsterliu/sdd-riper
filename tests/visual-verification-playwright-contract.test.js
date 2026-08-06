const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const normalize = require('../src/verification/adapters/playwright-visual/normalize');
const VisualReporter = require('../src/verification/adapters/playwright-visual/reporter');
const resultContract = require('../src/verification/adapters/playwright-visual/result-contract');
const gateway = require('../src/verification/process-gateway');

function visualTest(overrides = {}) {
  return {
    id: 'test-id',
    title: 'captures checkout default',
    project: 'chromium',
    status: 'passed',
    expectedStatus: 'passed',
    retry: 0,
    duration: 10,
    errors: [],
    attachments: [{ name: 'sdd-visual:checkout-default', contentType: 'image/png', path: 'test-results/current.png' }],
    ...overrides
  };
}

const bindings = [{ scenarioId: 'checkout-default', testFile: 'tests/checkout.spec.js', testTitle: 'captures checkout default', project: 'chromium', threshold: 0.001, masks: [] }];

test('normalizes exactly one current screenshot from the static scenario binding', () => {
  const result = normalize.aggregate({ bindings, tests: [visualTest()] });

  assert.equal(result.gateDecision, 'PASS');
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.scenarioExecutions, [{
    scenarioId: 'checkout-default', project: 'chromium', current: { name: 'sdd-visual:checkout-default', contentType: 'image/png', path: 'test-results/current.png' },
    status: 'passed'
  }]);
});

test('fails closed for unknown, duplicated, or unstable screenshot events', () => {
  assert.throws(
    () => normalize.aggregate({ bindings, tests: [visualTest({ attachments: [{ name: 'sdd-visual:other', contentType: 'image/png', path: 'x.png' }] })] }),
    error => error.code === 'VISUAL_REPORT_INVALID'
  );
  assert.throws(
    () => normalize.aggregate({ bindings, tests: [visualTest({ attachments: [
      { name: 'sdd-visual:checkout-default', contentType: 'image/png', path: 'one.png' },
      { name: 'sdd-visual:checkout-default', contentType: 'image/png', path: 'two.png' }
    ] })] }),
    error => error.code === 'VISUAL_REPORT_INVALID'
  );
  const unstable = normalize.aggregate({ bindings, tests: [visualTest({ retry: 1 })] });
  assert.deepEqual(unstable, { status: 'failed', gateDecision: 'FAIL', scenarioExecutions: [{ scenarioId: 'checkout-default', project: 'chromium', status: 'failed' }] });
});

test('reporter emits a visual-gate handshake and only official attachment metadata', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-reporter-'));
  const output = path.join(dir, 'events.jsonl');
  const reporter = new VisualReporter({ outputFile: output, nonce: 'nonce' });
  reporter.onBegin();
  reporter.onTestEnd({ id: 't1', title: 'captures checkout default', expectedStatus: 'passed', tags: [], parent: { project: () => ({ name: 'chromium' }) } }, {
    status: 'passed', retry: 0, duration: 1, errors: [], attachments: [{ name: 'sdd-visual:checkout-default', contentType: 'image/png', path: 'current.png' }]
  });
  reporter.onEnd({ status: 'passed' });
  const events = fs.readFileSync(output, 'utf8').trim().split('\n').map(JSON.parse);

  assert.deepEqual(events[0], { type: 'hello', nonce: 'nonce', handshakeVersion: 1, capabilities: ['visual-gate'] });
  assert.deepEqual(events[1].test.attachments, [{ name: 'sdd-visual:checkout-default', contentType: 'image/png', path: 'current.png' }]);
  assert.equal(events[2].status, 'passed');
});

test('process or Reporter terminal anomalies cannot preserve a visual PASS', () => {
  assert.equal(resultContract.evaluate({ status: 0, signal: null }, null).gateDecision, 'BLOCKED');
  assert.equal(resultContract.evaluate({ status: 1, signal: null }, { type: 'end', status: 'passed' }).gateDecision, 'BLOCKED');
  assert.equal(resultContract.evaluate({ status: 0, signal: null }, { type: 'end', status: 'failed' }).gateDecision, 'FAIL');
  assert.equal(resultContract.evaluate({ status: 0, signal: null }, { type: 'end', status: 'passed' }).gateDecision, 'PASS');
});

test('gateway only adds prevalidated static test files after the Playwright argument boundary', () => {
  const invocation = gateway.buildInvocation(
    { workspaceRoot: 'C:/repo', packageRoot: 'C:/repo', toolPackage: 'C:/repo/node_modules/@playwright/test/package.json' },
    { config: 'playwright.config.js', projects: ['chromium'] }, 'reporter.js', 'events.jsonl', 'nonce', [],
    ['tests/checkout.visual.spec.js']
  );

  assert.deepEqual(invocation.args.slice(-2), ['--', 'tests/checkout.visual.spec.js']);
});
