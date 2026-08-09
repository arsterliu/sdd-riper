const assert = require('node:assert/strict');
const test = require('node:test');

const standardContract = require('../src/verification/adapters/playwright-test/result-contract');
const visualContract = require('../src/verification/adapters/playwright-visual/result-contract');

const cases = [
  {
    name: 'timeout 优先于其他终态',
    processResult: { status: 1, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' } },
    endEvent: { type: 'end', status: 'failed' },
    expected: { status: 'blocked', gateDecision: 'BLOCKED', code: 'PROCESS_TIMEOUT' }
  },
  {
    name: 'signal 在 Reporter end 前失败关闭',
    processResult: { status: null, signal: 'SIGTERM' },
    endEvent: { type: 'end', status: 'passed' },
    expected: { status: 'interrupted', gateDecision: 'BLOCKED', code: 'PROCESS_INTERRUPTED' }
  },
  {
    name: '缺失 Reporter end 失败关闭',
    processResult: { status: 0, signal: null },
    endEvent: null,
    expected: { status: 'blocked', gateDecision: 'BLOCKED', code: 'REPORTER_END_MISSING' }
  },
  {
    name: '中断 Reporter end 为 blocked',
    processResult: { status: 0, signal: null },
    endEvent: { type: 'end', status: 'interrupted' },
    expected: { status: 'interrupted', gateDecision: 'BLOCKED', code: 'REPORTER_INTERRUPTED' }
  },
  {
    name: '失败 Reporter end 优先于非零退出',
    processResult: { status: 1, signal: null },
    endEvent: { type: 'end', status: 'failed' },
    expected: { status: 'failed', gateDecision: 'FAIL', code: 'REPORTER_END_FAILED' }
  },
  {
    name: '通过 Reporter end 配合非零退出为 blocked',
    processResult: { status: 1, signal: null },
    endEvent: { type: 'end', status: 'passed' },
    expected: { status: 'blocked', gateDecision: 'BLOCKED', code: 'PROCESS_EXIT_NONZERO' }
  },
  {
    name: '仅干净终态为 PASS',
    processResult: { status: 0, signal: null },
    endEvent: { type: 'end', status: 'passed' },
    expected: { status: 'passed', gateDecision: 'PASS', code: '' }
  }
];

test('现有普通与 Visual result-contract 对受控终态保持完全等价', () => {
  for (const item of cases) {
    assert.deepEqual(standardContract.evaluate(item.processResult, item.endEvent), item.expected, item.name + ' ordinary');
    assert.deepEqual(visualContract.evaluate(item.processResult, item.endEvent), item.expected, item.name + ' visual');
  }
});

test('共享 evaluator 保持两个旧入口的精确结果形状与优先级', () => {
  const shared = require('../src/verification/adapters/playwright-shared/process-result');

  for (const item of cases) {
    assert.deepEqual(shared.evaluateProcessResult(item.processResult, item.endEvent), item.expected, item.name);
  }
});
