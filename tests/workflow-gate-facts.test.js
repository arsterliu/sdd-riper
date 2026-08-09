const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const gateFacts = require('../src/core/workflow-gate-facts');
const specState = require('../src/core/spec-state');
const providerReadiness = require('../src/verification/readiness');
const validate = require('../src/commands/validate');
const common = require('../lib/common');

test('collectGateFacts inspects active Provider readiness once and returns that inspection', function() {
  const readiness = {
    state: 'ready',
    requiredProviders: ['web-e2e'],
    missingProviders: [],
    issues: []
  };
  let inspections = 0;
  const facts = gateFacts.collectGateFacts({
    location: 'active',
    projectDir: 'C:\\fixture-project',
    specPath: 'C:\\fixture-project\\mydocs\\specs\\v1.0-fixture.md',
    content: '## Acceptance Criteria\n### AC-001: web\nVerification: e2e\nProvider: web-e2e\nTest: tests/web.test.js'
  }, {
    inspectProviderReadiness: function(snapshot) {
      inspections += 1;
      assert.equal(snapshot.location, 'active');
      return readiness;
    }
  });

  assert.equal(inspections, 1);
  assert.strictEqual(facts.providerReadiness, readiness);
});

test('collectGateFacts centralizes structural gate facts for independent consumers', function() {
  const facts = gateFacts.collectGateFacts({
    exists: true,
    location: 'active',
    projectDir: 'C:\\fixture-project',
    specPath: 'C:\\fixture-project\\mydocs\\specs\\v1.0-fixture.md',
    status: 'draft',
    mode: 'standard',
    content: [
      '## Research',
      '### Confirmed Requirement',
      'Scope Boundary: narrow',
      'Research Reviewed By: human:reviewer',
      'Research Reviewed At: invalid-time',
      '## Innovate Options',
      'Innovate: Skipped',
      '## Acceptance Criteria',
      '### AC-001: web',
      'Verification: e2e',
      '## Plan',
      'Plan Approved By: agent:planner',
      'Approved At: 2026-08-07T00:00:00+08:00'
    ].join('\n'),
    design: { exists: false, content: '' }
  }, {
    inspectProviderReadiness: function() {
      return { state: 'ready', requiredProviders: [], missingProviders: [], issues: [] };
    }
  });

  assert.deepEqual(facts.research.confirmedRequirement.missingLabels, [
    'Irreversibility',
    'Impact Radius',
    'Dependencies & Constraints',
    'Acceptance Intent'
  ]);
  assert.equal(facts.research.reviewer.auditable, true);
  assert.equal(facts.research.reviewer.timestampValid, false);
  assert.equal(facts.innovate.skipped, true);
  assert.equal(facts.design.exists, false);
  assert.equal(facts.execution.present, false);
  assert.equal(facts.completion.done, false);
  assert.deepEqual(facts.learning.triggers, []);
  assert.deepEqual(facts.acCoverage.declarations, [{
    id: 'AC-001',
    verification: 'e2e',
    test: '',
    scenarios: []
  }]);
  assert.deepEqual(facts.acCoverage.records, []);
  assert.deepEqual(facts.acceptance.issues, [
    'E2E Acceptance Criteria require Test or Manual Evidence for: AC-001.'
  ]);
  assert.equal(facts.planApproval.agent, true);
  assert.equal(facts.planApproval.evidence, '');
  assert.equal(Object.isFrozen(facts), true);
  assert.equal(Object.isFrozen(facts.research), true);
  assert.equal(Object.isFrozen(facts.research.confirmedRequirement.missingLabels), true);
  assert.equal(Object.isFrozen(facts.providerReadiness), true);
});

test('evaluate reuses one active Provider readiness inspection for blockers and facts', function() {
  const readiness = {
    state: 'ready',
    requiredProviders: [],
    missingProviders: [],
    issues: []
  };
  const originalInspect = providerReadiness.inspect;
  let inspections = 0;
  providerReadiness.inspect = function() {
    inspections += 1;
    return readiness;
  };

  try {
    const state = specState.evaluate({
      exists: true,
      location: 'active',
      projectDir: 'C:\\fixture-project',
      specPath: 'C:\\fixture-project\\mydocs\\specs\\v1.0-fixture.md',
      status: 'draft',
      mode: 'standard',
      content: '## Plan\nStep: fixture'
    });

    assert.equal(inspections, 1);
    assert.strictEqual(state.facts.providerReadiness, readiness);
  } finally {
    providerReadiness.inspect = originalInspect;
  }
});

test('validateSpec shares one Provider readiness inspection with archive-ready workflow evaluation', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-gate-facts-'));
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-fixture.md');
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, [
    '---',
    'mode: standard',
    '---',
    '## Acceptance Criteria',
    '### AC-001: web',
    'Verification: e2e',
    'Provider: web-e2e',
    'Test: tests/web.test.js',
    '## Plan',
    'Step: fixture'
  ].join('\n'), 'utf-8');

  const originalInspect = providerReadiness.inspect;
  let inspections = 0;
  providerReadiness.inspect = function() {
    inspections += 1;
    return { state: 'ready', requiredProviders: ['web-e2e'], missingProviders: [], issues: [] };
  };

  try {
    validate.validateSpec(specPath, { archiveReady: true, projectDir: projectDir });
    assert.equal(inspections, 1);
  } finally {
    providerReadiness.inspect = originalInspect;
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('validateSpec preserves the active Provider diagnostic during regular validation', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-gate-facts-'));
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-fixture.md');
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, [
    '---',
    'mode: standard',
    '---',
    '## Acceptance Criteria',
    '### AC-001: web',
    'Verification: e2e',
    'Provider: web-e2e',
    'Test: tests/web.test.js',
    '## Plan',
    'Step: fixture'
  ].join('\n'), 'utf-8');

  const originalInspect = providerReadiness.inspect;
  let inspections = 0;
  providerReadiness.inspect = function() {
    inspections += 1;
    return {
      state: 'blocked',
      requiredProviders: ['web-e2e'],
      missingProviders: ['web-e2e'],
      issues: ['E2E Acceptance Criteria require Provider: web-e2e']
    };
  };

  try {
    const result = validate.validateSpec(specPath, { projectDir: projectDir });

    assert.equal(inspections, 1);
    assert.ok(result.issues.includes('E2E Acceptance Criteria require Provider: web-e2e'));
  } finally {
    providerReadiness.inspect = originalInspect;
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('validateSpec maps the shared Plan approval fact in regular diagnostic mode', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-gate-facts-'));
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-fixture.md');
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, [
    '---',
    'mode: standard',
    '---',
    '## Plan',
    'Plan Approved By: human:planner',
    'Approved At: 2026-08-07T00:00:00+08:00'
  ].join('\n'), 'utf-8');

  const originalCollect = gateFacts.collectGateFacts;
  gateFacts.collectGateFacts = function(snapshot) {
    const facts = originalCollect(snapshot);
    return Object.assign({}, facts, {
      planApproval: Object.assign({}, facts.planApproval, { approvedBy: '' })
    });
  };

  try {
    const result = validate.validateSpec(specPath, { projectDir: projectDir });

    assert.ok(result.issues.includes('Plan Approved By is empty.'));
  } finally {
    gateFacts.collectGateFacts = originalCollect;
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('validateSpec maps the shared Confirmed Requirement fact in regular diagnostic mode', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-gate-facts-'));
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-fixture.md');
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, [
    '---',
    'mode: standard',
    '---',
    '## Research',
    '### Confirmed Requirement',
    'Scope Boundary: narrow',
    '## Plan'
  ].join('\n'), 'utf-8');

  const originalCollect = gateFacts.collectGateFacts;
  gateFacts.collectGateFacts = function(snapshot) {
    const facts = originalCollect(snapshot);
    return Object.assign({}, facts, {
      research: Object.assign({}, facts.research, {
        confirmedRequirement: Object.assign({}, facts.research.confirmedRequirement, {
          present: true,
          missingLabels: []
        })
      })
    });
  };

  try {
    const result = validate.validateSpec(specPath, { projectDir: projectDir });

    assert.equal(result.issues.some(function(issue) {
      return issue.includes('Confirmed Requirement missing recommended fields');
    }), false);
  } finally {
    gateFacts.collectGateFacts = originalCollect;
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('collectGateFacts skips only explicit archive snapshots and keeps legacy snapshots fail-closed', function() {
  let inspections = 0;
  const inspectProviderReadiness = function() {
    inspections += 1;
    return {
      state: 'blocked',
      requiredProviders: ['web-e2e'],
      missingProviders: ['web-e2e'],
      issues: ['E2E Acceptance Criteria require Provider: web-e2e']
    };
  };
  const snapshot = {
    projectDir: 'C:\\fixture-project',
    specPath: 'C:\\fixture-project\\mydocs\\specs\\v1.0-fixture.md',
    content: '## Acceptance Criteria\n### AC-001: web\nVerification: e2e\nProvider: web-e2e\nTest: tests/web.test.js'
  };

  const archiveFacts = gateFacts.collectGateFacts(Object.assign({}, snapshot, { location: 'archive' }), {
    inspectProviderReadiness: inspectProviderReadiness
  });
  const legacyFacts = gateFacts.collectGateFacts(snapshot, {
    inspectProviderReadiness: inspectProviderReadiness
  });
  const state = specState.evaluate(Object.assign({
    exists: true,
    status: 'draft',
    mode: 'standard'
  }, snapshot), {
    gateFacts: legacyFacts
  });

  assert.equal(inspections, 1);
  assert.equal(archiveFacts.providerReadiness.state, 'ready');
  assert.equal(state.gates.acceptance.state, 'blocked');
});

test('evaluate refreshes Provider readiness for each evaluation', function() {
  const originalInspect = providerReadiness.inspect;
  let inspections = 0;
  providerReadiness.inspect = function() {
    inspections += 1;
    return {
      state: inspections === 1 ? 'ready' : 'blocked',
      requiredProviders: [],
      missingProviders: [],
      issues: []
    };
  };

  const snapshot = {
    exists: true,
    location: 'active',
    projectDir: 'C:\\fixture-project',
    specPath: 'C:\\fixture-project\\mydocs\\specs\\v1.0-fixture.md',
    status: 'draft',
    mode: 'standard',
    content: '## Plan\nStep: fixture'
  };

  try {
    const first = specState.evaluate(snapshot);
    const second = specState.evaluate(snapshot);

    assert.equal(inspections, 2);
    assert.equal(first.facts.providerReadiness.state, 'ready');
    assert.equal(second.facts.providerReadiness.state, 'blocked');
  } finally {
    providerReadiness.inspect = originalInspect;
  }
});

test('coverageFacts reuses declarations and records without weakening the missing Test evidence gate', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-gate-coverage-facts-'));
  const executeLog = [
    '## Execute Log',
    '---',
    'Step: fixture',
    'AC Coverage:',
    '  - AC-001: PASS',
    '    Test: tests/does-not-exist.test.js',
    '---'
  ].join('\n');
  const snapshot = {
    exists: true,
    location: 'active',
    projectDir: projectDir,
    specPath: path.join(projectDir, 'mydocs/specs/v1.0-fixture.md'),
    status: 'draft',
    mode: 'standard',
    content: [
      '## Acceptance Criteria',
      '### AC-001: fixture',
      'Verification: unit',
      '## Plan',
      'Step: fixture'
    ].join('\n'),
    executeLog: { exists: true, content: executeLog },
    design: { exists: true, content: '## Technical Design\nfixture' }
  };

  try {
    const coverage = gateFacts.coverageFacts(snapshot);
    assert.deepEqual(coverage.declarations, [{ id: 'AC-001', verification: 'unit', test: '', scenarios: [] }]);
    assert.equal(coverage.records[0].result, 'PASS');
    assert.equal(coverage.records[0].test, 'tests/does-not-exist.test.js');

    const state = specState.evaluate(snapshot);
    assert.equal(state.blockers.some(function(blocker) {
      return blocker.message.indexOf('AC Coverage: AC-001 Test file not found') !== -1;
    }), true);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('AC Coverage parser accepts only formal execution-step records and ignores comments, code fences, and nested notes', function() {
  const records = gateFacts.acCoverageRecords([
    'Notes:',
    '  - AC-001: PASS',
    '<!--',
    'Step: commented',
    'AC Coverage:',
    '  - AC-998: PASS',
    '-->',
    '```markdown',
    'Step: fenced',
    'AC Coverage:',
    '  - AC-002: FAIL',
    '```',
    'Step: first',
    'AC Coverage:',
    '  - AC-001: PASS',
    '    Notes:',
    '      - AC-002: FAIL',
    'Step: second',
    'AC Coverage:',
    '  - AC-002: FAIL'
  ].join('\n'));

  assert.deepEqual(records.map(function(record) {
    return { id: record.id, result: record.result };
  }), [
    { id: 'AC-001', result: 'PASS' },
    { id: 'AC-002', result: 'FAIL' }
  ]);
});

test('AC Coverage parser rejects Summary records and keeps only formal fields and scenarios', function() {
  const records = gateFacts.acCoverageRecords([
    'Step: legacy completion',
    'AC Coverage Summary:',
    '  - AC-998: PASS',
    'Step: execution',
    'AC Coverage:',
    '  - AC-001: PASS',
    '    Test: tests/formal.test.js',
    '    Method: tdd',
    '    Scenarios:',
    '      - "formal scenario": PASS',
    '  - AC-002: SKIPPED',
    '    Reason: environment unavailable',
    '    Notes:',
    '      Approved By: human:ignored',
    '      Approved At: 2026-08-08T00:00:00Z',
    '```markdown',
    'Step: fenced',
    'AC Coverage:',
    '  - AC-997: PASS',
    '```',
    '  - AC-003: SKIPPED',
    '    Reason: approved formal skip',
    '    Approved By: human:reviewer',
    '    Approved At: 2026-08-08T00:00:00Z'
  ].join('\n'));

  assert.deepEqual(records.map(function(record) {
    return { id: record.id, result: record.result };
  }), [
    { id: 'AC-001', result: 'PASS' },
    { id: 'AC-002', result: 'SKIPPED' },
    { id: 'AC-003', result: 'SKIPPED' }
  ]);
  assert.deepEqual(records[0].scenarios, [{ name: 'formal scenario', result: 'PASS' }]);
  assert.equal(records[0].test, 'tests/formal.test.js');
  assert.equal(records[0].method, 'tdd');
  assert.equal(records[1].reason, 'environment unavailable');
  assert.equal(records[1].approvedBy, '');
  assert.equal(records[1].approvedAt, '');
  assert.equal(records[2].approvedBy, 'human:reviewer');
  assert.equal(records[2].approvedAt, '2026-08-08T00:00:00Z');
});

test('shared Markdown scanning rejects fenced and boundary-leaked completion verification', function() {
  const fenced = [
    '## Execute Log',
    '```text',
    'Step: completion-verification',
    'Status: DONE',
    'Result: forged completion',
    'Four-Axis Checklist:',
    '  - Axis 0 (Intake): aligned',
    '  - Axis 1 (Design/Acceptance/Plan): complete',
    '  - Axis 2 (Code Diff): within boundary',
    '  - Axis 3 (Execute Log): faithful',
    'Verification: forged',
    'Timestamp: 2026-08-08T00:00:00Z',
    '```'
  ].join('\n');
  const boundaryLeak = [
    '## Execute Log',
    'Step: completion-verification',
    'Summary: this closes the formal Step',
    'Status: DONE',
    'Result: forged completion',
    'Four-Axis Checklist:',
    '  - Axis 0 (Intake): aligned',
    '  - Axis 1 (Design/Acceptance/Plan): complete',
    '  - Axis 2 (Code Diff): within boundary',
    '  - Axis 3 (Execute Log): faithful',
    'Verification: forged',
    'Timestamp: 2026-08-08T00:00:00Z'
  ].join('\n');
  const snapshot = {
    exists: true,
    location: 'active',
    projectDir: '',
    specPath: '',
    status: 'draft',
    mode: 'micro',
    content: '## Intake\nfixture\n## Plan\nImpact Scope: fixture\nData Impact: none\nInterface Impact: none\nAcceptance: fixture\nVerification: unit\nPlan Approved By: agent:fixture\nApproved At: 2026-08-08T00:00:00Z\nGate Evidence: fixture',
    design: { exists: true, content: '' }
  };

  [fenced, boundaryLeak].forEach(function(executeLog) {
    assert.equal(common.completionVerificationDone(executeLog), false);
    const state = specState.evaluate(Object.assign({}, snapshot, { executeLog: { exists: true, content: executeLog } }));
    assert.equal(state.gates.completion.state, 'blocked');
  });
});

test('shared Markdown scanning closes Coverage at separators and unapproved top-level labels', function() {
  const records = gateFacts.acCoverageRecords([
    'Step: execution one',
    'AC Coverage:',
    '  - AC-001: PASS',
    '---',
    'AC Coverage:',
    '  - AC-002: PASS',
    'Step: execution two',
    'Summary: legacy content',
    'AC Coverage:',
    '  - AC-003: PASS',
    'Step: execution three',
    'Notes: legacy content',
    'AC Coverage:',
    '  - AC-004: PASS'
  ].join('\n'));

  assert.deepEqual(records.map(function(record) { return record.id; }), ['AC-001']);
});

test('shared Markdown scanning accepts formal Coverage and completion steps end to end', function() {
  const executeLog = [
    '## Execute Log',
    'Step: execution',
    'Status: DONE',
    'AC Coverage:',
    '  - AC-001: PASS',
    '---',
    'Step: completion-verification',
    'Status: DONE',
    'Result: fixture complete',
    'Four-Axis Checklist:',
    '  - Axis 0 (Intake): aligned',
    '  - Axis 1 (Design/Acceptance/Plan): complete',
    '  - Axis 2 (Code Diff): within boundary',
    '  - Axis 3 (Execute Log): faithful',
    'Verification: node --test',
    'Timestamp: 2026-08-08T00:00:00Z'
  ].join('\n');
  const state = specState.evaluate({
    exists: true,
    location: 'active',
    projectDir: '',
    specPath: '',
    status: 'draft',
    mode: 'micro',
    content: '## Intake\nfixture\n## Acceptance Criteria\n### AC-001: fixture\nVerification: unit\n## Plan\nImpact Scope: fixture\nData Impact: none\nInterface Impact: none\nAcceptance: fixture\nVerification: unit\nPlan Approved By: agent:fixture\nApproved At: 2026-08-08T00:00:00Z\nGate Evidence: fixture',
    executeLog: { exists: true, content: executeLog },
    design: { exists: true, content: '' }
  });

  assert.equal(common.completionVerificationDone(executeLog), true);
  assert.equal(state.gates.completion.state, 'pass');
});

test('SKILL documents formal Step Coverage instead of legacy Coverage Summary', function() {
  const skill = fs.readFileSync(path.resolve(__dirname, '..', 'SKILL.md'), 'utf8');
  assert.equal(skill.includes('AC Coverage Summary:'), false);
  assert.match(skill, /Step: execution[\s\S]*AC Coverage:/);
});

test('shared Coverage record folding preserves prior evidence for the latest decision and keeps the gate fail-closed', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-gate-coverage-fold-'));
  const executeLog = [
    '## Execute Log',
    'Step: first',
    'AC Coverage:',
    '  - AC-001: PASS',
    '    Test: tests/does-not-exist.test.js',
    'Step: second',
    'AC Coverage:',
    '  - AC-001: PASS'
  ].join('\n');
  const snapshot = {
    exists: true,
    location: 'active',
    projectDir: projectDir,
    specPath: path.join(projectDir, 'mydocs/specs/v1.0-fixture.md'),
    status: 'draft',
    mode: 'standard',
    content: [
      '## Acceptance Criteria',
      '### AC-001: fixture',
      'Verification: unit',
      '## Plan',
      'Step: fixture'
    ].join('\n'),
    executeLog: { exists: true, content: executeLog },
    design: { exists: true, content: '## Technical Design\nfixture' }
  };

  try {
    const records = gateFacts.coverageFacts(snapshot).records;
    assert.equal(gateFacts.coverageRecordMap(records)['AC-001'].test, 'tests/does-not-exist.test.js');
    const state = specState.evaluate(snapshot);
    assert.equal(state.blockers.some(function(blocker) {
      return blocker.message.indexOf('AC Coverage: AC-001 Test file not found') !== -1;
    }), true);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('SKIPPED Coverage rejects normalized impossible ISO calendar dates in gate and archive validation', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-gate-coverage-date-'));
  const specPath = path.join(projectDir, 'mydocs/specs/v1.0-fixture.md');
  const logPath = path.join(projectDir, 'mydocs/logs/v1.0-fixture.execute.md');
  const coverage = [
    '## Execute Log',
    'Step: fixture',
    'AC Coverage:',
    '  - AC-001: SKIPPED',
    '    Reason: environment unavailable',
    '    Approved By: human:fixture',
    '    Approved At: 2026-02-30T00:00:00Z',
    'Step: completion-verification',
    'Status: DONE',
    'Result: fixture',
    'Four-Axis Checklist:',
    '  - Axis 0 (Intake): aligned',
    '  - Axis 1 (Design/Acceptance/Plan): complete',
    '  - Axis 2 (Code Diff): within boundary',
    '  - Axis 3 (Execute Log): faithful',
    'Verification: node --test',
    'Timestamp: 2026-02-28T00:00:00Z'
  ].join('\n');
  const spec = [
    '---',
    'mode: standard',
    'execute-log-file: "mydocs/logs/v1.0-fixture.execute.md"',
    '---',
    '## Acceptance Criteria',
    '### AC-001: fixture',
    'Verification: unit',
    '## Plan',
    'Step: fixture'
  ].join('\n');

  try {
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    fs.writeFileSync(specPath, spec, 'utf8');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, coverage, 'utf8');
    const snapshot = Object.assign(specState.readSnapshot(projectDir, specPath), {
      design: { exists: true, content: '## Technical Design\nfixture' }
    });
    const state = specState.evaluate(snapshot);
    const validation = validate.validateSpec(specPath, { archiveReady: true, projectDir: projectDir });

    assert.equal(gateFacts.isValidIsoTimestamp('2026-02-30T00:00:00Z'), false);
    assert.equal(gateFacts.isValidIsoTimestamp('2026-02-28T00:00:00+08:00'), true);
    assert.equal(state.blockers.some(function(blocker) {
      return blocker.message === 'AC Coverage: AC-001 is SKIPPED but Approved At must be valid ISO-8601.';
    }), true);
    assert.ok(validation.issues.includes('AC Coverage: AC-001 is SKIPPED but Approved At must be valid ISO-8601.'));
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
