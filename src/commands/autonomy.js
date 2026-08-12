const fs = require('fs');
const path = require('path');
const common = require('../../lib/common');
const contract = require('../core/autonomy-contract');
const state = require('../core/autonomy-state');
const workflowGateFacts = require('../core/workflow-gate-facts');
const autonomyStore = require('../core/autonomy-store');
const workflow = require('../core/workflow');

function invalidMode(mode) {
  if (contract.isMode(mode)) return false;
  console.error('[SDD_AUTONOMY_MODE_INVALID] mode must be auto, supervised, or human');
  process.exitCode = 3;
  return true;
}

function atomicConfig(file, content) {
  const temp = file + '.autonomy-' + process.pid + '.tmp';
  fs.writeFileSync(temp, content, 'utf-8');
  try { fs.renameSync(temp, file); }
  catch (error) { try { fs.rmSync(temp, { force: true }); } catch (_) {} throw error; }
}

function migrate(projectDir, opts) {
  const mode = String(opts.mode || '');
  if (invalidMode(mode)) return;
  const file = common.getConfigFile(path.resolve(projectDir));
  if (!fs.existsSync(file)) {
    console.error('[SDD_AUTONOMY_MIGRATION_REQUIRED] .sdd-config not found');
    process.exitCode = 3;
    return;
  }
  const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/).filter(function(line) {
    return !/^(?:AUTONOMY_MODE|APPROVAL_POLICY|CRUISE_ENABLED)=/.test(line);
  });
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  lines.push('AUTONOMY_MODE="' + mode + '"', '');
  atomicConfig(file, lines.join('\n'));
  console.log('AUTONOMY_MODE: ' + mode);
  console.log('MIGRATION: complete');
}

function resolveSpec(projectDir, spec) {
  const file = path.resolve(projectDir, spec || '');
  if (!spec || !fs.existsSync(file)) throw new Error('active spec not found');
  return file;
}

function runtimeRiskSnapshot(projectDir, spec, content) {
  return state.riskFlagsSnapshot(workflow.computeRiskFlags(path.resolve(projectDir), spec, content));
}

function writeFailure(error) {
  console.error('[' + (error.code || 'SDD_AUTONOMY_WRITE_FAILED') + '] ' + error.message);
  process.exitCode = 3;
}

function inspect(projectDir, opts) {
  const configState = common.readProjectAutonomy(path.resolve(projectDir));
  console.log('AUTONOMY_CONFIG_STATE: ' + (configState.ok ? 'ready' : 'migration_required'));
  if (configState.ok) console.log('AUTONOMY_MODE: ' + configState.mode);
  if (opts.spec) {
    const spec = resolveSpec(projectDir, opts.spec);
    const content = fs.readFileSync(spec, 'utf-8');
    const resolved = state.resolve(content, { riskSnapshot: runtimeRiskSnapshot(projectDir, spec, content) });
    console.log('SPEC_AUTONOMY_MODE: ' + resolved.mode);
    console.log('AUTONOMY_MODE_SOURCE: ' + resolved.modeSource);
    console.log('AUTHORIZATION_STATE: ' + resolved.authorizationState);
    console.log('AUTHORIZED_ACTORS: ' + (resolved.authorizedActors.length ? resolved.authorizedActors.join(',') : 'none'));
    console.log('AUTHORIZED_SCOPE_DIGEST: ' + resolved.scopeDigest);
    console.log('AUTHORIZED_RISK_SNAPSHOT: ' + resolved.riskSnapshot);
    console.log('ACTIVE_PLAN_DIGEST: ' + resolved.planDigest);
    console.log('RESEARCH_DIGEST: ' + state.researchSnapshot(content));
    console.log('INNOVATE_DIGEST: ' + state.innovateSnapshot(content));
    console.log('STOP_REASON: ' + (resolved.stopReason || 'none'));
  }
}

function select(projectDir, opts) {
  if (invalidMode(opts.mode)) return;
  let unchanged = false;
  try {
    autonomyStore.update(projectDir, opts.spec, function(content, spec) {
      const currentMode = state.resolve(content).mode;
      if (currentMode === opts.mode) { unchanged = true; return content; }
      const scopeDigest = state.scopeSnapshot(content);
      if (opts.expectedScopeDigest !== scopeDigest || !validAuthorization(opts)) {
        const error = new Error('mode switch requires current human authorization for the inspected scope');
        error.code = 'SDD_AUTONOMY_AUTHORIZATION_REQUIRED'; throw error;
      }
      const risk = runtimeRiskSnapshot(projectDir, spec, content);
      const now = new Date().toISOString();
      let next = state.appendEvent(content, {
        eventId: 'evt-' + now.replace(/[^0-9]/g, '') + '-invalidate', eventType: 'invalidation', mode: currentMode,
        decision: 'invalidated', scopeDigest, riskSnapshot: risk, planDigest: state.planSnapshot(content),
        authorizedBy: opts.authorizedBy, authorizedAt: now, authorizationEvidence: opts.authorizationEvidence,
        invalidatedAt: now, invalidationReason: 'autonomy mode changed'
      });
      next = next.replace(/^autonomy-mode:.*$/m, 'autonomy-mode: "' + opts.mode + '"')
        .replace(/^autonomy-mode-source:.*$/m, 'autonomy-mode-source: "active-switch"');
      return state.appendEvent(next, {
        eventId: 'evt-' + now.replace(/[^0-9]/g, '') + '-change', eventType: 'mode_change', mode: opts.mode,
        decision: 'selected', scopeDigest, riskSnapshot: risk, planDigest: state.planSnapshot(content),
        authorizedBy: opts.authorizedBy, authorizedAt: now, authorizationEvidence: opts.authorizationEvidence
      });
    });
  } catch (error) { writeFailure(error); return; }
  console.log('AUTONOMY_MODE: ' + opts.mode);
  console.log('MODE_SWITCH: ' + (unchanged ? 'unchanged' : 'complete'));
}

function validAuthorization(opts) {
  return /^human:[^:\s]+$/i.test(String(opts.authorizedBy || '')) &&
    !!String(opts.authorizationEvidence || '').trim() &&
    !/[\r\n\x00-\x1f\x7f]/.test(String(opts.authorizationEvidence || ''));
}

function authorize(projectDir, opts) {
  let actual = '';
  try {
    autonomyStore.update(projectDir, opts.spec, function(content, spec) {
      const mode = state.resolve(content).mode;
      actual = state.scopeSnapshot(content);
      const plan = state.planSnapshot(content);
      if (opts.expectedScopeDigest !== actual) { const e = new Error('expected scope digest does not match'); e.code = 'SDD_AUTONOMY_AUTHORIZATION_STALE'; throw e; }
      if (!validAuthorization(opts)) { const e = new Error('current human authorization is required'); e.code = 'SDD_AUTONOMY_AUTHORIZATION_REQUIRED'; throw e; }
      if (mode !== 'auto' && mode !== 'supervised') { const e = new Error('continuous authorization applies only to auto or supervised'); e.code = 'SDD_AUTONOMY_AUTHORIZATION_REQUIRED'; throw e; }
      if (mode === 'supervised' && !workflowGateFacts.planApprovalFacts(content, mode).human) { const e = new Error('supervised automation requires a human-approved Plan'); e.code = 'SDD_AUTONOMY_PLAN_APPROVAL_REQUIRED'; throw e; }
      if (mode === 'supervised' && opts.expectedPlanDigest !== plan) { const e = new Error('expected Plan digest does not match'); e.code = 'SDD_AUTONOMY_AUTHORIZATION_STALE'; throw e; }
      const now = new Date().toISOString();
      return state.appendEvent(content, {
        eventId: 'evt-' + now.replace(/[^0-9]/g, ''), eventType: mode === 'auto' ? 'task_authorization' : 'plan_authorization',
        mode, gate: mode === 'supervised' ? 'Plan' : '', decision: 'authorized', scopeDigest: actual,
        riskSnapshot: runtimeRiskSnapshot(projectDir, spec, content), planDigest: mode === 'supervised' ? plan : '',
        authorizedActors: 'main,worker,research-reviewer,challenge-reviewer', authorizedBy: opts.authorizedBy,
        authorizedAt: now, authorizationEvidence: opts.authorizationEvidence, invalidatedAt: '', invalidationReason: ''
      });
    });
  } catch (error) { writeFailure(error); return; }
  console.log('AUTHORIZATION_STATE: active'); console.log('SCOPE_DIGEST: ' + actual);
}

function activatePlan(projectDir, opts) {
  try {
    autonomyStore.update(projectDir, opts.spec, function(content, spec) {
      const scope = state.scopeSnapshot(content); const plan = state.planSnapshot(content);
      const risk = runtimeRiskSnapshot(projectDir, spec, content);
      const resolved = state.resolve(content, { riskSnapshot: risk });
      if (resolved.mode !== 'auto' || !resolved.taskAuthorization || resolved.taskAuthorization.scopeDigest !== scope || resolved.taskAuthorization.riskSnapshot !== risk) {
        const e = new Error('a fresh auto task authorization is required'); e.code = 'SDD_AUTONOMY_AUTHORIZATION_REQUIRED'; throw e;
      }
      if (opts.expectedScopeDigest !== scope || opts.expectedRiskSnapshot !== risk || opts.expectedPlanDigest !== plan) {
        const e = new Error('Plan activation digest does not match'); e.code = 'SDD_AUTONOMY_AUTHORIZATION_STALE'; throw e;
      }
      if (!/^agent:[^:\s]+$/i.test(String(opts.activatedBy || '')) || !String(opts.evidence || '').trim() || /[\r\n\x00-\x1f\x7f]/.test(String(opts.evidence || ''))) {
        const e = new Error('Plan activation requires an auditable agent and single-line evidence'); e.code = 'SDD_AUTONOMY_AUTHORIZATION_REQUIRED'; throw e;
      }
      const now = new Date().toISOString();
      return state.appendEvent(content, { eventId: 'evt-' + now.replace(/[^0-9]/g, ''), eventType: 'plan_activation', mode: 'auto', gate: 'Plan', decision: 'activated',
        scopeDigest: scope, riskSnapshot: risk, planDigest: plan, authorizedActors: resolved.taskAuthorization.authorizedActors,
        authorizedBy: opts.activatedBy, authorizedAt: now, authorizationEvidence: opts.evidence, invalidatedAt: '', invalidationReason: '' });
    });
  } catch (error) { writeFailure(error); return; }
  console.log('PLAN_ACTIVATION: active');
}

function approveGate(projectDir, opts) {
  const allowed = ['Research', 'Innovate', 'Plan', 'Completion', 'Challenge', 'Repair'];
  if (allowed.indexOf(opts.gate) === -1 || !validAuthorization(opts)) {
    console.error('[SDD_AUTONOMY_GATE_REQUIRED] valid gate and human authorization are required'); process.exitCode = 3; return;
  }
  try {
    autonomyStore.update(projectDir, opts.spec, function(content, spec) {
      const expected = state.gateSnapshot(content, opts.gate);
      if (opts.expectedDigest !== expected) { const e = new Error('gate digest does not match'); e.code = 'SDD_AUTONOMY_AUTHORIZATION_STALE'; throw e; }
      const now = new Date().toISOString();
      return state.appendEvent(content, {
        eventId: 'evt-' + now.replace(/[^0-9]/g, ''), eventType: 'gate_approval', mode: state.resolve(content).mode,
        gate: opts.gate, decision: 'approved', scopeDigest: state.scopeSnapshot(content), riskSnapshot: runtimeRiskSnapshot(projectDir, spec, content),
        planDigest: expected, authorizedActors: '', authorizedBy: opts.authorizedBy, authorizedAt: now,
        authorizationEvidence: opts.authorizationEvidence, invalidatedAt: '', invalidationReason: ''
      });
    });
  } catch (error) { writeFailure(error); return; }
  console.log('GATE: ' + opts.gate); console.log('DECISION: approved');
}

module.exports = { inspect: inspect, migrate: migrate, select: select, authorize: authorize, activatePlan: activatePlan, approveGate: approveGate };
