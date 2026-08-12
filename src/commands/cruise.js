var workflow = require('../core/workflow');
var cruiseRun = require('../core/cruise-run');

function canReuseNativeLoop(driver, state) {
  if (state && state.autonomyMode === 'human') return false;
  if (state && state.authorizationState !== 'active') return false;
  if (state && state.stopReason) return false;
  return ['auto', 'claude-code', 'codex', 'opencode'].indexOf(driver) !== -1;
}

function printArchiveAuthorizationGuidance(state) {
  if (state.nextAction !== 'request_archive_authorization') return;
  console.log('ARCHIVE_AUTHORIZATION: required');
  console.log('Stop and request explicit archive authorization from the current user. Agents must not construct archive authorization parameters or infer permission from workflow completion.');
}

function printDriverAdapter(driver, projectDir, state) {
  console.log('### Driver adapter');
  if (driver === 'auto') {
    console.log('- Prefer the host agent native loop when it is available.');
    console.log('- Priority: Claude Code Dynamic Workflows, Codex native loop, opencode native loop, then fallback to the prompt loop below.');
    console.log('- SDD remains the control protocol: run sdd next / validate / review-execute / challenge to decide each transition.');
    console.log('- Do not move Spec, Design, Plan, Execute Log, or Learning state into a host-specific workflow file.');
  } else if (driver === 'claude-code') {
    console.log('- Use Claude Code Dynamic Workflows when enabled.');
    console.log('- The workflow script should orchestrate agents; agents should run sdd next / validate / review-execute / challenge.');
    console.log('- Keep challenge review independent from implementation agents.');
    console.log('- If unavailable, fallback to the prompt loop below.');
  } else if (driver === 'codex') {
    console.log('- Use the Codex native loop when the current Codex surface supports autonomous continuation.');
    console.log('- Treat this prompt as the loop contract, not as a request for SDD to own model execution.');
    console.log('- SDD remains the control protocol and the Spec artifact chain remains the source of truth.');
    console.log('- If unavailable, fallback to the prompt loop below.');
  } else if (driver === 'opencode') {
    console.log('- Use the opencode native loop when the current opencode runtime supports autonomous continuation.');
    console.log('- Treat this prompt as the loop contract, not as a request for SDD to own model execution.');
    console.log('- SDD remains the control protocol and the Spec artifact chain remains the source of truth.');
    console.log('- If unavailable, fallback to the prompt loop below.');
  } else if (driver === 'local-loop') {
    console.log('- Use prompt-loop compensation only when the host agent has no native loop.');
    console.log('- SDD may record iteration snapshots, but it does not invoke a model or run an executor.');
    console.log('- Stop after ' + state.maxIterations + ' iterations or any high-risk flag.');
  } else {
    console.log('- Use the generic prompt loop below.');
    console.log('- The host agent should manually continue iterations until PASS, BLOCKED, or max iteration budget.');
  }
  console.log('');
}

function run(projectDir, opts) {
  opts = opts || {};
  var state = workflow.analyzeProject(projectDir, opts);
  var iteration = parseInt(opts.iteration || 0, 10);
  if (Number.isFinite(iteration) && iteration >= state.maxIterations && state.nextAction !== 'request_archive_authorization') {
    state.stopReason = 'budget_exhausted';
  }
  var requestedDriver = opts.driver || 'auto';
  var driver = workflow.normalizeCruiseDriver(requestedDriver);
  if (!driver) {
    console.error('[ERROR] Invalid cruise driver: ' + requestedDriver);
    console.error('Allowed drivers: ' + workflow.CRUISE_DRIVERS.join(', '));
    process.exit(1);
  }
  if (state.autonomyMode === 'human') {
    console.log('## HUMAN-GUIDED WORKFLOW');
    console.log('');
    console.log('SPEC: ' + (state.specPath || 'none'));
    console.log('DRIVER: ' + driver);
    console.log('AUTONOMY_MODE: human');
    console.log('AUTONOMY_MODE_SOURCE: ' + state.autonomyModeSource);
    console.log('AUTHORIZATION_STATE: ' + (state.authorizationState || 'not-applicable'));
    console.log('AUTHORIZED_ACTORS: ' + (state.authorizedActors.length ? state.authorizedActors.join(',') : 'none'));
    console.log('AUTHORIZED_SCOPE_DIGEST: ' + state.authorizedScopeDigest);
    console.log('AUTHORIZED_RISK_SNAPSHOT: ' + state.authorizedRiskSnapshot);
    console.log('ACTIVE_PLAN_DIGEST: ' + state.activePlanDigest);
    console.log('STOP_REASON: ' + (state.stopReason || 'human_gate_required'));
    console.log('CURRENT_CHALLENGE_VERDICT: ' + state.challengeVerdict);
    console.log('BACKTRACK_TARGET: ' + state.backtrackTarget);
    console.log('NEXT_ACTION: ' + state.nextAction);
    console.log('RISK_FLAGS: ' + (state.riskFlags.length ? state.riskFlags.join(',') : 'none'));
    console.log('');
    console.log('### Current blockers');
    (state.blockers.length ? state.blockers : ['none']).forEach(function(issue) {
      console.log('- ' + issue);
    });
    printArchiveAuthorizationGuidance(state);
    return;
  }
  console.log('## AUTONOMOUS CRUISE PROMPT');
  console.log('');
  console.log('SPEC: ' + (state.specPath || 'none'));
  console.log('DRIVER: ' + driver);
  console.log('REUSE_NATIVE_LOOP: ' + (canReuseNativeLoop(driver, state) ? 'yes-when-available' : 'no'));
  console.log('AUTONOMY_MODE: ' + state.autonomyMode);
  console.log('AUTONOMY_MODE_SOURCE: ' + state.autonomyModeSource);
  console.log('AUTHORIZATION_STATE: ' + state.authorizationState);
  console.log('AUTHORIZED_ACTORS: ' + (state.authorizedActors.length ? state.authorizedActors.join(',') : 'none'));
  console.log('AUTHORIZED_SCOPE_DIGEST: ' + state.authorizedScopeDigest);
  console.log('AUTHORIZED_RISK_SNAPSHOT: ' + state.authorizedRiskSnapshot);
  console.log('ACTIVE_PLAN_DIGEST: ' + state.activePlanDigest);
  console.log('STOP_REASON: ' + (state.stopReason || 'none'));
  console.log('MAX_ITERATIONS: ' + state.maxIterations);
  console.log('CURRENT_CHALLENGE_VERDICT: ' + state.challengeVerdict);
  console.log('BACKTRACK_TARGET: ' + state.backtrackTarget);
  console.log('NEXT_ACTION: ' + state.nextAction);
  console.log('RISK_FLAGS: ' + (state.riskFlags.length ? state.riskFlags.join(',') : 'none'));
  workflow.formatDesignMethodLines(state.designMethod).forEach(function(line) {
    console.log(line);
  });
  console.log('');
  printDriverAdapter(driver, projectDir, state);
  console.log('### Autonomous repair loop');
  console.log('Cruise orchestrator routes the loop; it does not perform the phase repair itself.');
  console.log('The main agent re-enters BACKTRACK_TARGET and follows that phase write boundaries and gates.');
  console.log('The Challenge reviewer remains read-only and returns only verdict plus evidence.');
  console.log('Run a bounded repair loop for at most ' + state.maxIterations + ' iterations.');
  console.log('1. Inspect the current workflow state and blockers.');
  console.log('2. Repair only the artifact indicated by BACKTRACK_TARGET.');
  console.log('3. Preserve Spec, Design, Plan, Execute Log, and Learning as the audit chain.');
  console.log('4. Run sdd validate "' + projectDir + '" --archive-ready after every repair.');
  console.log('5. Run sdd review-execute "' + projectDir + '" when execution evidence changes.');
  console.log('6. Run sdd challenge "' + projectDir + '" after validation or review.');
  console.log('7. If Challenge Verdict is FAIL_*, backtrack to the mapped target and continue the repair loop.');
  console.log('8. Stop on a new or unauthorized risk, scope expansion, an irreversible action, or any other explicit STOP_REASON.');
  console.log('');
  console.log('### Verdict routing');
  Object.keys(workflow.VERDICT_TO_TARGET).forEach(function(verdict) {
    console.log('- ' + verdict + ' -> ' + workflow.VERDICT_TO_TARGET[verdict]);
  });
  console.log('');
  console.log('### Current blockers');
  (state.blockers.length ? state.blockers : ['none']).forEach(function(issue) {
    console.log('- ' + issue);
  });
  printArchiveAuthorizationGuidance(state);
  if (opts.emitClaudePrompt) {
    if (driver !== 'claude-code' && driver !== 'auto') {
      console.log('');
      console.log('[CLAUDE_PROMPT] skipped: emit-claude-prompt currently supports claude-code/auto only.');
    } else {
      console.log('');
      cruiseRun.printClaudePrompt(projectDir, state, function(line) {
        console.log(line);
      });
    }
  }
  if (opts.recordRun) {
    var recorded = cruiseRun.appendRun(projectDir, state, { driver: driver, iteration: opts.iteration });
    console.log('');
    console.log('[RUN_LEDGER] ' + recorded.relativePath);
    console.log('[RUN_LEDGER_STOP] ' + recorded.entry.stopReason);
  }
}

module.exports = run;
module.exports.canReuseNativeLoop = canReuseNativeLoop;
