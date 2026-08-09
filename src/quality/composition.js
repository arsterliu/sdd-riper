'use strict';

var readiness = require('../verification/readiness');

function attachReadiness(loaded, projectDir, specPath, deps) {
  if (loaded.blocking) return;
  var e2e = (loaded.acFacts || []).filter(function(ac) { return ac.verification === 'e2e'; });
  if (!e2e.length) return;
  var unbound = e2e.filter(function(ac) { return !ac.provider; });
  if (unbound.length) {
    loaded.diagnostics = loaded.diagnostics || [];
    loaded.diagnostics.push({
      code: 'e2e-provider-unbound',
      severity: 'attention',
      message: 'E2E Acceptance Criteria require Provider for: ' + unbound.map(function(ac) {
        return ac.acId;
      }).join(', ') + '.'
    });
    return;
  }
  if (readiness.isAssessment(deps.assessment)) {
    loaded.e2eReadiness = deps.assessment.summary;
    return;
  }
  if (deps.readinessSummary) {
    loaded.e2eReadiness = deps.readinessSummary;
    return;
  }
  loaded.e2eReadiness = deps.inspectReadiness(loaded.specContent, projectDir, specPath);
}

function composeQualityPlan(projectDir, specPath, deps) {
  deps = deps || {};
  var loaded = deps.loadQualityInput(projectDir, specPath);
  try {
    attachReadiness(loaded, projectDir, specPath, deps);
  } catch (error) {
    if (!deps.onReadinessUnavailable) throw error;
    deps.onReadinessUnavailable(loaded, error);
  }
  return deps.buildQualityPlan(loaded);
}

module.exports = {
  attachReadiness: attachReadiness,
  composeQualityPlan: composeQualityPlan
};
