'use strict';

var processResultContract = require('../playwright-shared/process-result');

function evaluate(processResult, endEvent) {
  return processResultContract.evaluateProcessResult(processResult, endEvent);
}

module.exports = { evaluate: evaluate };
