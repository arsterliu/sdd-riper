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

function isAuditableExecutedBy(value, mode) {
  var who = String(value || '').trim();
  if (!who) return false;
  if (mode === 'micro' && /^inline$/i.test(who)) return true;
  if (/^subagent:[^:\s]+$/i.test(who)) return true;
  if (/^external-agent:[^:\s]+$/i.test(who)) return true;
  if (/^human:[^:\s]+$/i.test(who)) return true;
  return false;
}

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
    if (!opts.executedBy) {
      console.error('[ERROR] --executed-by is required with --record-result (use subagent:<id>|external-agent:<id>|human:<name>|inline).');
      process.exit(3);
    }
    var content = fs.readFileSync(specPath, 'utf-8');
    var mode = common.getFrontmatterField(specPath, 'mode') || 'standard';
    var summary = opts.summary || '';
    var executedBy = opts.executedBy;
    if (!isAuditableExecutedBy(executedBy, mode)) {
      console.error('[ERROR] --executed-by must be subagent:<id>, external-agent:<id>, or human:<name>' + (mode === 'micro' ? ' (inline is also allowed for micro).' : '.'));
      process.exit(3);
    }
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
  if (state.specPath && fs.existsSync(state.specPath)) {
    var specContent = fs.readFileSync(state.specPath, 'utf-8');
    var execLogRef = common.getFrontmatterField(state.specPath, 'execute-log-file');
    var designRef = common.getFrontmatterField(state.specPath, 'design-file');
    if (execLogRef) console.log('EXECUTE_LOG: ' + execLogRef);
    if (designRef) console.log('DESIGN: ' + designRef);
    // Extract changed file paths from Execute Log for Code Challenge
    if (execLogRef) {
      var execLogPath = common.resolveProjectPath(projectDir, execLogRef);
      if (execLogPath && fs.existsSync(execLogPath)) {
        var execLogContent = fs.readFileSync(execLogPath, 'utf-8');
        var fileMatches = execLogContent.match(/^Files:\s*(.+)$/gm);
        if (fileMatches && fileMatches.length) {
          var codeFiles = [];
          fileMatches.forEach(function(m) {
            m.replace(/^Files:\s*/, '').split(/,\s*/).forEach(function(f) {
              f = f.trim();
              if (f && codeFiles.indexOf(f) === -1) codeFiles.push(f);
            });
          });
          if (codeFiles.length) console.log('CODE_FILES: ' + codeFiles.join(', '));
        }
      }
    }
    var diffBase = common.getFrontmatterField(state.specPath, 'diff-base');
    if (diffBase) console.log('DIFF_BASE: ' + diffBase);
  }
  console.log('APPROVAL_POLICY: ' + state.approvalPolicy);
  console.log('CRUISE_ENABLED: ' + (state.cruiseEnabled ? 'true' : 'false'));
  console.log('CURRENT_VERDICT_HINT: ' + state.challengeVerdict);
  console.log('BACKTRACK_TARGET_HINT: ' + state.backtrackTarget);
  console.log('ALLOWED_VERDICTS: ' + VERDICTS.join(' | '));
  console.log('');
  console.log('### Research Challenge');
  console.log('- Challenge whether the confirmed requirement matches the original goal and whether hidden assumptions remain.');
  console.log('- Challenge whether all five structured elements (Scope Boundary, Irreversibility, Impact Radius, Dependencies & Constraints, Acceptance Intent) are accurately captured.');
  console.log('- Challenge whether Research Reviewed By and Research Reviewed At are properly recorded.');
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
  console.log('- Verdict guidance: if the code faithfully implements a flawed Design, the correct verdict is FAIL_DESIGN (not FAIL_CODE). FAIL_CODE applies when the code itself has defects; FAIL_DESIGN applies when the code is correct but the upstream artifact is wrong.');
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
  console.log('  sdd challenge <project-dir> --record-result "VERDICT" --summary "summary text" --executed-by "subagent:<id>|external-agent:<id>|human:<name>|inline"');
}

module.exports = run;
