var workflow = require('../core/workflow');
var reviewerGuidance = require('../core/reviewer-guidance');

function run(projectDir, opts) {
  opts = opts || {};
  var state = workflow.analyzeProject(projectDir, opts);
  console.log('## SDD NEXT');
  console.log('SPEC: ' + (state.specPath || 'none'));
  console.log('AUTONOMY_MODE: ' + (state.autonomyMode || 'unresolved'));
  console.log('AUTONOMY_MODE_SOURCE: ' + (state.autonomyModeSource || 'unresolved'));
  console.log('AUTHORIZATION_STATE: ' + (state.authorizationState || 'unresolved'));
  console.log('AUTHORIZED_ACTORS: ' + (state.authorizedActors && state.authorizedActors.length ? state.authorizedActors.join(',') : 'none'));
  console.log('AUTHORIZED_SCOPE_DIGEST: ' + (state.scopeDigest || 'none'));
  console.log('AUTHORIZED_RISK_SNAPSHOT: ' + (state.riskSnapshot || 'none'));
  console.log('ACTIVE_PLAN_DIGEST: ' + (state.planDigest || 'none'));
  console.log('STOP_REASON: ' + (state.stopReason || 'none'));
  if (state.requiredGate) console.log('REQUIRED_HUMAN_GATE: ' + state.requiredGate);
  console.log('MAX_ITERATIONS: ' + state.maxIterations);
  console.log('CHALLENGE_VERDICT: ' + state.challengeVerdict);
  console.log('BACKTRACK_TARGET: ' + state.backtrackTarget);
  console.log('NEXT_ACTION: ' + state.nextAction);
  console.log('RISK_FLAGS: ' + (state.riskFlags.length ? state.riskFlags.join(',') : 'none'));
  if (state.contextSource) console.log('CONTEXT_SOURCE: ' + state.contextSource);
  if (state.visualContext) {
    console.log('UI_IMPACT: ' + state.visualContext.uiImpact);
    console.log('VISUAL_CONTEXT_INTENT: ' + state.visualContext.intent);
    if (state.visualContext.uiImpactConfirmationRequired) {
      console.log('VISUAL_CONTEXT_DIAGNOSTIC: VISUAL_CONTEXT_UI_IMPACT_CONFIRMATION_REQUIRED');
      console.log('VISUAL_CONTEXT_GUIDANCE: Confirm whether this task affects UI with sdd visual select <project-dir> --spec <spec> --ui-impact no, or --ui-impact yes --intent not-required|direction|fidelity.');
    } else if (state.visualContext.selectionRequired) {
      console.log('VISUAL_CONTEXT_GUIDANCE: Complete one selection with sdd visual select <project-dir> --spec <spec> --ui-impact yes --intent not-required|direction|fidelity (or use --ui-impact no).');
    } else if (state.visualContext.selectionInvalid) {
      console.log('VISUAL_CONTEXT_DIAGNOSTIC: VISUAL_CONTEXT_SELECTION_INVALID');
      console.log('VISUAL_CONTEXT_GUIDANCE: Use sdd visual select with ui-impact no and not-applicable, or ui-impact yes and not-required, direction, or fidelity.');
    } else if (state.visualContext.uiImpact === 'yes' && ['direction', 'fidelity'].indexOf(state.visualContext.intent) !== -1 && state.visualEvidence.state === 'not-applicable') {
      console.log('VISUAL_CONTEXT_GUIDANCE: Run sdd visual discover <project-dir> --spec <spec>; when strict visual validation is needed, run sdd visual init <project-dir> --spec <spec> --mode ' + state.visualContext.intent + '.');
    }
  }
  if (state.visualEvidence && state.visualEvidence.state !== 'not-applicable') {
    console.log('VISUAL_EVIDENCE_STATE: ' + state.visualEvidence.state);
    console.log('PLAN_READINESS: ' + state.visualEvidence.planReadiness);
    console.log('BASELINE_STATUS: ' + state.visualEvidence.baselineStatus);
  }
  if (state.profileRevision) {
    console.log('PROJECT_PROFILE_REVISION: ' + state.profileRevision);
    console.log('PROJECT_PROFILE_DIGEST: ' + state.profileDigest);
    console.log('AFFECTED_UNITS: ' + state.affectedUnits.join(','));
  }
  if (state.profileAdvisory) {
    console.log('PROFILE_ADVISORY: ' + state.profileAdvisory.kind);
    console.log('PROFILE_FOCUS_FIELDS: ' + state.profileAdvisory.focusFields.join('; '));
    console.log('PROFILE_GUIDANCE: ' + state.profileAdvisory.note);
  }
  workflow.formatDesignMethodLines(state.designMethod).forEach(function(line) {
    console.log(line);
  });
  console.log('BLOCKERS:');
  (state.blockers.length ? state.blockers : ['none']).forEach(function(issue) {
    console.log('- ' + issue);
  });
  if (state.nextAction === 'request_archive_authorization') {
    console.log('ARCHIVE_AUTHORIZATION: required');
    console.log('GUIDANCE: Stop and request explicit archive authorization from the current user. Agents must not construct archive authorization parameters or infer permission from Ready, PASS, Plan Approval, Challenge, or prior authorization.');
  }
  if (state.nextAction === 'request_human_gate') {
    console.log('GUIDANCE: 当前任务使用 human 模式。请先确认 ' + state.requiredGate + ' 治理节点；机械测试和计划内调试不需要逐项审批。');
    console.log('GUIDANCE_COMMAND: sdd autonomy approve-gate <project-dir> --spec <spec> --gate ' + state.requiredGate + ' --expected-digest ' + state.scopeDigest + ' --authorized-by human:<name> --authorization-evidence <text>');
  }
  if (state.nextAction === 'run_challenge' || state.blockers.some(function(issue) { return /Challenge|Research Gate|Research Reviewed By|Research Reviewed At|independent reviewer/i.test(issue); })) {
    console.log('REVIEWER_GUIDANCE:');
    reviewerGuidance.guidanceLines().forEach(function(line) {
      console.log('- ' + line);
    });
  }
}

module.exports = run;
