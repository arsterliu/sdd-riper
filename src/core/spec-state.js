var artifactSnapshot = require('./artifact-snapshot');
var governanceContract = require('./governance-contract');
var workflowGateFacts = require('./workflow-gate-facts');

var VERDICTS = Object.freeze(governanceContract.verdicts.slice());
var VERDICT_TO_TARGET = Object.freeze(VERDICTS.reduce(function(targets, verdict) {
  targets[verdict] = governanceContract.backtrackTarget(verdict);
  return targets;
}, {}));

function classifyIssue(issue) {
  var text = String(issue || '');
  if (/Visual evidence is not ready for Plan/i.test(text)) return 'FAIL_PLAN';
  var failedChallenge = text.match(/Adversarial Challenge failed:\s*(FAIL_[A-Z_]+)/i);
  if (failedChallenge) return failedChallenge[1].toUpperCase();
  if (/Challenge has not been executed|Challenge Verdict is (empty|invalid)|Challenge Summary is empty|Backtrack Target (is empty|does not match)|Challenge Evidence|Challenge Executed/i.test(text)) return 'FAIL_LOG';
  if (/hardcoded secret|injection risk|missing input validation|dead code|code duplication|Code Challenge/i.test(text)) return 'FAIL_CODE';
  if (/Research Reviewed By|Research Reviewed At|Research Gate|Confirmed Requirement|Intake|Spec file not found|Innovate/i.test(text)) return 'FAIL_SPEC';
  if (/Technical Design|Design Note|design-file|Design file/i.test(text)) return 'FAIL_DESIGN';
  if (/Learning Record|Learning Check|Learning file/i.test(text)) return 'FAIL_LEARNING';
  if (/completion-verification|Completion Verification|Execute Log/i.test(text)) return 'FAIL_LOG';
  if (/Acceptance Criteria|Verification|Automated Acceptance|E2E Acceptance|Manual Acceptance|AC Coverage/i.test(text)) return 'FAIL_ACCEPTANCE';
  if (/Plan Approved|Approved At|Gate Evidence|Micro Plan/i.test(text)) return 'FAIL_PLAN';
  if (/Learning/i.test(text)) return 'FAIL_LEARNING';
  return 'FAIL_SPEC';
}

function verdictFromIssues(issues) {
  if (!issues || !issues.length) {
    return VERDICTS.find(function(verdict) { return governanceContract.isPassingVerdict(verdict); }) || '';
  }
  var priority = VERDICTS.filter(function(verdict) { return !governanceContract.isPassingVerdict(verdict); });
  var found = issues.map(classifyIssue);
  for (var i = 0; i < priority.length; i++) {
    if (found.indexOf(priority[i]) !== -1) return priority[i];
  }
  return found[0] || 'FAIL_SPEC';
}

function challengeFacts(content) {
  var verdict = artifactSnapshot.labelValue(content, 'Challenge Verdict').toUpperCase();
  var summary = artifactSnapshot.labelValue(content, 'Challenge Summary');
  var target = artifactSnapshot.labelValue(content, 'Backtrack Target');
  var evidence = artifactSnapshot.labelValue(content, 'Challenge Evidence');
  return {
    verdict: verdict,
    summary: summary,
    target: target,
    evidence: evidence,
    allowed: governanceContract.isKnownVerdict(verdict),
    passed: governanceContract.isPassingVerdict(verdict),
    expectedTarget: governanceContract.backtrackTarget(verdict)
  };
}

function challengeContractIssues(content) {
  var facts = challengeFacts(content);
  var issues = [];
  if (!facts.verdict) {
    issues.push('Challenge Verdict is empty.');
    return issues;
  }
  if (!facts.allowed) {
    issues.push('Challenge Verdict is invalid; allowed values: ' + VERDICTS.join(', ') + '.');
    return issues;
  }
  if (!facts.summary) issues.push('Challenge Summary is empty.');
  if (!facts.target) {
    issues.push('Backtrack Target is empty.');
  } else if (facts.target !== facts.expectedTarget) {
    issues.push('Backtrack Target does not match Challenge Verdict; expected ' + facts.expectedTarget + '.');
  }
  if (!facts.evidence) {
    issues.push('Challenge Evidence is required for challenge execution.');
  } else {
    var expectedEvidence = facts.verdict + ' - ' + facts.summary;
    if (facts.evidence !== expectedEvidence) {
      issues.push('Challenge Evidence does not match Challenge Verdict and Challenge Summary.');
    }
  }
  return issues;
}

function evaluate(snapshot, options) {
  if (snapshot && snapshot.location === 'archive') {
    return { phase: 'archived', nextAction: 'historical_read_only', completionReady: false,
      backtrackTarget: '', challengeVerdict: '', blockers: [], facts: {} };
  }
  return require('./streamlined-state').evaluate(snapshot, options);
}

function evaluateProjectSpec(projectDir, specPath, options) {
  options = options || {};
  var snapshot = artifactSnapshot.read(projectDir, specPath, options);
  var validation = options.validation;
  if (!validation) {
    // Lazy loading avoids a module-initialization cycle because validate uses
    // the contract helpers exported above.
    validation = require('../commands/validate').validateSpec(specPath, {
      archiveReady: true,
      projectDir: projectDir
    });
  }
  if (validation.workflowState && !options.validationVerdict && !options.challengeRequired) {
    return validation.workflowState;
  }
  return evaluate(snapshot, {
    validationIssues: validation.issues || [],
    validationVerdict: options.validationVerdict,
    challengeRequired: options.challengeRequired
  });
}

module.exports = {
  VERDICTS, VERDICT_TO_TARGET, challengeFacts, challengeContractIssues,
  planApprovalFacts: workflowGateFacts.planApprovalFacts,
  acCoverageRecords: workflowGateFacts.acCoverageRecords,
  classifyIssue, verdictFromIssues, evaluate, evaluateProjectSpec,
  readSnapshot: artifactSnapshot.read
};
