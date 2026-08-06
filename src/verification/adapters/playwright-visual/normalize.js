'use strict';

var errors = require('../../errors');

function invalid(message, details) { errors.fail('VISUAL_REPORT_INVALID', message, details); }

function stablePass(test) {
  return test.status === 'passed' && test.expectedStatus === 'passed' && test.retry === 0;
}

function screenshotAttachment(test, scenarioId) {
  var expectedName = 'sdd-visual:' + scenarioId;
  var matches = (test.attachments || []).filter(function(attachment) { return attachment && attachment.name === expectedName; });
  if (matches.length !== 1 || matches[0].contentType !== 'image/png' || typeof matches[0].path !== 'string' || !matches[0].path) {
    invalid('visual scenario must emit exactly one PNG current screenshot', { scenarioId: scenarioId, testId: test.id });
  }
  return { name: matches[0].name, contentType: matches[0].contentType, path: matches[0].path };
}

function aggregate(input) {
  if (!input || !Array.isArray(input.bindings) || !Array.isArray(input.tests)) invalid('visual reporter input is invalid');
  var bindings = {};
  input.bindings.forEach(function(binding) {
    if (!binding || typeof binding.scenarioId !== 'string' || !binding.scenarioId || bindings[binding.scenarioId]) invalid('visual scenario bindings must be unique');
    bindings[binding.scenarioId] = binding;
  });
  input.tests.forEach(function(test) {
    (test.attachments || []).filter(function(attachment) { return attachment && typeof attachment.name === 'string' && attachment.name.startsWith('sdd-visual:'); }).forEach(function(attachment) {
      var scenarioId = attachment.name.slice('sdd-visual:'.length);
      if (!bindings[scenarioId]) invalid('reporter emitted an unknown visual scenario', { scenarioId: scenarioId, testId: test.id });
    });
  });
  var scenarioExecutions = Object.keys(bindings).sort().map(function(scenarioId) {
    var binding = bindings[scenarioId];
    var matches = input.tests.filter(function(test) { return test.title === binding.testTitle && test.project === binding.project; });
    if (matches.length !== 1) invalid('visual binding must match exactly one executed test', { scenarioId: scenarioId });
    var current = screenshotAttachment(matches[0], scenarioId);
    if (!stablePass(matches[0])) return { scenarioId: scenarioId, project: binding.project, status: 'failed' };
    return { scenarioId: scenarioId, project: binding.project, current: current, status: 'passed' };
  });
  var passed = scenarioExecutions.every(function(item) { return item.status === 'passed'; });
  return { status: passed ? 'passed' : 'failed', gateDecision: passed ? 'PASS' : 'FAIL', scenarioExecutions: scenarioExecutions };
}

module.exports = { aggregate: aggregate };
