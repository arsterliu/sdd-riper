const fs = require('fs');
const common = require('../../lib/common');
const governance = require('./governance-contract');
const learning = require('./learning');
const gateFacts = require('./workflow-gate-facts');
const policyContract = require('./workflow-policy');

const ORDER = ['research', 'innovate', 'design', 'acceptance', 'plan', 'execute', 'completion', 'challenge', 'learning'];
const TARGET = {
  research: 'Research', innovate: 'Innovate', design: 'Design', acceptance: 'Acceptance',
  plan: 'Plan', execute: 'Execute / Debug', completion: 'Execute Log',
  challenge: 'Challenge', learning: 'Learning Check'
};
const VERDICT = {
  research: 'FAIL_SPEC', innovate: 'FAIL_SPEC', design: 'FAIL_DESIGN',
  acceptance: 'FAIL_ACCEPTANCE', plan: 'FAIL_PLAN', execute: 'FAIL_LOG',
  completion: 'FAIL_LOG', challenge: 'FAIL_LOG', learning: 'FAIL_LEARNING'
};

function firstRealLine(content) {
  return policyContract.normalize(content).split('\n').find(line =>
    line && !/^#+\s/.test(line) && !/^[A-Za-z][A-Za-z0-9 /&_-]*:\s*$/.test(line)
  ) || '';
}

function validTime(value) {
  return !!value && gateFacts.isValidIsoTimestamp(value);
}

function after(value, prior) {
  return validTime(value) && (!validTime(prior) || Date.parse(value) > Date.parse(prior));
}

function addBlocker(blockers, gate, message, target, verdict) {
  const code = (verdict || VERDICT[gate]) + '_' + message.toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  blockers.push({ code, gate, target: target || TARGET[gate], message, severity: 'error' });
}

function logIssues(snapshot, facts, blockers) {
  const log = snapshot.executeLog && snapshot.executeLog.content || '';
  if (!snapshot.executeLog || !snapshot.executeLog.exists || !firstRealLine(policyContract.section(log, 'Execute Log'))) {
    addBlocker(blockers, 'execute', 'Execute Log is required for this risk tier.');
    return;
  }
  const steps = common.scanExecuteLog(log);
  const workSteps = steps.filter(step => !step.isCompletion);
  if (!workSteps.length) addBlocker(blockers, 'execute', 'Execute Log must contain a formal execution step.');
  workSteps.forEach(step => {
    const status = policyContract.label(step.content, 'Status').toUpperCase();
    if (!status) addBlocker(blockers, 'execute', 'Execute Log step missing Status.');
    else if (!['DONE', 'BUGFIX', 'BUGFIX_ESCALATED', 'DEVIATED_MINOR', 'DEVIATED_MAJOR', 'BLOCKED'].includes(status)) {
      addBlocker(blockers, 'execute', 'Execute Log step has an invalid Status.');
    }
    if (!policyContract.label(step.content, 'Verification')) addBlocker(blockers, 'execute', 'Execute Log step missing Verification.');
    if (!validTime(policyContract.label(step.content, 'Timestamp'))) addBlocker(blockers, 'execute', 'Execute Log step missing valid Timestamp.');
  });
  workSteps.forEach((step, index) => {
    const status = policyContract.label(step.content, 'Status').toUpperCase();
    if (['BLOCKED', 'BUGFIX_ESCALATED'].includes(status) &&
        !workSteps.slice(index + 1).some(later => ['DONE', 'BUGFIX'].includes(policyContract.label(later.content, 'Status').toUpperCase()))) {
      addBlocker(blockers, 'execute', 'Execute Log has an unresolved ' + status + ' step.');
    }
    if (status === 'DEVIATED_MAJOR') {
      const deviationAt = policyContract.label(step.content, 'Timestamp');
      const authAt = snapshot.autonomy && snapshot.autonomy.authorizationAt;
      if (!validTime(deviationAt) || !validTime(authAt) || Date.parse(authAt) <= Date.parse(deviationAt)) {
        addBlocker(blockers, 'execute', 'DEVIATED_MAJOR needs later explicit human authorization.');
      }
    }
  });
  const completion = steps.length ? steps[steps.length - 1] : null;
  if (!completion || !completion.isCompletion) {
    addBlocker(blockers, 'completion', 'Execute Log completion-verification must be the last formal step.');
  } else {
    if (policyContract.label(completion.content, 'Status') !== 'DONE') addBlocker(blockers, 'completion', 'Execute Log completion-verification is not DONE.');
    if (!policyContract.label(completion.content, 'Result')) addBlocker(blockers, 'completion', 'Execute Log completion-verification missing Result.');
    if (!policyContract.label(completion.content, 'Verification')) addBlocker(blockers, 'completion', 'Execute Log completion-verification missing Verification.');
    const completedAt = policyContract.label(completion.content, 'Timestamp');
    if (!validTime(completedAt)) addBlocker(blockers, 'completion', 'Execute Log completion-verification missing valid Timestamp.');
  }
  const coverage = facts.acCoverage;
  const records = gateFacts.coverageRecordMap(coverage.records);
  coverage.declarations.forEach(declaration => {
    const record = records[declaration.id];
    if (!record) { addBlocker(blockers, 'completion', 'AC Coverage: ' + declaration.id + ' has no execution evidence in Execute Log.'); return; }
    if (record.result === 'FAIL') addBlocker(blockers, 'completion', 'AC Coverage: ' + declaration.id + ' verification failed.');
    else if (record.result === 'SKIPPED') {
      if (!/^human:[^:\s]+$/i.test(record.approvedBy) || !validTime(record.approvedAt) || !record.reason) {
        addBlocker(blockers, 'completion', 'AC Coverage: ' + declaration.id + ' SKIPPED needs human approval, timestamp and reason.');
      }
    } else if (record.result !== 'PASS') addBlocker(blockers, 'completion', 'AC Coverage: ' + declaration.id + ' requires PASS evidence.');
    if (record.testIssue) addBlocker(blockers, 'completion', 'AC Coverage: ' + declaration.id + ' Test must be one project-relative file path.');
    if (record.test && snapshot.projectDir) {
      const path = common.resolveProjectPath(snapshot.projectDir, record.test);
      if (!path || !fs.existsSync(path)) addBlocker(blockers, 'completion', 'AC Coverage: ' + declaration.id + ' Test file not found: ' + record.test);
    }
  });
}

function evaluate(snapshot, options) {
  snapshot = snapshot || { content: '', exists: false, mode: 'micro' };
  options = options || {};
  const content = snapshot.content || '';
  const mode = snapshot.mode || 'standard';
  const policy = policyContract.evaluate(content, mode);
  const blockers = [];
  const add = (gate, message, target, verdict) => addBlocker(blockers, gate, message, target, verdict);
  if (!snapshot.exists) add('research', 'Spec file not found.');
  if (snapshot.location === 'active' && snapshot.status === 'archived') add('research', 'Active Spec cannot declare status: archived.');
  policy.issues.forEach(issue => add('research', issue));
  const intake = policyContract.section(content, 'Intake');
  if (!policyContract.label(intake, 'Requirement') && !policyContract.label(intake, 'requirement')) add('research', 'Intake missing Requirement.');
  if (!policyContract.label(intake, 'Scope')) add('research', 'Intake missing Scope.');
  if (!policyContract.label(intake, 'Risks')) add('research', 'Intake missing Risks.');
  if (snapshot.isGitRepo && !policyContract.frontmatter(content, 'diff-base')) add('research', 'Missing diff-base frontmatter.');

  if (policy.requiresDesign) {
    const design = snapshot.design || {};
    if (!design.exists) add('design', 'Design file is required for this risk tier.');
    else {
      const body = policyContract.section(design.content, 'Design');
      ['Approach', 'Impact', 'Interface / Data', 'Compatibility / Rollback', 'Verification'].forEach(name => {
        if (!policyContract.label(body, name)) add('design', 'Design missing ' + name + '.');
      });
      if (policy.requiresDesignReview) {
        const review = policyContract.section(content, 'Design Reference');
        const reviewer = policyContract.label(review, 'Design Reviewed By');
        const reviewedAt = policyContract.label(review, 'Design Reviewed At');
        const reviewedDigest = policyContract.label(review, 'Design Review Digest');
        const summary = policyContract.label(review, 'Design Review Summary');
        if (!governance.isAuditableReviewer(mode, reviewer) || reviewer.toLowerCase() === 'inline') add('design', 'High-risk Design needs an independent Design Reviewed By.');
        if (!validTime(reviewedAt)) add('design', 'High-risk Design needs a valid Design Reviewed At.');
        if (!summary) add('design', 'High-risk Design needs Design Review Summary.');
        if (reviewedDigest !== policyContract.designReviewDigest(content, design.content)) add('design', 'Design Review Digest is missing or stale.');
        const firstWork = common.scanExecuteLog(snapshot.executeLog && snapshot.executeLog.content || '')
          .find(step => !step.isCompletion);
        const firstWorkAt = firstWork && policyContract.label(firstWork.content, 'Timestamp');
        if (validTime(firstWorkAt) && validTime(reviewedAt) && Date.parse(reviewedAt) >= Date.parse(firstWorkAt)) {
          add('design', 'High-risk Design review must precede implementation.');
        }
        if (reviewer && !/^human:/i.test(reviewer) && snapshot.autonomy &&
            (snapshot.autonomy.authorizationState !== 'active' || !snapshot.autonomy.authorizedActors.includes('design-reviewer'))) {
          add('design', 'Automated Design reviewer needs fresh design-reviewer authorization.');
        }
      }
    }
  }

  const acceptance = policyContract.section(content, 'Acceptance Criteria');
  const acceptanceFacts = gateFacts.collectGateFacts(snapshot);
  if (!policyContract.label(acceptance, 'Acceptance') && !acceptanceFacts.acceptance.blocks.length) add('acceptance', 'Acceptance is required.');
  if (!policyContract.label(acceptance, 'Verification') &&
      (!acceptanceFacts.acceptance.blocks.length || !acceptanceFacts.acceptance.blocks.every(block => !!block.verification))) {
    add('acceptance', 'Verification is required.');
  }
  acceptanceFacts.acceptance.issues.filter(issue =>
    issue !== 'Acceptance Criteria should include at least one AC-### item.'
  ).forEach(issue => add('acceptance', issue));
  acceptanceFacts.providerReadiness.issues.filter(issue => /^E2E Acceptance Criteria require Provider/.test(issue)).forEach(issue => add('acceptance', issue));
  if (/\be2e\b/i.test(policyContract.label(acceptance, 'Verification')) && !policyContract.label(acceptance, 'Provider')) add('acceptance', 'E2E Acceptance Criteria require Provider.');

  const plan = policyContract.section(content, 'Plan');
  const planBody = plan.replace(/^Plan Approved By:.*$/gm, '').replace(/^Approved At:.*$/gm, '').replace(/^Gate Evidence:.*$/gm, '');
  if (!firstRealLine(planBody)) add('plan', 'Plan is empty.');
  const approval = gateFacts.planApprovalFacts(content, snapshot.autonomyMode || 'supervised');
  if (!['auto', 'supervised', 'human'].includes(snapshot.autonomyMode)) add('plan', 'Autonomy mode is missing or invalid.');
  if (!approval.satisfied) add('plan', 'Plan approval is missing or invalid for the autonomy mode.');
  if (approval.approvedAt && !validTime(approval.approvedAt)) add('plan', 'Approved At must be valid ISO-8601.');
  if (['auto', 'supervised'].includes(snapshot.autonomyMode) &&
      (!snapshot.autonomy || snapshot.autonomy.authorizationState !== 'active')) {
    add('plan', 'Task or Plan authorization is missing or stale.');
  }

  if (policy.requiresLog) logIssues(snapshot, acceptanceFacts, blockers);
  else {
    const completion = policyContract.section(content, 'Completion Verification');
    if (policyContract.label(completion, 'Result').toUpperCase() !== 'PASS') add('completion', 'Completion Verification Result must be PASS.');
    if (!policyContract.label(completion, 'Verification')) add('completion', 'Completion Verification needs Verification evidence.');
    const verifiedAt = policyContract.label(completion, 'Verified At');
    if (!after(verifiedAt, approval.approvedAt)) add('completion', 'Completion Verification needs a valid Verified At after Plan approval.');
  }

  let reviewVerdict = policyContract.label(policyContract.section(content, 'Completion Verification'), 'Challenge Verdict').toUpperCase();
  if (policy.requiresCompletionReview) {
    const completion = policyContract.section(content, 'Completion Verification');
    const reviewer = policyContract.label(completion, 'Challenge Executed By');
    const reviewedAt = policyContract.label(completion, 'Challenge Executed At');
    const summary = policyContract.label(completion, 'Challenge Summary');
    const evidence = policyContract.label(completion, 'Challenge Evidence');
    if (!governance.isKnownVerdict(reviewVerdict)) add('challenge', 'Completion independent review requires a Challenge Verdict.');
    if (!governance.isAuditableReviewer(mode, reviewer) || reviewer.toLowerCase() === 'inline') add('challenge', 'Completion independent review needs an auditable reviewer.');
    if (!validTime(reviewedAt)) add('challenge', 'Completion independent review needs a valid Challenge Executed At.');
    if (!summary || evidence !== reviewVerdict + ' - ' + summary) add('challenge', 'Completion independent review evidence is incomplete.');
    if (policy.requiresLog && reviewedAt && snapshot.executeLog && snapshot.executeLog.content) {
      const last = common.extractLastStepTimestamp(snapshot.executeLog.content);
      if (last && Date.parse(reviewedAt) <= last.getTime()) add('challenge', 'Completion review must follow the last Execute Log step.');
    }
    if (reviewer && !/^human:/i.test(reviewer) && snapshot.autonomy &&
        (snapshot.autonomy.authorizationState !== 'active' || !snapshot.autonomy.authorizedActors.includes('challenge-reviewer'))) {
      add('challenge', 'Automated completion reviewer needs fresh challenge-reviewer authorization.');
    }
    if (governance.isKnownVerdict(reviewVerdict) && !governance.isPassingVerdict(reviewVerdict)) {
      add('challenge', 'Adversarial Challenge failed: ' + reviewVerdict + '.', governance.backtrackTarget(reviewVerdict), reviewVerdict);
    }
  } else if (reviewVerdict) {
    if (!governance.isKnownVerdict(reviewVerdict)) add('challenge', 'Challenge Verdict is invalid.');
    else if (!governance.isPassingVerdict(reviewVerdict)) {
      add('challenge', 'Adversarial Challenge failed: ' + reviewVerdict + '.', governance.backtrackTarget(reviewVerdict), reviewVerdict);
    }
  }
  const executionStatus = policyContract.label(policyContract.section(content, 'Completion Verification'), 'Execution Status');
  const learningInput = (snapshot.executeLog && snapshot.executeLog.content || '') + '\nStatus: ' + executionStatus;
  const triggers = learning.learningTriggers(content, learningInput, reviewVerdict);
  if (triggers.length && (!snapshot.learning || !snapshot.learning.exists)) add('learning', 'Learning Record is required because: ' + triggers.join(', ') + '.', 'Learning Check', 'FAIL_LEARNING');
  else if (triggers.length) learning.validateLearningContent(policyContract.section(snapshot.learning.content, 'Learning Record')).forEach(issue => add('learning', issue));

  (options.validationIssues || []).forEach(issue => {
    if (!blockers.some(blocker => blocker.message === issue)) add('research', issue);
  });
  const gates = {};
  ORDER.forEach(gate => {
    const matching = blockers.filter(blocker => blocker.gate === gate);
    gates[gate] = { state: matching.length ? 'blocked' : 'pass', blockers: matching, required: gate === 'challenge' ? policy.requiresCompletionReview : true };
  });
  if (governance.isKnownVerdict(reviewVerdict) && !governance.isPassingVerdict(reviewVerdict)) gates.challenge.state = 'failed';
  const first = ORDER.find(gate => gates[gate].state !== 'pass');
  const firstBlocker = first && gates[first].blockers[0];
  const target = firstBlocker ? firstBlocker.target : 'Ready';
  const action = firstBlocker ? (first === 'challenge' && !reviewVerdict ? 'run_challenge' :
    'repair_' + target.toLowerCase().replace(/ \/ /g, '_').replace(/\s+/g, '_')) : 'request_archive_authorization';
  const phase = snapshot.status === 'archived' ? 'archived' :
    action === 'request_archive_authorization' ? 'archive_authorization' :
    action === 'run_challenge' ? 'challenge' : (first === 'completion' ? 'execute' : first || 'research');
  return {
    phase, nextAction: action, backtrackTarget: target, completionReady: !first,
    challengeVerdict: reviewVerdict || (policy.requiresCompletionReview ? 'FAIL_LOG' : 'NOT_REQUIRED'),
    gates, blockers, policy,
    facts: { challenge: { verdict: reviewVerdict, required: policy.requiresCompletionReview },
      completion: { done: gates.completion.state === 'pass' },
      providerReadiness: acceptanceFacts.providerReadiness, learningRequired: triggers.length > 0 }
  };
}

module.exports = { evaluate };
