var workflow = require('../core/workflow');

function run(projectDir, opts) {
  opts = opts || {};
  var state = workflow.analyzeProject(projectDir, opts);
  console.log('## SDD NEXT');
  console.log('SPEC: ' + (state.specPath || 'none'));
  console.log('GATE_POLICY: ' + state.gatePolicy);
  console.log('CRUISE_POLICY: ' + state.cruisePolicy);
  console.log('MAX_ITERATIONS: ' + state.maxIterations);
  console.log('CHALLENGE_VERDICT: ' + state.challengeVerdict);
  console.log('BACKTRACK_TARGET: ' + state.backtrackTarget);
  console.log('NEXT_ACTION: ' + state.nextAction);
  console.log('RISK_FLAGS: ' + (state.riskFlags.length ? state.riskFlags.join(',') : 'none'));
  if (state.contextSource) console.log('CONTEXT_SOURCE: ' + state.contextSource);
  workflow.formatDesignMethodLines(state.designMethod).forEach(function(line) {
    console.log(line);
  });
  console.log('BLOCKERS:');
  (state.blockers.length ? state.blockers : ['none']).forEach(function(issue) {
    console.log('- ' + issue);
  });
}

module.exports = run;
