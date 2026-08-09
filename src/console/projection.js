'use strict';

var fs = require('fs');
var common = require('../../lib/common');
var qualityComposition = require('../quality/composition');
var workflowGateFacts = require('../core/workflow-gate-facts');

var safeMessage = require('../verification/evidence').safeMessage;

function safeList(values) {
  return Array.isArray(values) ? values.map(function(value) { return safeMessage(value); }) : [];
}

function projectReadiness(value) {
  if (!value) return null;
  return {
    state: safeMessage(value.state),
    requiredProviders: safeList(value.requiredProviders),
    missingProviders: safeList(value.missingProviders),
    issues: safeList(value.issues)
  };
}

function diagnosticRecovery(code) {
  if (code === 'readiness-unavailable') {
    return 'Review existing verification configuration and evidence before retrying.';
  }
  return 'Review the existing Quality Plan input before retrying.';
}

function projectDiagnostics(values) {
  return (values || []).map(function(item) {
    item = item || {};
    var value = {
      code: safeMessage(item.code || 'quality-plan-unavailable'),
      severity: safeMessage(item.severity || 'attention'),
      message: safeMessage(item.message || 'Quality Plan cannot be projected safely.')
    };
    if (item.recovery) value.recovery = diagnosticRecovery(item.code);
    return value;
  });
}

function projectAcFacts(values) {
  return (values || []).map(function(item) {
    item = item || {};
    return {
      acId: safeMessage(item.acId || ''),
      verification: safeMessage(item.verification || ''),
      provider: safeMessage(item.provider || '')
    };
  });
}

function projectFocusReason(value) {
  value = value || {};
  var kind = safeMessage(value.kind || '');
  if (kind === 'role') {
    return {
      kind: kind,
      unitId: safeMessage(value.unitId || ''),
      role: safeMessage(value.role || '')
    };
  }
  if (kind === 'relation') {
    return {
      kind: kind,
      from: safeMessage(value.from || ''),
      to: safeMessage(value.to || ''),
      relationKind: safeMessage(value.relationKind || '')
    };
  }
  return null;
}

function projectPolicyFocus(values) {
  return (values || []).map(function(item) {
    item = item || {};
    return {
      id: safeMessage(item.id || ''),
      recommendedCapabilities: safeList(item.recommendedCapabilities),
      reasons: (item.reasons || []).map(projectFocusReason).filter(Boolean)
    };
  });
}

function projectAcMappings(values) {
  return (values || []).map(function(item) {
    item = item || {};
    return {
      acId: safeMessage(item.acId || ''),
      verification: safeMessage(item.verification || ''),
      verificationCapability: safeMessage(item.verificationCapability || '')
    };
  });
}

function unavailableQualityPlan() {
  return {
    schemaVersion: 1,
    state: 'unavailable',
    policyVersion: '',
    source: null,
    acFacts: [],
    policyFocus: [],
    acMappings: [],
    e2eReadiness: null,
    diagnostics: [{
      code: 'quality-plan-unavailable',
      severity: 'attention',
      message: 'Quality Plan cannot be projected safely.',
      recovery: 'Review the existing Quality Plan input before retrying.'
    }]
  };
}

function skipApprovalState(record) {
  if (!record || record.result !== 'SKIPPED') return 'not_applicable';
  return /^human:[^:\s]+$/i.test(record.approvedBy || '') && workflowGateFacts.isValidIsoTimestamp(record.approvedAt) && !!record.reason
    ? 'approved' : 'incomplete';
}

function invalidCoverageEvidence(record, projectDir, fileSystem) {
  if (!record || !record.test || !projectDir) return false;
  var testPath = common.resolveProjectPath(projectDir, record.test);
  return !!testPath && !fileSystem.existsSync(testPath);
}

function addCoverageDiagnostic(diagnostics, code) {
  if (!diagnostics.some(function(item) { return item.code === code; })) diagnostics.push({ code: code });
}

function unavailableAcCoverage() {
  return {
    schemaVersion: 1,
    completionState: 'missing',
    items: [],
    diagnostics: [{ code: 'ac-coverage-unavailable' }]
  };
}

function validCoverageFacts(coverage) {
  if (!coverage || !Array.isArray(coverage.declarations) || !Array.isArray(coverage.records)) return false;
  return coverage.declarations.every(function(declaration) {
    return declaration && /^AC-\d+$/i.test(String(declaration.id || ''));
  }) && coverage.records.every(function(record) {
    return record && /^AC-\d+$/i.test(String(record.id || '')) &&
      /^(PASS|FAIL|SKIPPED)$/.test(String(record.result || '')) &&
      Array.isArray(record.scenarios);
  });
}

function acCoverageView(snapshot, deps) {
  snapshot = snapshot || {};
  deps = deps || {};
  try {
    var coverage = (deps.coverageFacts || workflowGateFacts.coverageFacts)(snapshot);
    if (!validCoverageFacts(coverage)) return unavailableAcCoverage();
    var declarations = coverage.declarations;
    var recordMap = workflowGateFacts.coverageRecordMap(coverage.records);
    var completionState = declarations.some(function(declaration) {
      return !!recordMap[declaration.id];
    }) ? 'recorded' : 'missing';
    var diagnostics = [];
    if (completionState === 'missing') addCoverageDiagnostic(diagnostics, 'ac-coverage-records-missing');
    var fileSystem = deps.fs || fs;
    var items = declarations.map(function(declaration) {
      var record = recordMap[declaration.id];
      var state = 'missing';
      if (record) {
        if (record.result === 'FAIL') state = 'fail';
        else if (record.result === 'SKIPPED') state = 'skipped';
        else if (invalidCoverageEvidence(record, snapshot.projectDir, fileSystem)) {
          state = 'invalid';
          addCoverageDiagnostic(diagnostics, 'ac-coverage-invalid-evidence');
        } else state = 'pass';
      }
      var approval = skipApprovalState(record);
      if (approval === 'incomplete') addCoverageDiagnostic(diagnostics, 'ac-coverage-skip-approval-incomplete');
      return {
        acId: String(declaration.id).toUpperCase(),
        state: state,
        skipApprovalState: approval
      };
    });
    return {
      schemaVersion: 1,
      completionState: completionState,
      items: items,
      diagnostics: diagnostics
    };
  } catch (_) {
    return unavailableAcCoverage();
  }
}

function workStateForSpec(spec) {
  var workflow = spec && spec.workflow || {};
  var challenge = workflow.facts && workflow.facts.challenge || {};
  var planGate = workflow.gates && workflow.gates.plan || {};
  var planBlockers = Array.isArray(planGate.blockers) ? planGate.blockers : [];
  if ((spec && spec.status === 'archived') || workflow.phase === 'archived') {
    return { id: 'archived', label: 'Archived', tone: 'complete' };
  }
  if (workflow.phase === 'archive_authorization' || spec && spec.phase === 'archive_authorization' ||
      workflow.nextAction === 'request_archive_authorization') {
    return { id: 'awaiting_archive_authorization', label: 'Awaiting archive authorization', tone: 'waiting' };
  }
  if (challenge.allowed && /^FAIL_/.test(String(challenge.verdict || ''))) {
    return { id: 'needs_repair', label: 'Needs repair', tone: 'waiting' };
  }
  if ((workflow.phase || (spec && spec.phase)) === 'plan' && planBlockers.length && planBlockers.every(function(blocker) {
    return /^(Plan Approved By|Approved At|Gate Evidence)/.test(String(blocker && blocker.message || ''));
  })) {
    return { id: 'awaiting_plan_approval', label: 'Awaiting plan approval', tone: 'waiting' };
  }
  if (workflow.phase === 'challenge' || workflow.nextAction === 'run_challenge') {
    return { id: 'awaiting_challenge', label: 'Awaiting challenge', tone: 'waiting' };
  }
  return { id: 'in_progress', label: 'In progress', tone: 'progress' };
}

function projectProfileView(projectDir, deps) {
  var resolved;
  try {
    resolved = deps.resolveCurrent(projectDir);
  } catch (error) {
    return {
      schemaVersion: 1,
      state: 'invalid',
      revision: '',
      digest: '',
      unitCount: 0,
      relationCount: 0,
      units: [],
      diagnostics: [{
        code: 'profile-invalid',
        severity: 'attention',
        message: 'Current Project Profile cannot be read.',
        recovery: 'Inspect and repair the current Profile pointer before continuing.'
      }]
    };
  }
  if (!resolved) {
    return {
      schemaVersion: 1,
      state: 'missing',
      revision: '',
      digest: '',
      unitCount: 0,
      relationCount: 0,
      units: [],
      diagnostics: [{
        code: 'profile-missing',
        severity: 'attention',
        message: 'No confirmed Project Profile is available.',
        recovery: 'Run the existing profile detect/review/confirm flow.'
      }]
    };
  }
  var revision = resolved.revision;
  var profile = revision.profile || {};
  return {
    schemaVersion: 1,
    state: 'confirmed',
    revision: resolved.current.revision,
    digest: revision.profileDigest,
    unitCount: (profile.units || []).length,
    relationCount: (profile.relations || []).length,
    units: (profile.units || []).map(function(unit) {
      return { id: safeMessage(unit.id || ''), roles: safeList(unit.roles) };
    }),
    diagnostics: []
  };
}

function qualityPlanView(spec, projectDir, specPath, deps) {
  if (spec && spec.status === 'archived') {
    return {
      schemaVersion: 1,
      state: 'not_applicable',
      policyVersion: '',
      source: null,
      acFacts: [],
      policyFocus: [],
      acMappings: [],
      e2eReadiness: null,
      diagnostics: [{
        code: 'quality-plan-not-applicable',
        severity: 'attention',
        message: 'Archived Specs do not generate a current Quality Plan.',
        recovery: 'Select an active Spec to inspect its current Quality Plan.'
      }]
    };
  }
  try {
    var plan = qualityComposition.composeQualityPlan(projectDir, specPath, {
      loadQualityInput: deps.loadQualityInput,
      inspectReadiness: deps.inspectReadiness,
      readinessSummary: deps.readinessSummary,
      assessment: deps.assessment,
      buildQualityPlan: deps.buildQualityPlan
    });
    var source = plan.source || {};
    var profile = source.profile || {};
    return {
      schemaVersion: 1,
      state: plan.blocking ? 'blocking' : 'available',
      policyVersion: safeMessage(plan.policyVersion || ''),
      source: {
        profileRevision: safeMessage(profile.revision || ''),
        profileDigest: safeMessage(profile.digest || ''),
        declaredAffectedUnits: safeList(source.declaredAffectedUnits),
        effectiveAffectedUnits: safeList(source.effectiveAffectedUnits)
      },
      acFacts: projectAcFacts(plan.acFacts),
      policyFocus: projectPolicyFocus(plan.policyFocus),
      acMappings: projectAcMappings(plan.acMappings),
      e2eReadiness: projectReadiness(plan.e2eReadiness),
      diagnostics: projectDiagnostics(plan.diagnostics)
    };
  } catch (error) {
    return unavailableQualityPlan();
  }
}

module.exports = {
  workStateForSpec: workStateForSpec,
  projectProfileView: projectProfileView,
  qualityPlanView: qualityPlanView,
  acCoverageView: acCoverageView
};
