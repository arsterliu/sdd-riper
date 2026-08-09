var fs = require('fs');
var artifactSnapshot = require('./artifact-snapshot');
var common = require('../../lib/common');
var learning = require('./learning');
var reviewerGuidance = require('./reviewer-guidance');
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

function actionForTarget(target) {
  return 'repair_' + String(target || 'Research')
    .toLowerCase()
    .replace(/ \/ /g, '_')
    .replace(/\s+/g, '_');
}

function gateForVerdict(verdict) {
  return {
    Research: 'research',
    Design: 'design',
    Acceptance: 'acceptance',
    Plan: 'plan',
    'Execute / Debug': 'execute',
    'Execute Log': 'completion',
    'Learning Check': 'learning'
  }[governanceContract.backtrackTarget(verdict)] || 'challenge';
}

function blockerCode(issue, verdict) {
  var detail = String(issue || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return verdict + (detail ? '_' + detail : '');
}

function phaseFor(target, action, status) {
  if (status === 'archived') return 'archived';
  if (action === 'request_archive_authorization') return 'archive_authorization';
  if (action === 'run_challenge') return 'challenge';
  return {
    Research: 'research',
    Innovate: 'innovate',
    Design: 'design',
    Acceptance: 'acceptance',
    Plan: 'plan',
    'Execute / Debug': 'execute',
    'Execute Log': 'execute',
    'Learning Check': 'learning',
    Ready: 'archive_authorization'
  }[target] || 'research';
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

function latestCompletionBlock(content) {
  var block = '';
  common.scanExecuteLog(content).forEach(function(step) {
    if (step.isCompletion) block = step.content;
  });
  return block;
}

function completionContractIssues(content) {
  var block = latestCompletionBlock(content);
  if (!block) return ['Execute Log completion-verification is missing.'];
  var issues = [];
  var requiredLabels = ['Status', 'Result', 'Four-Axis Checklist', 'Verification', 'Timestamp'];
  requiredLabels.forEach(function(label) {
    var re = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[ \\t]*(.*)$', 'mi');
    var found = block.match(re);
    if (!found || (label !== 'Four-Axis Checklist' && !found[1].trim())) {
      issues.push('completion-verification missing ' + label + '.');
    }
  });
  ['Axis 0 (Intake): aligned', 'Axis 1 (Design/Acceptance/Plan): complete', 'Axis 2 (Code Diff): within boundary', 'Axis 3 (Execute Log): faithful'].forEach(function(axis) {
    if (block.indexOf(axis) === -1) issues.push('completion-verification missing ' + axis + '.');
  });
  var timestamp = artifactSnapshot.labelValue(block, 'Timestamp');
  if (timestamp && !workflowGateFacts.isValidIsoTimestamp(timestamp)) {
    issues.push('completion-verification Timestamp must be valid ISO-8601.');
  }
  return issues;
}

function acCoverageRecords(executeLogContent) {
  return workflowGateFacts.acCoverageRecords(executeLogContent);
}

function acCoverageContractIssues(acCoverage, projectDir) {
  var map = workflowGateFacts.coverageRecordMap(acCoverage.records);
  var issues = [];
  acCoverage.declarations.forEach(function(declaration) {
    var id = declaration.id;
    var record = map[id];
    if (!record) {
      issues.push('AC Coverage: ' + id + ' has no execution evidence in Execute Log.');
      return;
    }
    if (record.result === 'FAIL') {
      issues.push('AC Coverage: ' + id + ' verification failed.');
      return;
    }
    if (record.result === 'SKIPPED') {
      if (!record.approvedBy) issues.push('AC Coverage: ' + id + ' is SKIPPED but missing Approved By.');
      else if (!/^human:[^:\s]+$/i.test(record.approvedBy)) issues.push('AC Coverage: ' + id + ' is SKIPPED; Approved By must be human:<name>.');
      if (!record.approvedAt) issues.push('AC Coverage: ' + id + ' is SKIPPED but missing Approved At.');
      else if (!workflowGateFacts.isValidIsoTimestamp(record.approvedAt)) issues.push('AC Coverage: ' + id + ' is SKIPPED but Approved At must be valid ISO-8601.');
      if (!record.reason) issues.push('AC Coverage: ' + id + ' is SKIPPED but missing Reason.');
      return;
    }
    if (record.test && projectDir) {
      var testPath = common.resolveProjectPath(projectDir, record.test);
      if (testPath && !fs.existsSync(testPath)) issues.push('AC Coverage: ' + id + ' Test file not found: ' + record.test);
    }
  });
  return issues;
}

function readyAction(verdict, validationIssues) {
  if (governanceContract.isPassingVerdict(verdict) && (!validationIssues || !validationIssues.length)) {
    return { target: 'Ready', action: 'request_archive_authorization' };
  }
  return null;
}

function sectionText(content, heading) {
  var escaped = String(heading).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var match = String(content || '').match(new RegExp('^## ' + escaped + '\\s*\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))', 'm'));
  return match ? match[1] : '';
}

function firstRealLine(content) {
  return String(content || '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/).map(function(line) {
    return line.trim();
  }).find(function(line) {
    return line && !/^#+\s/.test(line) && !line.startsWith('|') && !/^[-:]+$/.test(line) && !/^[A-Za-z][A-Za-z0-9 /&_-]*:\s*$/.test(line);
  }) || '';
}

function isAuditableReviewer(value, mode) {
  return governanceContract.isAuditableReviewer(mode, value);
}

function gateFromIssue(issue) {
  var text = String(issue || '');
  if (/Visual evidence is not ready for Plan/i.test(text)) return 'plan';
  if (/Challenge|Adversarial/i.test(text)) return 'challenge';
  if (/Learning/i.test(text)) return 'learning';
  if (/completion-verification|Completion Verification|AC Coverage/i.test(text)) return 'completion';
  if (/Execute Log/i.test(text)) return 'execute';
  if (/Innovate/i.test(text)) return 'innovate';
  if (/Research|Confirmed Requirement|Intake|Spec file/i.test(text)) return 'research';
  if (/Technical Design|Design Note|design-file|Design file/i.test(text)) return 'design';
  if (/Acceptance Criteria|Automated Acceptance|E2E Acceptance|Manual Acceptance/i.test(text)) return 'acceptance';
  if (/Plan Approved|Approved At|Gate Evidence|Micro Plan/i.test(text)) return 'plan';
  return gateForVerdict(classifyIssue(text));
}

function targetForGate(gate) {
  return {
    research: 'Research',
    innovate: 'Innovate',
    design: 'Design',
    acceptance: 'Acceptance',
    plan: 'Plan',
    execute: 'Execute / Debug',
    completion: 'Execute Log',
    challenge: 'Challenge',
    learning: 'Learning Check'
  }[gate] || 'Research';
}

function directGateBlockers(snapshot, gateFacts) {
  var blockers = [];
  var mode = gateFacts.mode;
  var content = snapshot.content || '';
  function add(gate, message, target, verdict) {
    verdict = verdict || classifyIssue(message);
    blockers.push({
      code: blockerCode(message, verdict),
      gate: gate,
      target: target || targetForGate(gate),
      message: message,
      severity: 'error'
    });
  }
  if (!snapshot.exists) {
    add('research', 'Spec file not found.', 'Research', 'FAIL_SPEC');
    return blockers;
  }

  if (snapshot.location === 'active' && snapshot.status === 'archived') {
    add('research', 'Active Spec cannot declare status: archived; use sdd archive so the Spec and referenced artifacts move together.', 'Research', 'FAIL_SPEC');
  }

  if (snapshot.isGitRepo && !/^diff-base:[ \t]*"[^"]+"/m.test(content)) {
    add('research', 'Missing diff-base frontmatter; Review cannot reliably know the task diff range.', 'Research', 'FAIL_SPEC');
  }
  if (/<!-- \(not filled\) -->|\[TBD\]/.test(content)) {
    add('research', 'Spec still contains unresolved placeholders.', 'Research', 'FAIL_SPEC');
  }

  if (mode === 'micro') {
    if (!gateFacts.research.intakePresent) add('research', 'Intake is empty.', 'Research', 'FAIL_SPEC');
  } else {
    gateFacts.research.confirmedRequirement.gateMissingLabels.forEach(function(label) {
      add('research', 'Confirmed Requirement missing ' + label + '.', 'Research', 'FAIL_SPEC');
    });
    var reviewer = gateFacts.research.reviewer;
    var researchBy = reviewer.reviewedBy;
    var researchAt = reviewer.reviewedAt;
    if (!researchBy) add('research', 'Research Reviewed By is empty. ' + reviewerGuidance.inlineGuidance(), 'Research', 'FAIL_SPEC');
    else if (!reviewer.auditable) add('research', 'Research Gate requires independent reviewer evidence (use subagent:<id>, external-agent:<id>, or human:<name>). ' + reviewerGuidance.inlineGuidance(), 'Research', 'FAIL_SPEC');
    if (!researchAt) add('research', 'Research Reviewed At is empty.', 'Research', 'FAIL_SPEC');
    else if (!reviewer.timestampValid) add('research', 'Research Reviewed At must be valid ISO-8601.', 'Research', 'FAIL_SPEC');
  }

  if (mode !== 'micro') {
    var innovate = gateFacts.innovate;
    if (!innovate.present) {
      add('innovate', mode === 'lite' ? 'Innovate Options must contain options or an explicit skip reason.' : 'Innovate Options is empty.', 'Innovate', 'FAIL_SPEC');
    } else if (mode === 'standard' && innovate.skipped) {
      add('innovate', 'Standard mode cannot skip Innovate Options.', 'Innovate', 'FAIL_SPEC');
    } else if (mode === 'lite' && innovate.skipped && !innovate.skipReasonPresent) {
      add('innovate', 'Skipped Innovate Options must include Reason.', 'Innovate', 'FAIL_SPEC');
    }
  }

  if (mode !== 'micro') {
    var design = gateFacts.design;
    if (!design.exists) {
      add('design', 'Design file not found.', 'Design', 'FAIL_DESIGN');
    } else {
      design.missingLabels.forEach(function(label) {
        add('design', (mode === 'lite' ? 'Design Note' : 'Technical Design') + ' missing ' + label + '.', 'Design', 'FAIL_DESIGN');
      });
    }
  }

  gateFacts.acceptance.issues.forEach(function(issue) {
    add('acceptance', issue, 'Acceptance', 'FAIL_ACCEPTANCE');
  });
  var verificationReadiness = gateFacts.providerReadiness;
  verificationReadiness.issues.filter(function(issue) {
    return /^E2E Acceptance Criteria require Provider/.test(issue);
  }).forEach(function(issue) { add('acceptance', issue, 'Acceptance', 'FAIL_ACCEPTANCE'); });
  verificationReadiness.missingProviders.forEach(function(providerId) {
    var planText = sectionText(content, 'Plan');
    var planned = planText.indexOf('sdd verify init') !== -1 && planText.indexOf(providerId) !== -1;
    if (!planned) add('plan', 'Verification Provider is not configured and Plan has no explicit init step: ' + providerId + '.', 'Plan', 'FAIL_PLAN');
  });
  if (verificationReadiness.state === 'blocked') {
    verificationReadiness.issues.forEach(function(issue) {
      add('completion', issue, 'Execute Log', 'FAIL_LOG');
    });
  }

  if (mode === 'micro') {
    gateFacts.microPlan.missingLabels.forEach(function(label) {
      add('plan', 'Micro Plan must include ' + label + '.', 'Plan', 'FAIL_PLAN');
    });
  }

  var approval = gateFacts.planApproval;
  if (!approval.approvedBy) add('plan', 'Plan Approved By is empty.', 'Plan', 'FAIL_PLAN');
  else if (!approval.agent && !approval.human) add('plan', 'Plan Approved By must be agent:<id> or human:<name>.', 'Plan', 'FAIL_PLAN');
  else if ((snapshot.approvalPolicy || 'agent') === 'human' && !approval.human) add('plan', 'Human approval policy requires Plan Approved By: human:<name>.', 'Plan', 'FAIL_PLAN');
  if (!approval.approvedAt) add('plan', 'Approved At is empty.', 'Plan', 'FAIL_PLAN');
  if (approval.agent && !approval.evidence) add('plan', 'Gate Evidence is required for agent approval.', 'Plan', 'FAIL_PLAN');

  var logContent = snapshot.executeLog && snapshot.executeLog.content || '';
  if (!gateFacts.execution.exists || !gateFacts.execution.present) {
    add('execute', 'Execute Log is empty.', 'Execute / Debug', 'FAIL_LOG');
    return blockers;
  }

  if (!gateFacts.completion.done) add('completion', 'Execute Log completion-verification is not DONE.', 'Execute Log', 'FAIL_LOG');
  completionContractIssues(logContent).forEach(function(issue) { add('completion', issue, 'Execute Log', 'FAIL_LOG'); });
  acCoverageContractIssues(gateFacts.acCoverage, snapshot.projectDir).forEach(function(issue) { add('completion', issue, 'Execute Log', 'FAIL_LOG'); });
  var completionBlocked = blockers.some(function(blocker) { return blocker.gate === 'completion'; });
  if (!completionBlocked) {
    challengeContractIssues(content).forEach(function(issue) { add('challenge', issue, 'Challenge', 'FAIL_LOG'); });
    var executedBy = artifactSnapshot.labelValue(content, 'Challenge Executed By');
    var executedAt = artifactSnapshot.labelValue(content, 'Challenge Executed At');
    var challengeCommand = ' Run: sdd challenge <project-dir>, then record the independent result with: sdd challenge <project-dir> --record-result "VERDICT" --summary "..." --executed-by "subagent:<id>|external-agent:<id>|human:<name>|inline". ' + reviewerGuidance.inlineGuidance();
    if (!executedBy) add('challenge', 'Challenge has not been executed: Challenge Executed By is empty.' + challengeCommand, 'Challenge', 'FAIL_LOG');
    else if (!isAuditableReviewer(executedBy, mode)) add('challenge', 'Challenge requires independent reviewer evidence (use subagent:<id>, external-agent:<id>, or human:<name>). ' + reviewerGuidance.inlineGuidance(), 'Challenge', 'FAIL_LOG');
    if (!executedAt) {
      add('challenge', 'Challenge Executed At is empty.' + challengeCommand, 'Challenge', 'FAIL_LOG');
    } else if (Number.isNaN(Date.parse(executedAt))) {
      add('challenge', 'Challenge Executed At is not a valid ISO-8601 timestamp.', 'Challenge', 'FAIL_LOG');
    } else {
      var lastStep = common.extractLastStepTimestamp(logContent);
      if (lastStep && new Date(executedAt) <= lastStep) add('challenge', 'Challenge Executed At must be after the last Execute Log step timestamp.' + challengeCommand, 'Challenge', 'FAIL_LOG');
    }
    var challenge = challengeFacts(content);
    if (challenge.allowed && !challenge.passed) add('challenge', 'Adversarial Challenge failed: ' + challenge.verdict + '.', governanceContract.backtrackTarget(challenge.verdict), challenge.verdict);
  }

  var challengeFactsValue = challengeFacts(content);
  var triggers = gateFacts.learning.triggers;
  if (triggers.length) {
    if (!snapshot.learning || !snapshot.learning.exists) {
      add('learning', 'Learning Record is required because: ' + triggers.join(', ') + '.', 'Learning Check', 'FAIL_LEARNING');
    } else {
      learning.validateLearningContent(sectionText(snapshot.learning.content, 'Learning Record')).forEach(function(issue) { add('learning', issue, 'Learning Check', 'FAIL_LEARNING'); });
    }
  }
  return blockers;
}

function evaluate(snapshot, options) {
  options = options || {};
  snapshot = snapshot || { exists: false, content: '', status: 'draft' };
  var gateFacts = options.gateFacts || workflowGateFacts.collectGateFacts(snapshot);
  var blockers = directGateBlockers(snapshot, gateFacts);
  (options.validationIssues || []).forEach(function(issue) {
    if (blockers.some(function(blocker) { return blocker.message === issue; })) return;
    var issueVerdict = classifyIssue(issue);
    var gate = gateFromIssue(issue);
    blockers.push({
      code: blockerCode(issue, issueVerdict),
      gate: gate,
      target: targetForGate(gate),
      message: issue,
      severity: 'error'
    });
  });
  var facts = challengeFacts(snapshot.content || '');
  var gates = {};
  ['research', 'innovate', 'design', 'acceptance', 'plan', 'execute', 'completion', 'challenge', 'learning'].forEach(function(gate) {
    var gateBlockers = blockers.filter(function(blocker) { return blocker.gate === gate; });
    gates[gate] = { state: gateBlockers.length ? 'blocked' : 'pass', blockers: gateBlockers };
  });
  if (facts.allowed && !facts.passed) gates.challenge.state = 'failed';

  var verdict = facts.allowed ? facts.verdict : verdictFromIssues(blockers.map(function(blocker) { return blocker.message; }));
  var target = 'Ready';
  var action = 'request_archive_authorization';
  var orderedGates = ['research', 'innovate', 'design', 'acceptance', 'plan', 'execute', 'completion'];
  var firstBlocked = orderedGates.find(function(gate) { return gates[gate].state === 'blocked'; });
  var challengeNeedsRerun = gates.challenge.blockers.some(function(blocker) {
    return blocker.target === 'Challenge';
  });
  if (firstBlocked) {
    target = gates[firstBlocked].blockers[0].target || targetForGate(firstBlocked);
    action = actionForTarget(target);
  } else if (options.challengeRequired || challengeNeedsRerun || gates.challenge.state === 'blocked') {
    target = 'Challenge';
    action = 'run_challenge';
  } else if (gates.challenge.state === 'failed') {
    target = governanceContract.backtrackTarget(facts.verdict) || 'Execute / Debug';
    action = actionForTarget(target);
  } else if (gates.learning.state === 'blocked') {
    target = 'Learning Check';
    action = actionForTarget(target);
  } else if (!facts.passed) {
    target = 'Challenge';
    action = 'run_challenge';
  }

  return {
    phase: phaseFor(target, action, snapshot.location === 'active' && snapshot.status === 'archived' ? 'draft' : snapshot.status),
    nextAction: action,
    backtrackTarget: target,
    completionReady: action === 'request_archive_authorization' && blockers.length === 0,
    challengeVerdict: verdict,
    gates: gates,
    blockers: blockers,
    facts: {
      challenge: facts,
      completion: { done: gates.completion.state === 'pass' },
      providerReadiness: gateFacts.providerReadiness,
      learningRequired: gateFacts.learning.triggers.length > 0
    }
  };
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
  VERDICTS: VERDICTS,
  VERDICT_TO_TARGET: VERDICT_TO_TARGET,
  challengeFacts: challengeFacts,
  planApprovalFacts: workflowGateFacts.planApprovalFacts,
  challengeContractIssues: challengeContractIssues,
  completionContractIssues: completionContractIssues,
  acCoverageRecords: acCoverageRecords,
  classifyIssue: classifyIssue,
  verdictFromIssues: verdictFromIssues,
  readyAction: readyAction,
  evaluate: evaluate,
  evaluateProjectSpec: evaluateProjectSpec,
  readSnapshot: artifactSnapshot.read
};
