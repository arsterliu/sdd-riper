var workflow = require('../core/workflow');
var common = require('../../lib/common');
var fs = require('fs');
var path = require('path');

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

function resolveSpec(projectDir, opts) {
  var docsRoot = common.getDocsRoot(projectDir);
  var specsDir = path.join(docsRoot, 'specs');
  if (opts.spec) return path.resolve(projectDir, opts.spec);
  if (opts.name) return common.findSourceSpecByRef(specsDir, opts.name);
  return common.findLatestSpec(specsDir);
}

function run(projectDir, opts) {
  opts = opts || {};

  // --record-result mode: write challenge evidence into the spec
  if (opts.recordResult) {
    var verdict = String(opts.recordResult || '').toUpperCase();
    if (VERDICTS.indexOf(verdict) === -1) {
      console.error('[ERROR] Invalid verdict: ' + verdict + '. Allowed: ' + VERDICTS.join(', '));
      process.exit(1);
    }
    var specPath = resolveSpec(projectDir, opts);
    if (!specPath || !fs.existsSync(specPath)) {
      console.error('[ERROR] No active spec found.');
      process.exit(1);
    }
    var content = fs.readFileSync(specPath, 'utf-8');
    var summary = opts.summary || '';
    var executedBy = opts.executedBy || 'subagent';
    var now = new Date().toISOString();
    var backtrack = workflow.VERDICT_TO_TARGET[verdict] || 'Research';
    // Replace the challenge fields in the spec
    content = content
      .replace(/^Challenge Verdict:.*$/m, 'Challenge Verdict: ' + verdict)
      .replace(/^Backtrack Target:.*$/m, 'Backtrack Target: ' + backtrack)
      .replace(/^Challenge Summary:.*$/m, 'Challenge Summary: ' + summary)
      .replace(/^Challenge Executed By:.*$/m, 'Challenge Executed By: ' + executedBy)
      .replace(/^Challenge Executed At:.*$/m, 'Challenge Executed At: ' + now)
      .replace(/^Challenge Evidence:.*$/m, 'Challenge Evidence: ' + verdict + ' - ' + summary);
    fs.writeFileSync(specPath, content, 'utf-8');
    console.log('[SDD Challenge] Result recorded in spec: ' + path.basename(specPath));
    console.log('  Verdict: ' + verdict);
    console.log('  Backtrack: ' + backtrack);
    console.log('  Executed By: ' + executedBy);
    console.log('  Executed At: ' + now);
    return;
  }

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
  console.log('### Code Challenge');
  console.log('- Challenge code quality: duplication, dead code, unclear naming, pattern violations.');
  console.log('- Challenge security: hardcoded secrets, injection risks, missing input validation.');
  console.log('- Challenge correctness: does the code actually implement what the Spec/Design/Plan prescribe?');
  console.log('- Challenge test quality: do tests verify behavior or just mock it? Are edge cases covered?');
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
  console.log('');
  console.log('After the challenge agent returns, record the result with:');
  console.log('  sdd challenge <project-dir> --record-result "VERDICT" --summary "summary text" --executed-by "subagent|inline"');
}

module.exports = run;
