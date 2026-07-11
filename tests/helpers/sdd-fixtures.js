const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.resolve(__dirname, '..', '..', 'bin', 'cli.js');

function runCli(args, cwd) {
  try {
    return {
      status: 0,
      output: execFileSync(process.execPath, [CLI].concat(args), {
        cwd: cwd,
        encoding: 'utf-8'
      })
    };
  } catch (error) {
    return {
      status: typeof error.status === 'number' ? error.status : 1,
      output: String(error.stdout || '') + String(error.stderr || '')
    };
  }
}

function artifactPath(projectDir, specPath, field) {
  const content = fs.readFileSync(specPath, 'utf-8');
  const match = content.match(new RegExp('^' + field + ':\\s*"?([^"\\r\\n]*)"?\\s*$', 'm'));
  if (!match || !match[1]) throw new Error('Missing ' + field + ' in ' + specPath);
  return path.resolve(projectDir, match[1].trim());
}

function insertAfterHeading(content, heading, body) {
  const marker = '## ' + heading + '\n';
  if (!content.includes(marker)) throw new Error('Missing heading ' + heading);
  return content.replace(marker, marker + body + '\n');
}

function fillConfirmedRequirement(content) {
  return content
    .replace(/^Scope Boundary:$/m, 'Scope Boundary: fixture scope')
    .replace(/^Irreversibility:$/m, 'Irreversibility: none')
    .replace(/^Impact Radius:$/m, 'Impact Radius: fixture only')
    .replace(/^Dependencies & Constraints:$/m, 'Dependencies & Constraints: none')
    .replace(/^Acceptance Intent:$/m, 'Acceptance Intent: fixture gates are observable');
}

function fillPlanGate(content) {
  return fillConfirmedRequirement(content)
    .replace(/^Research Reviewed By:$/m, 'Research Reviewed By: subagent:research-fixture')
    .replace(/^Research Reviewed At:$/m, 'Research Reviewed At: 2026-01-01T00:00:00Z')
    .replace(/^Plan Approved By:$/m, 'Plan Approved By: agent:fixture')
    .replace(/^Approved At:$/m, 'Approved At: 2026-01-01T00:00:00Z')
    .replace(/^Gate Evidence:$/m, 'Gate Evidence: fixture plan evidence');
}

function fillChallenge(content, verdict, options) {
  options = options || {};
  const summary = Object.prototype.hasOwnProperty.call(options, 'summary') ? options.summary : 'independent fixture review';
  const target = options.target || (verdict === 'PASS_WITH_CONCERNS' ? 'Learning Check' : 'Ready');
  const evidence = Object.prototype.hasOwnProperty.call(options, 'evidence')
    ? options.evidence
    : verdict + ' - ' + summary;
  return content
    .replace(/^Challenge Verdict:$/m, 'Challenge Verdict: ' + verdict)
    .replace(/^Backtrack Target:$/m, 'Backtrack Target: ' + target)
    .replace(/^Challenge Summary:$/m, 'Challenge Summary: ' + summary)
    .replace(/^Challenge Executed By:$/m, 'Challenge Executed By: subagent:challenge-fixture')
    .replace(/^Challenge Executed At:$/m, 'Challenge Executed At: 2026-01-01T00:02:00Z')
    .replace(/^Challenge Evidence:$/m, 'Challenge Evidence: ' + evidence);
}

function designBody() {
  return [
    'Selected Option / ADR: fixture option.',
    'Requirement Traceability: AC-001.',
    'Impact Scope: fixture only.',
    'Architecture View: fixture parser to evaluator.',
    'Data Model / Schema: markdown only.',
    'Interface Contract: existing CLI.',
    'Compatibility / Rollback: reversible fixture.',
    'Test Strategy: node:test.'
  ].join('\n');
}

function completionLog() {
  return [
    '# Execute Log',
    '',
    '## Execute Log',
    '',
    '---',
    'Step: completion-verification',
    'Status: DONE',
    'Result: fixture verification complete.',
    'AC Coverage Summary:',
    '  - AC-001: PASS (unit, tests/state-matrix.test.js)',
    'Four-Axis Checklist:',
    '  - Axis 0 (Intake): aligned',
    '  - Axis 1 (Design/Acceptance/Plan): complete',
    '  - Axis 2 (Code Diff): within boundary',
    '  - Axis 3 (Execute Log): faithful',
    'Verification: node --test tests/state-matrix.test.js',
    'Timestamp: 2026-01-01T00:01:00Z',
    '---',
    ''
  ].join('\n');
}

function createArchiveReadyStandard(projectDir, taskName) {
  taskName = taskName || 'state-matrix';
  fs.mkdirSync(projectDir, { recursive: true });
  runCli(['init', projectDir, '--mode', 'standard'], projectDir);
  const discover = runCli([
    'discover', projectDir,
    '--task-name', taskName,
    '--spec-version', 'v1.0',
    '--requirement', 'state matrix fixture',
    '--mode', 'standard'
  ], projectDir);
  if (discover.status !== 0) throw new Error(discover.output);

  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-' + taskName + '.md');
  const designPath = artifactPath(projectDir, specPath, 'design-file');
  const executeLogPath = artifactPath(projectDir, specPath, 'execute-log-file');
  let content = fs.readFileSync(specPath, 'utf-8');
  content = fillPlanGate(content);
  content = insertAfterHeading(content, 'Innovate Options', [
    'Option A: fixture option. Pros: deterministic. Cons: test only.',
    'Option B: no change. Pros: none. Cons: gates remain inconsistent.',
    'Selected Option: Option A.'
  ].join('\n'));
  content = insertAfterHeading(content, 'Acceptance Criteria', [
    '### AC-001: fixture is archive ready',
    'Requirement: state matrix fixture',
    'Type: functional',
    'Verification: unit',
    'Automated: yes',
    'Test: tests/state-matrix.test.js',
    '',
    'Scenario: fixture passes',
    '  Given complete artifacts',
    '  When validation runs',
    '  Then archive readiness is true'
  ].join('\n'));
  content = fillChallenge(content, 'PASS');
  fs.writeFileSync(specPath, content, 'utf-8');

  let design = fs.readFileSync(designPath, 'utf-8');
  design = insertAfterHeading(design, 'Technical Design', designBody());
  fs.writeFileSync(designPath, design, 'utf-8');
  fs.writeFileSync(executeLogPath, completionLog(), 'utf-8');

  return { projectDir, specPath, designPath, executeLogPath, taskName };
}

function createArchiveReadyLite(projectDir, taskName) {
  taskName = taskName || 'state-matrix-lite';
  fs.mkdirSync(projectDir, { recursive: true });
  runCli(['init', projectDir, '--mode', 'lite'], projectDir);
  const discover = runCli([
    'discover', projectDir,
    '--task-name', taskName,
    '--spec-version', 'v1.0',
    '--requirement', 'state matrix lite fixture',
    '--mode', 'lite'
  ], projectDir);
  if (discover.status !== 0) throw new Error(discover.output);

  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-' + taskName + '.md');
  const designPath = artifactPath(projectDir, specPath, 'design-file');
  const executeLogPath = artifactPath(projectDir, specPath, 'execute-log-file');
  let content = fs.readFileSync(specPath, 'utf-8');
  content = fillPlanGate(content);
  content = insertAfterHeading(content, 'Innovate Options', 'Option A: lite fixture option.');
  content = insertAfterHeading(content, 'Acceptance Criteria', [
    '### AC-001: lite fixture is archive ready',
    'Requirement: lite state matrix fixture',
    'Type: functional',
    'Verification: unit',
    'Automated: yes',
    'Test: tests/state-matrix.test.js'
  ].join('\n'));
  content = fillChallenge(content, 'PASS');
  fs.writeFileSync(specPath, content, 'utf-8');

  let design = fs.readFileSync(designPath, 'utf-8');
  design = insertAfterHeading(design, 'Design Note', [
    'Approach: fixture approach.',
    'Impact Scope: fixture only.',
    'Interface / Data Impact: none.',
    'Compatibility: compatible.',
    'Risks: none.',
    'Test Strategy: node:test.'
  ].join('\n'));
  fs.writeFileSync(designPath, design, 'utf-8');
  fs.writeFileSync(executeLogPath, completionLog(), 'utf-8');
  return { projectDir, specPath, designPath, executeLogPath, taskName };
}

function createArchiveReadyMicro(projectDir, taskName) {
  taskName = taskName || 'state-matrix-micro';
  fs.mkdirSync(projectDir, { recursive: true });
  runCli(['init', projectDir, '--mode', 'micro'], projectDir);
  const discover = runCli([
    'discover', projectDir,
    '--task-name', taskName,
    '--spec-version', 'v1.0',
    '--requirement', 'state matrix micro fixture',
    '--mode', 'micro'
  ], projectDir);
  if (discover.status !== 0) throw new Error(discover.output);

  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-' + taskName + '.md');
  const executeLogPath = artifactPath(projectDir, specPath, 'execute-log-file');
  let content = fs.readFileSync(specPath, 'utf-8');
  content = fillPlanGate(content)
    .replace(/^Scope:$/m, 'Scope: fixture scope')
    .replace(/^Touched Files:$/m, 'Touched Files: tests/state-matrix.test.js')
    .replace(/^Change:$/m, 'Change: fixture change')
    .replace(/^Impact Scope:$/m, 'Impact Scope: fixture only')
    .replace(/^Data Impact:$/m, 'Data Impact: none')
    .replace(/^Interface Impact:$/m, 'Interface Impact: none')
    .replace(/^Acceptance:$/m, 'Acceptance: fixture passes')
    .replace(/^Verification:$/m, 'Verification: node --test tests/state-matrix.test.js')
    .replace(/^Blast Radius:$/m, 'Blast Radius: fixture only');
  content = fillChallenge(content, 'PASS');
  fs.writeFileSync(specPath, content, 'utf-8');
  fs.writeFileSync(executeLogPath, completionLog(), 'utf-8');
  return { projectDir, specPath, executeLogPath, taskName };
}

function addLearningRecord(fixture) {
  const learningRel = 'mydocs/learnings/v1.0-' + fixture.taskName + '.learning.md';
  const learningPath = path.join(fixture.projectDir, learningRel);
  fs.mkdirSync(path.dirname(learningPath), { recursive: true });
  fs.writeFileSync(learningPath, [
    '---',
    'date: 2026-01-01',
    'task-name: "' + fixture.taskName + '"',
    'status: draft',
    'source-spec: "mydocs/specs/v1.0-' + fixture.taskName + '.md"',
    '---',
    '',
    '# Learning Record',
    '',
    '## Learning Record',
    '',
    'Source Spec: mydocs/specs/v1.0-' + fixture.taskName + '.md',
    'Trigger: PASS_WITH_CONCERNS challenge verdict',
    'Observed Problem: fixture concern.',
    'Root Cause: fixture root cause.',
    'Decision Rule: fixture decision rule.',
    'Applies When: fixture applies.',
    'Recommended Action: fixture action.',
    'Evidence: fixture evidence.'
  ].join('\n'), 'utf-8');
  let spec = fs.readFileSync(fixture.specPath, 'utf-8');
  spec = spec.replace(/^learning-file:.*$/m, 'learning-file: "' + learningRel + '"');
  fs.writeFileSync(fixture.specPath, spec, 'utf-8');
  fixture.learningPath = learningPath;
  return fixture;
}

module.exports = {
  runCli,
  createArchiveReadyStandard,
  createArchiveReadyLite,
  createArchiveReadyMicro,
  addLearningRecord,
  fillChallenge,
  completionLog
};
