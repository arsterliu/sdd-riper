const fs = require('fs');
const path = require('path');
const { runSddCli } = require('./test-cli');
const autonomyState = require('../../src/core/autonomy-state');

function runCli(args, cwd) {
  return runSddCli(args, { cwd: cwd, env: process.env });
}

function artifactPath(projectDir, specPath, field) {
  const content = fs.readFileSync(specPath, 'utf-8');
  const match = content.match(new RegExp('^' + field + ':\\s*"?([^"\\r\\n]*)"?\\s*$', 'm'));
  if (!match || !match[1]) throw new Error('Missing ' + field + ' in ' + specPath);
  return path.resolve(projectDir, match[1].trim());
}

function insertAfterHeading(content, heading, body) {
  const marker = new RegExp('(^## ' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\r?\\n)', 'm');
  if (!marker.test(content)) throw new Error('Missing heading ' + heading);
  return content.replace(marker, '$1' + body + '\n');
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

function authorizeAutoFixture(content) {
  const riskSnapshot = autonomyState.riskSnapshot(content);
  let authorized = autonomyState.appendEvent(content, {
    eventId: 'fixture-task-authorization', eventType: 'task_authorization', mode: 'auto', decision: 'authorized',
    scopeDigest: autonomyState.scopeSnapshot(content), riskSnapshot: riskSnapshot,
    authorizedActors: 'main,worker,design-reviewer,challenge-reviewer',
    authorizedBy: 'human:fixture', authorizedAt: '2026-01-01T00:00:00Z',
    authorizationEvidence: 'fixture task authorization'
  });
  return autonomyState.appendEvent(authorized, {
    eventId: 'fixture-plan-activation', eventType: 'plan_activation', mode: 'auto', gate: 'Plan', decision: 'activated',
    scopeDigest: autonomyState.scopeSnapshot(content), riskSnapshot: riskSnapshot, planDigest: autonomyState.planSnapshot(content),
    authorizedActors: 'main,worker,design-reviewer,challenge-reviewer', authorizedBy: 'agent:fixture',
    authorizedAt: '2026-01-01T00:00:01Z', authorizationEvidence: 'fixture plan activation'
  });
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
    'Step 1:',
    'Status: DONE',
    'Verification: node --test tests/state-matrix.test.js',
    'Timestamp: 2026-01-01T00:00:30Z',
    '---',
    'Step: completion-verification',
    'Status: DONE',
    'Result: fixture verification complete.',
    'AC Coverage:',
    '  - AC-001: PASS',
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

function createArchiveReady(projectDir, taskName, mode) {
  taskName = taskName || 'state-matrix';
  fs.mkdirSync(projectDir, { recursive: true });
  runCli(['init', projectDir, '--mode', mode, '--autonomy-mode', 'auto'], projectDir);
  const created = runCli(['discover', projectDir, '--task-name', taskName, '--spec-version', 'v1.0',
    '--requirement', 'state matrix fixture', '--mode', mode, '--autonomy-mode', 'auto'], projectDir);
  if (created.status !== 0) throw new Error(created.output);
  const specPath = path.join(projectDir, 'mydocs/specs/v1.0-' + taskName + '.md');
  const designRel = 'mydocs/design/v1.0-' + taskName + '.design.md';
  const logRel = 'mydocs/logs/v1.0-' + taskName + '.execute.md';
  const designPath = path.join(projectDir, designRel);
  const executeLogPath = path.join(projectDir, logRel);
  fs.mkdirSync(path.join(projectDir, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'tests/state-matrix.test.js'), 'test fixture\n');
  let content = fs.readFileSync(specPath, 'utf8')
    .replace(/^Scope:.*$/m, 'Scope: fixture only')
    .replace(/^Risks:.*$/m, 'Risks: reversible')
    .replace(/^Risk Signals:.*$/m, 'Risk Signals: ' + (mode === 'micro' ? 'multi-step' : 'design-latitude'))
    .replace(/^design-file:.*$/m, 'design-file: "' + designRel + '"')
    .replace(/^execute-log-file:.*$/m, 'execute-log-file: "' + logRel + '"');
  content = fillPlanGate(content);
  content = insertAfterHeading(content, 'Plan', 'Step: implement and verify fixture');
  content = insertAfterHeading(content, 'Acceptance Criteria', [
    '### AC-001: fixture is archive ready', 'Requirement: state matrix fixture', 'Type: functional',
    'Verification: unit', 'Automated: yes', 'Test: tests/state-matrix.test.js', '',
    'Scenario: fixture passes', '  Given complete artifacts', '  When validation runs', '  Then archive readiness is true'
  ].join('\n'));
  const design = ['## Design', 'Approach: fixture option.', 'Impact: fixture only.',
    'Interface / Data: markdown only.', 'Compatibility / Rollback: reversible fixture.', 'Verification: node:test.'].join('\n');
  fs.mkdirSync(path.dirname(designPath), { recursive: true });
  fs.mkdirSync(path.dirname(executeLogPath), { recursive: true });
  fs.writeFileSync(designPath, design);
  if (mode === 'standard') {
    const digest = require('../../src/core/workflow-policy').designReviewDigest(content, design);
    content = content.replace(/^Design Reviewed By:$/m, 'Design Reviewed By: subagent:design-fixture')
      .replace(/^Design Reviewed At:$/m, 'Design Reviewed At: 2026-01-01T00:00:02Z')
      .replace(/^Design Review Digest:$/m, 'Design Review Digest: ' + digest)
      .replace(/^Design Review Summary:$/m, 'Design Review Summary: independent fixture review');
  }
  content = authorizeAutoFixture(fillChallenge(content, 'PASS'));
  fs.writeFileSync(specPath, content);
  fs.writeFileSync(executeLogPath, completionLog());
  return { projectDir, specPath, designPath, executeLogPath, taskName };
}

function createArchiveReadyStandard(projectDir, taskName) { return createArchiveReady(projectDir, taskName, 'standard'); }
function createArchiveReadyLite(projectDir, taskName) { return createArchiveReady(projectDir, taskName || 'state-matrix-lite', 'lite'); }
function createArchiveReadyMicro(projectDir, taskName) { return createArchiveReady(projectDir, taskName || 'state-matrix-micro', 'micro'); }

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
