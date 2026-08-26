const test = require('node:test');
const assert = require('node:assert/strict');
const autonomyState = require('../src/core/autonomy-state');
const gateFacts = require('../src/core/workflow-gate-facts');
const workflow = require('../src/core/workflow');

function spec(mode, approval, event) {
  let content = '---\nautonomy-mode: "' + mode + '"\nautonomy-mode-source: "project-default"\n---\n## Intake\n### Scope\n- project\n### Risks\n- none\n## Plan\n' + approval + '\n';
  if (event) content = autonomyState.appendEvent(content, event);
  return content;
}

test('Plan approval follows effective autonomy mode instead of a project approval policy', function() {
  const agent = 'Plan Approved By: agent:root\nApproved At: 2026-08-11T00:00:00Z\nGate Evidence: complete';
  const human = 'Plan Approved By: human:liuy\nApproved At: 2026-08-11T00:00:00Z\nGate Evidence:';
  assert.equal(gateFacts.planApprovalFacts(spec('auto', agent), 'auto').satisfied, true);
  assert.equal(gateFacts.planApprovalFacts(spec('supervised', agent), 'supervised').satisfied, false);
  assert.equal(gateFacts.planApprovalFacts(spec('supervised', human), 'supervised').satisfied, true);
  assert.equal(gateFacts.planApprovalFacts(spec('human', human), 'human').satisfied, true);
});

test('authorization resolver distinguishes active and stale scope', function() {
  let content = spec('auto', '');
  const event = {
    eventId: 'evt-1', eventType: 'task_authorization', mode: 'auto', gate: '', decision: 'authorized',
    scopeDigest: autonomyState.scopeSnapshot(content), riskSnapshot: autonomyState.riskSnapshot(content), planDigest: '',
    authorizedActors: 'main,worker,research-reviewer,challenge-reviewer', authorizedBy: 'human:liuy',
    authorizedAt: '2026-08-11T00:00:00Z', authorizationEvidence: '确认', invalidatedAt: '', invalidationReason: ''
  };
  content = autonomyState.appendEvent(content, event);
  assert.equal(autonomyState.resolve(content).authorizationState, 'active');
  assert.equal(autonomyState.resolve(content.replace('- project', '- project,api')).stopReason, 'scope_changed');
});

test('empty auto Plan approval fields do not trigger Plan activation', function() {
  let content = spec('auto', 'Plan Approved By:\nApproved At:\nGate Evidence:');
  const risk = autonomyState.riskFlagsSnapshot([]);
  content = autonomyState.appendEvent(content, {
    eventId: 'task', eventType: 'task_authorization', mode: 'auto', decision: 'authorized',
    scopeDigest: autonomyState.scopeSnapshot(content), riskSnapshot: risk, planDigest: '',
    authorizedActors: 'main,worker,research-reviewer,challenge-reviewer', authorizedBy: 'human:liuy',
    authorizedAt: '2026-08-26T00:00:00Z', authorizationEvidence: '确认'
  });
  const resolved = autonomyState.resolve(content, { riskSnapshot: risk });
  assert.equal(resolved.authorizationState, 'active');
  assert.equal(resolved.stopReason, '');
});

test('empty auto approval timestamp does not consume a following narrative line', function() {
  let content = spec('auto', 'Plan Approved By: agent:root\nApproved At:\n审批说明：等待人工填写时间\nGate Evidence: complete');
  const risk = autonomyState.riskFlagsSnapshot([]);
  content = autonomyState.appendEvent(content, {
    eventId: 'task', eventType: 'task_authorization', mode: 'auto', decision: 'authorized',
    scopeDigest: autonomyState.scopeSnapshot(content), riskSnapshot: risk, planDigest: '',
    authorizedActors: 'main,worker,research-reviewer,challenge-reviewer', authorizedBy: 'human:liuy',
    authorizedAt: '2026-08-26T00:00:00Z', authorizationEvidence: '确认'
  });
  const resolved = autonomyState.resolve(content, { riskSnapshot: risk });
  assert.equal(resolved.authorizationState, 'active');
  assert.equal(resolved.stopReason, '');
});

test('human gate approval is fresh only for the current scope risk and plan', function() {
  let content = spec('human', 'do it');
  content = autonomyState.appendEvent(content, {
    eventId: 'gate-plan', eventType: 'gate_approval', mode: 'human', gate: 'Plan', decision: 'approved',
    scopeDigest: autonomyState.scopeSnapshot(content), riskSnapshot: autonomyState.riskSnapshot(content),
    planDigest: autonomyState.planSnapshot(content), authorizedBy: 'human:liuy', authorizedAt: '2026-08-11T00:00:00Z'
  });
  assert.deepEqual(autonomyState.resolve(content).approvedGates, ['Plan']);
  assert.deepEqual(autonomyState.resolve(content.replace('do it', 'do something else')).approvedGates, []);
});

test('human mode pauses only at governance transitions', function() {
  assert.equal(workflow.requiredHumanGate({ nextAction: 'repair_research', challengeVerdict: 'FAIL_SPEC' }), '');
  assert.equal(workflow.requiredHumanGate({ nextAction: 'repair_innovate', challengeVerdict: 'FAIL_SPEC' }), 'Research');
  assert.equal(workflow.requiredHumanGate({ nextAction: 'repair_design', challengeVerdict: 'FAIL_SPEC' }), 'Innovate');
  assert.equal(workflow.requiredHumanGate({ nextAction: 'run_challenge', challengeVerdict: 'FAIL_LOG' }), 'Completion');
  assert.equal(workflow.requiredHumanGate({ nextAction: 'repair_execute_debug', gates: { challenge: { state: 'failed' } } }), 'Repair');
  assert.equal(workflow.requiredHumanGate({ nextAction: 'request_archive_authorization', challengeVerdict: 'PASS' }), 'Challenge');
});

test('structured reversible declaration is not overridden by narrative safety wording', function() {
  const confirmed = [
    'Scope Boundary: update policy docs',
    'Irreversibility: code and config are reversible',
    'Impact Radius: local workflow',
    'Dependencies & Constraints: preserve irreversible-action safeguards',
    'Acceptance Intent: safeguards remain explicit'
  ].join('\n');
  assert.equal(workflow.riskFlags('Plan: document irreversible safeguards', confirmed).includes('irreversible'), false);
});

test('auto Plan changes require a matching plan activation and runtime risk changes invalidate authority', function() {
  let content = spec('auto', 'Plan Approved By: agent:root\nApproved At: 2026-08-11T00:00:00Z\nGate Evidence: ok');
  const risk = autonomyState.riskFlagsSnapshot([]);
  content = autonomyState.appendEvent(content, {
    eventId: 'task', eventType: 'task_authorization', mode: 'auto', decision: 'authorized',
    scopeDigest: autonomyState.scopeSnapshot(content), riskSnapshot: risk, planDigest: '',
    authorizedActors: 'main,worker,research-reviewer,challenge-reviewer', authorizedBy: 'human:liuy', authorizedAt: '2026-08-11T00:00:00Z'
  });
  assert.equal(autonomyState.resolve(content, { riskSnapshot: risk }).stopReason, 'plan_activation_required');
  content = autonomyState.appendEvent(content, {
    eventId: 'activation', eventType: 'plan_activation', mode: 'auto', gate: 'Plan', decision: 'activated',
    scopeDigest: autonomyState.scopeSnapshot(content), riskSnapshot: risk, planDigest: autonomyState.planSnapshot(content),
    authorizedActors: 'main,worker,research-reviewer,challenge-reviewer', authorizedBy: 'agent:root', authorizedAt: '2026-08-11T00:00:01Z'
  });
  assert.equal(autonomyState.resolve(content, { riskSnapshot: risk }).authorizationState, 'active');
  assert.equal(autonomyState.resolve(content.replace('Gate Evidence: ok', 'Gate Evidence: changed'), { riskSnapshot: risk }).authorizationState, 'required');
  assert.equal(autonomyState.resolve(content, { riskSnapshot: autonomyState.riskFlagsSnapshot(['security']) }).stopReason, 'risk_changed');
});

test('Cruise native loop is disabled by any explicit stop reason', function() {
  const cruise = require('../src/commands/cruise');
  assert.equal(cruise.canReuseNativeLoop('auto', { autonomyMode: 'auto', authorizationState: 'active', stopReason: 'risk_changed' }), false);
  assert.equal(cruise.canReuseNativeLoop('auto', { autonomyMode: 'auto', authorizationState: 'active', stopReason: '' }), true);
});

test('Cruise ledger uses precise archive and budget stop reasons', function() {
  const cruiseRun = require('../src/core/cruise-run');
  assert.equal(cruiseRun.stopReason({ stopReason: '', nextAction: 'request_archive_authorization', maxIterations: 5, challengeVerdict: 'PASS' }, 1), 'archive_authorization');
  assert.equal(cruiseRun.stopReason({ stopReason: '', nextAction: 'repair_execute', maxIterations: 5, challengeVerdict: 'FAIL_CODE' }, 5), 'budget_exhausted');
});

test('invalidation starts a new authority generation and cannot reuse an older Plan activation', function() {
  let content = spec('auto', 'Plan Approved By: agent:root\nApproved At: 2026-08-11T00:00:00Z\nGate Evidence: ok');
  const scope = autonomyState.scopeSnapshot(content);
  const risk = autonomyState.riskFlagsSnapshot([]);
  const plan = autonomyState.planSnapshot(content);
  content = autonomyState.appendEvent(content, { eventId: 'task-old', eventType: 'task_authorization', mode: 'auto', decision: 'authorized', scopeDigest: scope, riskSnapshot: risk, authorizedActors: 'main,worker', authorizedBy: 'human:liuy' });
  content = autonomyState.appendEvent(content, { eventId: 'activation-old', eventType: 'plan_activation', mode: 'auto', decision: 'activated', scopeDigest: scope, riskSnapshot: risk, planDigest: plan, authorizedBy: 'agent:root' });
  content = autonomyState.appendEvent(content, { eventId: 'invalidate', eventType: 'invalidation', mode: 'auto', decision: 'invalidated', scopeDigest: scope, riskSnapshot: risk, planDigest: plan });
  content = autonomyState.appendEvent(content, { eventId: 'task-new', eventType: 'task_authorization', mode: 'auto', decision: 'authorized', scopeDigest: scope, riskSnapshot: risk, authorizedActors: 'main,worker', authorizedBy: 'human:liuy' });
  assert.equal(autonomyState.resolve(content, { riskSnapshot: risk }).stopReason, 'plan_activation_required');
});

test('a new auto task authorization cannot reuse an older Plan activation', function() {
  let content = spec('auto', 'Plan Approved By: agent:root\nApproved At: 2026-08-11T00:00:00Z\nGate Evidence: ok');
  const scope = autonomyState.scopeSnapshot(content);
  const risk = autonomyState.riskFlagsSnapshot([]);
  const plan = autonomyState.planSnapshot(content);
  content = autonomyState.appendEvent(content, { eventId: 'task-old', eventType: 'task_authorization', mode: 'auto', decision: 'authorized', scopeDigest: scope, riskSnapshot: risk, authorizedActors: 'main,worker', authorizedBy: 'human:liuy', authorizedAt: '2026-08-11T00:00:00Z' });
  content = autonomyState.appendEvent(content, { eventId: 'activation-old', eventType: 'plan_activation', mode: 'auto', decision: 'activated', scopeDigest: scope, riskSnapshot: risk, planDigest: plan, authorizedBy: 'agent:root', authorizedAt: '2026-08-11T00:01:00Z' });
  content = autonomyState.appendEvent(content, { eventId: 'task-new', eventType: 'task_authorization', mode: 'auto', decision: 'authorized', scopeDigest: scope, riskSnapshot: risk, authorizedActors: 'main,worker', authorizedBy: 'human:liuy', authorizedAt: '2026-08-12T00:00:00Z' });
  assert.equal(autonomyState.resolve(content, { riskSnapshot: risk }).stopReason, 'plan_activation_required');
});

test('human mode exposes the latest fresh gate approval as reauthorization time', function() {
  let content = spec('human', 'do it');
  content = autonomyState.appendEvent(content, {
    eventId: 'gate-plan', eventType: 'gate_approval', mode: 'human', gate: 'Plan', decision: 'approved',
    scopeDigest: autonomyState.scopeSnapshot(content), riskSnapshot: autonomyState.riskSnapshot(content),
    planDigest: autonomyState.planSnapshot(content), authorizedBy: 'human:liuy', authorizedAt: '2026-08-12T02:00:00Z'
  });
  assert.equal(autonomyState.resolve(content).authorizationAt, '2026-08-12T02:00:00Z');
});

test('dedicated hard stops have precise workflow reasons', function() {
  assert.equal(workflow.dedicatedStopReason(['Project Profile digest is invalid.'], ''), 'profile_digest_required');
  assert.equal(workflow.dedicatedStopReason(['AC Coverage: AC-001 is SKIPPED but missing Approved By.'], ''), 'e2e_skip_authorization_required');
  const major = 'Status: DEVIATED_MAJOR\nTimestamp: 2026-08-12T01:00:00Z';
  assert.equal(workflow.dedicatedStopReason([], major), 'major_deviation_required');
  assert.equal(workflow.dedicatedStopReason([], major + '\n---\nStatus: DONE\nTimestamp: 2026-08-12T02:00:00Z'), 'major_deviation_required');
  assert.equal(workflow.dedicatedStopReason([], major, { authorizationAt: '2026-08-12T01:00:01Z' }), '');
  assert.equal(workflow.dedicatedStopReason([], major, { authorizationAt: '2026-08-12T00:59:59Z' }), 'major_deviation_required');
  assert.equal(workflow.dedicatedStopReason([], '', { platformPermissionRequired: true }), 'platform_permission_required');
  assert.equal(workflow.dedicatedStopReason(['WARNING: scenario mentions platform permission'], ''), '');
});
