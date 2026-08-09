const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SddReporter = require('../src/verification/adapters/playwright-test/reporter');
const VisualReporter = require('../src/verification/adapters/playwright-visual/reporter');

function eventFile(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return path.join(directory, 'events.jsonl');
}

function readEvents(outputFile) {
  return fs.readFileSync(outputFile, 'utf8').trim().split('\n').map(JSON.parse);
}

function testCase(tags) {
  return {
    id: 'case-1',
    title: 'captures evidence',
    tags: tags,
    expectedStatus: 'passed',
    parent: { project: function() { return { name: 'chromium' }; } }
  };
}

function testResult() {
  return {
    status: 'passed',
    retry: 0,
    duration: 7,
    errors: [{ message: 'ignored detail' }],
    attachments: [{ name: 'sdd-visual:checkout', contentType: 'image/png', path: 'current.png', body: Buffer.from('private') }]
  };
}

test('两个 Reporter wrapper 保持各自安全事件合同', () => {
  assert.throws(function() { return new SddReporter({ nonce: 'once' }); }, /SDD reporter requires outputFile and nonce/);
  assert.throws(function() { return new VisualReporter({ outputFile: 'events.jsonl' }); }, /SDD visual reporter requires outputFile and nonce/);

  const normalOutput = eventFile('sdd-normal-reporter-');
  const visualOutput = eventFile('sdd-visual-reporter-');
  const normal = new SddReporter({ outputFile: normalOutput, nonce: 'normal-nonce' });
  const visual = new VisualReporter({ outputFile: visualOutput, nonce: 'visual-nonce' });
  normal.onBegin();
  normal.onTestEnd(testCase(['@AC-001']), testResult());
  normal.onEnd({ status: 'passed' });
  visual.onBegin();
  visual.onTestEnd(testCase(['@AC-001']), testResult());
  visual.onEnd({ status: 'passed' });

  const normalEvents = readEvents(normalOutput);
  const visualEvents = readEvents(visualOutput);
  assert.deepEqual(normalEvents[0], { type: 'hello', nonce: 'normal-nonce', handshakeVersion: 1, capabilities: ['gate'] });
  assert.deepEqual(visualEvents[0], { type: 'hello', nonce: 'visual-nonce', handshakeVersion: 1, capabilities: ['visual-gate'] });
  assert.deepEqual(normalEvents.map(function(event) { return event.type; }), ['hello', 'test', 'end']);
  assert.deepEqual(visualEvents.map(function(event) { return event.type; }), ['hello', 'test', 'end']);
  assert.deepEqual(normalEvents[1].test.tags, ['@AC-001']);
  assert.equal(Object.prototype.hasOwnProperty.call(visualEvents[1].test, 'tags'), false);
  assert.deepEqual(visualEvents[1].test.attachments, [{ name: 'sdd-visual:checkout', contentType: 'image/png', path: 'current.png' }]);
  assert.deepEqual(visualEvents[1].test.errors, [{ message: 'ignored detail' }]);
});

test('共享 Reporter factory 只负责固定生命周期，payload 与 capability 仍由 wrapper 固定', () => {
  const lifecycle = require('../src/verification/adapters/playwright-shared/reporter-lifecycle');
  assert.equal(typeof lifecycle.createReporter, 'function');

  const FactoryReporter = lifecycle.createReporter({
    errorMessage: 'fixed reporter configuration required',
    capability: 'fixed-capability',
    mapTest: function(testValue, resultValue) {
      return { id: testValue.id, marker: resultValue.status };
    }
  });
  const outputFile = eventFile('sdd-shared-reporter-');
  const reporter = new FactoryReporter({ outputFile: outputFile, nonce: 'shared-nonce', capability: 'untrusted' });
  reporter.onBegin();
  reporter.onTestEnd({ id: 'case-2' }, { status: 'passed' });
  reporter.onEnd({ status: 'passed' });

  assert.deepEqual(readEvents(outputFile), [
    { type: 'hello', nonce: 'shared-nonce', handshakeVersion: 1, capabilities: ['fixed-capability'] },
    { type: 'test', test: { id: 'case-2', marker: 'passed' } },
    { type: 'end', status: 'passed' }
  ]);
});
