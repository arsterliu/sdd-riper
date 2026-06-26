var workflow = require('../core/workflow');
var cruiseRun = require('../core/cruise-run');

function canReuseNativeLoop(engine, state) {
  if (state && state.cruisePolicy !== 'autonomous') return false;
  return ['auto', 'claude-code', 'codex', 'opencode'].indexOf(engine) !== -1;
}

function printEngineAdapter(engine, projectDir, state) {
  console.log('### Engine adapter');
  if (state.cruisePolicy === 'assisted') {
    console.log('- Use prompt-loop guidance only; do not start a host-native autonomous loop for this run.');
    console.log('- Ask for human confirmation before each repair iteration.');
    console.log('- SDD remains the control protocol and artifact truth chain.');
  } else if (engine === 'auto') {
    console.log('- Prefer the host agent native loop when it is available.');
    console.log('- Priority: Claude Code Dynamic Workflows, Codex native loop, opencode native loop, then fallback to the prompt loop below.');
    console.log('- SDD remains the control protocol: run sdd next / validate / review-execute / challenge to decide each transition.');
    console.log('- Do not move Spec, Design, Plan, Execute Log, or Learning state into a host-specific workflow file.');
  } else if (engine === 'claude-code') {
    console.log('- Use Claude Code Dynamic Workflows when enabled.');
    console.log('- The workflow script should orchestrate agents; agents should run sdd next / validate / review-execute / challenge.');
    console.log('- Keep challenge review independent from implementation agents.');
    console.log('- If unavailable, fallback to the prompt loop below.');
  } else if (engine === 'codex') {
    console.log('- Use the Codex native loop when the current Codex surface supports autonomous continuation.');
    console.log('- Treat this prompt as the loop contract, not as a request for SDD to own model execution.');
    console.log('- SDD remains the control protocol and the Spec artifact chain remains the source of truth.');
    console.log('- If unavailable, fallback to the prompt loop below.');
  } else if (engine === 'opencode') {
    console.log('- Use the opencode native loop when the current opencode runtime supports autonomous continuation.');
    console.log('- Treat this prompt as the loop contract, not as a request for SDD to own model execution.');
    console.log('- SDD remains the control protocol and the Spec artifact chain remains the source of truth.');
    console.log('- If unavailable, fallback to the prompt loop below.');
  } else if (engine === 'local-loop') {
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
  var engine = workflow.normalizeCruiseEngine(opts.engine);
  if (!engine) {
    console.error('[ERROR] Invalid cruise engine: ' + opts.engine);
    console.error('Allowed engines: ' + workflow.CRUISE_ENGINES.join(', '));
    process.exit(1);
  }
  if (state.cruisePolicy === 'off') {
    console.log('## CRUISE DISABLED');
    console.log('');
    console.log('SPEC: ' + (state.specPath || 'none'));
    console.log('ENGINE: ' + engine);
    console.log('GATE_POLICY: ' + state.gatePolicy);
    console.log('CRUISE_POLICY: ' + state.cruisePolicy);
    console.log('CRUISE_DISABLED: true');
    console.log('REASON: CRUISE_POLICY=off');
    console.log('CURRENT_CHALLENGE_VERDICT: ' + state.challengeVerdict);
    console.log('BACKTRACK_TARGET: ' + state.backtrackTarget);
    console.log('NEXT_ACTION: ' + state.nextAction);
    console.log('RISK_FLAGS: ' + (state.riskFlags.length ? state.riskFlags.join(',') : 'none'));
    console.log('');
    console.log('### Current blockers');
    (state.blockers.length ? state.blockers : ['none']).forEach(function(issue) {
      console.log('- ' + issue);
    });
    return;
  }
  console.log(state.cruisePolicy === 'assisted' ? '## ASSISTED CRUISE PROMPT' : '## AUTONOMOUS CRUISE PROMPT');
  console.log('');
  console.log('SPEC: ' + (state.specPath || 'none'));
  console.log('ENGINE: ' + engine);
  console.log('REUSE_NATIVE_LOOP: ' + (canReuseNativeLoop(engine, state) ? 'yes-when-available' : 'no'));
  console.log('GATE_POLICY: ' + state.gatePolicy);
  console.log('CRUISE_POLICY: ' + state.cruisePolicy);
  console.log('ASSISTED_REVIEW_REQUIRED: ' + (state.cruisePolicy === 'assisted' ? 'true' : 'false'));
  console.log('MAX_ITERATIONS: ' + state.maxIterations);
  console.log('CURRENT_CHALLENGE_VERDICT: ' + state.challengeVerdict);
  console.log('BACKTRACK_TARGET: ' + state.backtrackTarget);
  console.log('NEXT_ACTION: ' + state.nextAction);
  console.log('RISK_FLAGS: ' + (state.riskFlags.length ? state.riskFlags.join(',') : 'none'));
  console.log('');
  printEngineAdapter(engine, projectDir, state);
  console.log(state.cruisePolicy === 'assisted' ? '### Assisted repair loop' : '### Autonomous repair loop');
  console.log('Run a bounded repair loop for at most ' + state.maxIterations + ' iterations.');
  console.log('1. Inspect the current workflow state and blockers.');
  console.log('2. Repair only the artifact indicated by BACKTRACK_TARGET.');
  console.log('3. Preserve Spec, Design, Plan, Execute Log, and Learning as the audit chain.');
  console.log('4. Run sdd validate "' + projectDir + '" --archive-ready after every repair.');
  console.log('5. Run sdd review-execute "' + projectDir + '" when execution evidence changes.');
  console.log('6. Run sdd challenge "' + projectDir + '" after validation or review.');
  console.log('7. If Challenge Verdict is FAIL_*, backtrack to the mapped target and continue the repair loop.');
  console.log('8. Stop and ask for human input when risk flags include security, billing, migration, public-api, or irreversible.');
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
  if (opts.emitClaudePrompt) {
    if (engine !== 'claude-code' && engine !== 'auto') {
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
    var recorded = cruiseRun.appendRun(projectDir, state, { engine: engine, iteration: opts.iteration });
    console.log('');
    console.log('[RUN_LEDGER] ' + recorded.relativePath);
    console.log('[RUN_LEDGER_STOP] ' + recorded.entry.stopReason);
  }
}

module.exports = run;
