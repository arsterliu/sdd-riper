var workflow = require('../core/workflow');

var VERDICTS = [
  'PASS',
  'PASS_WITH_CONCERNS',
  'FAIL_SPEC',
  'FAIL_DESIGN',
  'FAIL_ACCEPTANCE',
  'FAIL_PLAN',
  'FAIL_CODE',
  'FAIL_LOG',
  'FAIL_LEARNING'
];

function run(projectDir, opts) {
  opts = opts || {};
  var state = workflow.analyzeProject(projectDir, opts);
  console.log('## ADVERSARIAL REVIEW PROMPT');
  console.log('');
  console.log('Role: independent challenge agent. Do not modify code or artifacts.');
  console.log('Output labels must stay in English; evidence and explanation may be written in Chinese.');
  console.log('');
  console.log('SPEC: ' + (state.specPath || 'none'));
  console.log('GATE_POLICY: ' + state.gatePolicy);
  console.log('CRUISE_POLICY: ' + state.cruisePolicy);
  console.log('CURRENT_VERDICT_HINT: ' + state.challengeVerdict);
  console.log('BACKTRACK_TARGET_HINT: ' + state.backtrackTarget);
  console.log('ALLOWED_VERDICTS: ' + VERDICTS.join(' | '));
  console.log('');
  console.log('### Research Challenge');
  console.log('- Challenge whether the confirmed requirement matches the original goal and whether hidden assumptions remain.');
  console.log('');
  console.log('### Design Challenge');
  console.log('- Challenge architecture, data model, interface contract, impact scope, compatibility, rollback, and failure modes.');
  console.log('- Methodology the task should be using (advisory router; challenge under-use of these):');
  workflow.formatDesignMethodLines(state.designMethod).forEach(function(line) {
    console.log('  ' + line);
  });
  console.log('');
  console.log('### Acceptance Challenge');
  console.log('- Challenge whether AC-### items are observable, verifiable, and traceable to requirements.');
  console.log('');
  console.log('### Plan Challenge');
  console.log('- Challenge whether Plan steps are executable, bounded, and derived from Design and Acceptance.');
  console.log('');
  console.log('### Execute Challenge');
  console.log('- Challenge whether implementation evidence stayed inside Plan and whether tests prove the ACs.');
  console.log('');
  console.log('### Archive Challenge');
  console.log('- Challenge whether archive would hide drift, failed verification, missing Learning, or a failed challenge verdict.');
  console.log('');
  console.log('### Required Output');
  console.log('Challenge Verdict: <' + VERDICTS.join('|') + '>');
  console.log('Backtrack Target: <Research|Design|Acceptance|Plan|Execute / Debug|Execute Log|Learning Check|Ready>');
  console.log('Challenge Summary: <evidence-backed summary>');
}

module.exports = run;
