'use strict';

var errors = require('../../errors');

function acTags(tags) {
  return (tags || []).map(String).filter(function(tag) { return /^@AC-\d+$/i.test(tag); })
    .map(function(tag) { return tag.slice(1).toUpperCase(); });
}

function aggregate(input) {
  var targets = input.targetAcIds.map(function(id) { return id.toUpperCase(); });
  var known = (input.knownAcIds || targets).map(function(id) { return id.toUpperCase(); });
  var testExecutions = input.tests.map(function(test) {
    var ids = Array.from(new Set(acTags(test.tags))).sort();
    ids.forEach(function(id) {
      if (known.indexOf(id) === -1) errors.fail('UNKNOWN_AC_TAG', 'test contains an unknown AC tag', { acId: id, testId: test.id });
    });
    var stablePass = test.status === 'passed' && test.expectedStatus === 'passed' && test.retry === 0;
    return Object.assign({}, test, { acIds: ids, stablePass: stablePass });
  });
  var acExecutions = [];
  targets.forEach(function(acId) {
    input.projects.forEach(function(project) {
      var matches = testExecutions.filter(function(test) {
        return test.project === project && test.acIds.indexOf(acId) !== -1;
      });
      if (!matches.length) errors.fail('AC_NOT_COVERED', 'target AC has no executed test in project', { acId: acId, project: project });
      acExecutions.push({ acId: acId, project: project, testIds: matches.map(function(test) { return test.id; }),
        status: matches.every(function(test) { return test.stablePass; }) ? 'passed' : 'failed' });
    });
  });
  var interrupted = testExecutions.some(function(test) { return test.status === 'interrupted'; });
  var passed = acExecutions.every(function(ac) { return ac.status === 'passed'; });
  return {
    status: interrupted ? 'interrupted' : passed ? 'passed' : 'failed',
    gateDecision: interrupted ? 'BLOCKED' : passed ? 'PASS' : 'FAIL',
    acExecutions: acExecutions,
    testExecutions: testExecutions
  };
}

module.exports = { aggregate: aggregate, acTags: acTags };
