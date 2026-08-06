'use strict';

function evaluate(processResult, endEvent) {
  processResult = processResult || {};
  if (processResult.error && processResult.error.code === 'ETIMEDOUT') return { status: 'blocked', gateDecision: 'BLOCKED', code: 'PROCESS_TIMEOUT' };
  if (processResult.signal) return { status: 'interrupted', gateDecision: 'BLOCKED', code: 'PROCESS_INTERRUPTED' };
  if (!endEvent || endEvent.type !== 'end') return { status: 'blocked', gateDecision: 'BLOCKED', code: 'REPORTER_END_MISSING' };
  if (endEvent.status === 'interrupted' || endEvent.status === 'timedout') return { status: 'interrupted', gateDecision: 'BLOCKED', code: 'REPORTER_INTERRUPTED' };
  if (endEvent.status !== 'passed') return { status: 'failed', gateDecision: 'FAIL', code: 'REPORTER_END_FAILED' };
  if (processResult.status !== 0) return { status: 'blocked', gateDecision: 'BLOCKED', code: 'PROCESS_EXIT_NONZERO' };
  return { status: 'passed', gateDecision: 'PASS', code: '' };
}

module.exports = { evaluate: evaluate };
