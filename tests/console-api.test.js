'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const createServer = require('../src/commands/console').createServer;
const consoleFixtures = require('./helpers/verification-fixtures');

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function createProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-console-api-'));
  write(path.join(root, '.sdd-config'), 'DOCS_DIR="mydocs"\nAUTONOMY_MODE="auto"\n');
  write(path.join(root, '.sdd-verification.json'), JSON.stringify({ schemaVersion: 1, providers: {} }, null, 2));
  write(path.join(root, 'mydocs/specs/v1.0-api-task.md'), [
    '---',
    'date: 2026-07-29',
    'task-name: "api-task"',
    'mode: standard',
    'status: draft',
    'design-file: "mydocs/design/v1.0-api-task.design.md"',
    'execute-log-file: "mydocs/logs/v1.0-api-task.execute.md"',
    '---',
    '## Summary',
    'fixture',
    '## Research',
    '### Confirmed Requirement',
    'Scope Boundary: fixture',
    '## Acceptance Criteria',
    '### AC-001: fixture',
    'Verification: unit',
    'Automated: yes',
    'Test: tests/console-api.test.js',
    '## Plan',
    'Step: fixture',
    'Plan Approved By: agent:fixture',
    'Approved At: 2026-07-29T00:00:00Z',
    'Gate Evidence: fixture'
  ].join('\n') + '\n');
  return root;
}

function requestJson(server, pathname) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: pathname,
      headers: { Host: '127.0.0.1:' + address.port }
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: JSON.parse(body) }));
    });
    request.on('error', reject);
    request.end();
  });
}

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

function assertUnavailableDetail(response, secrets) {
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.verification, {
    schemaVersion: 1,
    state: 'unavailable',
    providers: []
  });
  assert.deepEqual(response.body.qualityPlan, {
    schemaVersion: 1,
    state: 'unavailable',
    policyVersion: '',
    source: null,
    acFacts: [],
    policyFocus: [],
    acMappings: [],
    e2eReadiness: null,
    diagnostics: [{
      code: 'quality-plan-unavailable',
      severity: 'attention',
      message: 'Quality Plan cannot be projected safely.',
      recovery: 'Review the existing Quality Plan input before retrying.'
    }]
  });
  assert.deepEqual(response.body.acCoverage, {
    schemaVersion: 1,
    completionState: 'missing',
    items: [],
    diagnostics: [{ code: 'ac-coverage-unavailable' }]
  });
  secrets.forEach(secret => assert.doesNotMatch(JSON.stringify(response.body), secret));
}

async function waitForSpecs(server) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await requestJson(server, '/api/specs');
    if (response.statusCode === 200 && response.body.state === 'ready') return response;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return requestJson(server, '/api/specs');
}

test('GET /api/project 返回安全的 missing Profile view', async t => {
  const root = createProject();
  const server = createServer(root);
  await listen(server);
  t.after(async () => {
    await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const response = await requestJson(server, '/api/project');

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.profile, {
    schemaVersion: 1,
    state: 'missing',
    revision: '',
    digest: '',
    unitCount: 0,
    relationCount: 0,
    units: [],
    diagnostics: [{
      code: 'profile-missing',
      severity: 'attention',
      message: 'No confirmed Project Profile is available.',
      recovery: 'Run the existing profile detect/review/confirm flow.'
    }]
  });
});

test('GET /api/specs 为响应副本附加 Work State', async t => {
  const root = createProject();
  const server = createServer(root);
  await listen(server);
  t.after(async () => {
    await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const response = await waitForSpecs(server);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.specs.length, 1);
  assert.deepEqual(response.body.specs[0].workState, {
    id: 'in_progress',
    label: 'In progress',
    tone: 'progress'
  });
});

test('GET /api/specs 不污染 Spec index 缓存', async t => {
  const root = createProject();
  const server = createServer(root);
  await listen(server);
  t.after(async () => {
    await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const response = await waitForSpecs(server);
  const cached = require('../src/core/project-indexer').getSnapshot(root);

  assert.equal(Object.prototype.hasOwnProperty.call(cached.specs[0], 'workState'), false);
});

test('GET /api/specs/:id 同时返回 Quality blocking 和既有 Verification view', async t => {
  const root = createProject();
  const server = createServer(root);
  await listen(server);
  t.after(async () => {
    await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const list = await waitForSpecs(server);
  const detail = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id));

  assert.equal(detail.statusCode, 200);
  assert.deepEqual(detail.body.workState, {
    id: 'in_progress',
    label: 'In progress',
    tone: 'progress'
  });
  assert.equal(detail.body.qualityPlan.state, 'blocking');
  assert.equal(detail.body.qualityPlan.diagnostics[0].code, 'profile-required');
  assert.equal(detail.body.verification.schemaVersion, 1);
});

test('Console API 将 confirmed Profile、exact Quality Plan 与 archived 边界一起投影', async t => {
  const fixture = consoleFixtures.createConsoleE2EProject();
  const server = createServer(fixture.projectDir);
  await listen(server);
  t.after(async () => {
    await close(server);
    assert.equal(consoleFixtures.cleanupOwnedProject(fixture), true);
  });

  const project = await requestJson(server, '/api/project');
  assert.equal(project.body.profile.state, 'confirmed');
  assert.equal(project.body.profile.units[0].id, 'web');
  assert.doesNotMatch(JSON.stringify(project.body.profile), /fixture-secret/);

  const list = await waitForSpecs(server);
  assert.equal(list.body.specs.length, 4);
  const evidence = list.body.specs.find(spec => spec.taskName === 'evidence-view');
  const required = list.body.specs.find(spec => spec.taskName === 'provider-required');
  const archived = list.body.specs.find(spec => spec.taskName === 'archived-quality');
  assert.equal(evidence.workState.id, 'in_progress');
  assert.equal(archived.workState.id, 'archived');

  const evidenceDetail = await requestJson(server, '/api/specs/' + encodeURIComponent(evidence.id));
  assert.equal(evidenceDetail.body.qualityPlan.state, 'available');
  assert.equal(evidenceDetail.body.qualityPlan.source.effectiveAffectedUnits[0], 'web');
  assert.equal(evidenceDetail.body.qualityPlan.policyFocus[0].id, 'frontend-behavior');
  assert.doesNotMatch(JSON.stringify(evidenceDetail.body.qualityPlan), /fixture-secret/);

  const requiredDetail = await requestJson(server, '/api/specs/' + encodeURIComponent(required.id));
  assert.equal(requiredDetail.body.qualityPlan.state, 'blocking');
  assert.equal(requiredDetail.body.qualityPlan.diagnostics[0].code, 'profile-required');

  const archivedDetail = await requestJson(server, '/api/specs/' + encodeURIComponent(archived.id));
  assert.equal(archivedDetail.body.qualityPlan.state, 'not_applicable');
});

test('Console detail 仅在请求内共享 assessment，并为新请求重新创建', async t => {
  const fixture = consoleFixtures.createConsoleE2EProject();
  const readiness = require('../src/verification/readiness');
  let assessmentCalls = 0;
  let inspectionCalls = 0;
  const server = createServer(fixture.projectDir, {
    assessReadiness(specContent, projectDir, specPath) {
      assessmentCalls += 1;
      return readiness.assess(specContent, projectDir, specPath);
    },
    inspectReadiness() {
      inspectionCalls += 1;
      throw new Error('Quality must consume the request assessment summary');
    }
  });
  await listen(server);
  t.after(async () => {
    await close(server);
    assert.equal(consoleFixtures.cleanupOwnedProject(fixture), true);
  });

  const list = await waitForSpecs(server);
  const evidence = list.body.specs.find(spec => spec.taskName === 'evidence-view');
  const first = await requestJson(server, '/api/specs/' + encodeURIComponent(evidence.id));
  const second = await requestJson(server, '/api/specs/' + encodeURIComponent(evidence.id));

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(assessmentCalls, 2);
  assert.equal(inspectionCalls, 0);
  assert.equal(first.body.qualityPlan.e2eReadiness.state, second.body.qualityPlan.e2eReadiness.state);
  assert.equal(Object.prototype.hasOwnProperty.call(first.body.qualityPlan, 'assessment'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(first.body.verification, 'assessment'), false);
});

test('GET /api/specs/:id projects a stable unavailable detail when assessment throws', async t => {
  const root = createProject();
  const calls = { assessment: 0, verification: 0, quality: 0, coverage: 0 };
  const server = createServer(root, {
    assessReadiness() {
      calls.assessment += 1;
      throw new Error('token=assessment-secret at C:\\private\\assessment.txt');
    },
    buildConsoleProjection() {
      calls.verification += 1;
      throw new Error('verification must not retry an unavailable assessment');
    },
    inspectReadiness() {
      calls.quality += 1;
      throw new Error('quality must not create a second assessment');
    },
    coverageFacts() {
      calls.coverage += 1;
      throw new Error('coverage must not run after an unavailable assessment');
    }
  });
  await listen(server);
  t.after(async () => {
    await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const list = await waitForSpecs(server);
  const detail = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id));

  assertUnavailableDetail(detail, [/assessment-secret/, /C:\\private/]);
  assert.deepEqual(calls, { assessment: 1, verification: 0, quality: 0, coverage: 0 });
});

test('GET /api/specs/:id projects a stable unavailable detail when freshness throws', async t => {
  const fixture = consoleFixtures.createConsoleE2EProject();
  const readiness = require('../src/verification/readiness');
  const calls = { assessment: 0, freshness: 0, verification: 0, quality: 0, coverage: 0 };
  const server = createServer(fixture.projectDir, {
    assessReadiness(specContent, projectDir, specPath) {
      calls.assessment += 1;
      return readiness.assess(specContent, projectDir, specPath, {
        evaluateFreshness() {
          calls.freshness += 1;
          throw new Error('token=freshness-secret at C:\\private\\freshness.txt');
        }
      });
    },
    buildConsoleProjection() {
      calls.verification += 1;
      throw new Error('verification must not retry a freshness failure');
    },
    inspectReadiness() {
      calls.quality += 1;
      throw new Error('quality must not create a second assessment');
    },
    coverageFacts() {
      calls.coverage += 1;
      throw new Error('coverage must not run after a freshness failure');
    }
  });
  await listen(server);
  t.after(async () => {
    await close(server);
    assert.equal(consoleFixtures.cleanupOwnedProject(fixture), true);
  });

  const list = await waitForSpecs(server);
  const evidence = list.body.specs.find(spec => spec.taskName === 'evidence-view');
  const detail = await requestJson(server, '/api/specs/' + encodeURIComponent(evidence.id));

  assertUnavailableDetail(detail, [/freshness-secret/, /C:\\private/]);
  assert.deepEqual(calls, { assessment: 1, freshness: 1, verification: 0, quality: 0, coverage: 0 });
});

test('GET /api/specs/:id appends a redacted v1 AC Coverage DTO', async t => {
  const root = createProject();
  const specPath = path.join(root, 'mydocs/specs/v1.0-api-task.md');
  write(path.join(root, 'tests/passing.test.js'), 'test fixture\n');
  write(specPath, fs.readFileSync(specPath, 'utf8').replace([
    '### AC-001: fixture',
    'Verification: unit',
    'Automated: yes',
    'Test: tests/console-api.test.js'
  ].join('\n'), [
    '### AC-001: missing',
    'Verification: unit',
    '### AC-002: pass',
    'Verification: unit',
    '### AC-003: fail',
    'Verification: unit',
    '### AC-004: skipped',
    'Verification: unit',
    '### AC-005: invalid',
    'Verification: unit',
    '### AC-006: skipped incomplete',
    'Verification: unit'
  ].join('\n')));
  write(path.join(root, 'mydocs/logs/v1.0-api-task.execute.md'), [
    '## Execute Log',
    '---',
    'Step: fixture',
    'AC Coverage:',
    '  - AC-002: PASS',
    '    Test: tests/passing.test.js',
    '    Method: tdd',
    '  - AC-003: FAIL',
    '    Test: tests/failing.test.js',
    '  - AC-004: SKIPPED',
    '    Reason: token=fixture-secret: environment unavailable',
    '    Approved By: human:fixture-owner',
    '    Approved At: 2026-08-08T00:00:00Z',
    '  - AC-005: PASS',
    '    Test: tests/missing-secret-path.test.js',
    '  - AC-006: SKIPPED',
    '    Approved By: agent:not-human',
    '---'
  ].join('\n') + '\n');
  const server = createServer(root);
  await listen(server);
  t.after(async () => {
    await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const list = await waitForSpecs(server);
  const detail = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id));

  assert.equal(detail.statusCode, 200);
  assert.deepEqual(detail.body.acCoverage, {
    schemaVersion: 1,
    completionState: 'recorded',
    items: [
      { acId: 'AC-001', state: 'missing', skipApprovalState: 'not_applicable' },
      { acId: 'AC-002', state: 'pass', skipApprovalState: 'not_applicable' },
      { acId: 'AC-003', state: 'fail', skipApprovalState: 'not_applicable' },
      { acId: 'AC-004', state: 'skipped', skipApprovalState: 'approved' },
      { acId: 'AC-005', state: 'invalid', skipApprovalState: 'not_applicable' },
      { acId: 'AC-006', state: 'skipped', skipApprovalState: 'incomplete' }
    ],
    diagnostics: [
      { code: 'ac-coverage-invalid-evidence' },
      { code: 'ac-coverage-skip-approval-incomplete' }
    ]
  });
  ['verification', 'qualityPlan', 'workflow', 'validate'].forEach(function(field) {
    assert.equal(Object.prototype.hasOwnProperty.call(detail.body, field), true, field + ' must remain available');
  });
  const coverageJson = JSON.stringify(detail.body.acCoverage);
  [
    'tests/passing.test.js',
    'tests/missing-secret-path.test.js',
    'fixture-secret',
    'fixture-owner',
    '2026-08-08T00:00:00Z',
    'Provider:',
    'runId',
    'token='
  ].forEach(function(secret) {
    assert.doesNotMatch(coverageJson, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});

test('GET /api/specs/:id returns a stable safe DTO when coverage records are missing', async t => {
  const root = createProject();
  const server = createServer(root);
  await listen(server);
  t.after(async () => {
    await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const list = await waitForSpecs(server);
  const detail = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id));

  assert.equal(detail.statusCode, 200);
  assert.deepEqual(detail.body.acCoverage, {
    schemaVersion: 1,
    completionState: 'missing',
    items: [{ acId: 'AC-001', state: 'missing', skipApprovalState: 'not_applicable' }],
    diagnostics: [{ code: 'ac-coverage-records-missing' }]
  });
});

test('GET /api/specs/:id keeps a successful detail response when Coverage facts fail', async t => {
  const root = createProject();
  const server = createServer(root, {
    coverageFacts() {
      throw new Error('token=coverage-secret at C:\\private\\coverage.md');
    }
  });
  await listen(server);
  t.after(async () => {
    await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const list = await waitForSpecs(server);
  const detail = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id));

  assert.equal(detail.statusCode, 200);
  assert.deepEqual(detail.body.acCoverage, {
    schemaVersion: 1,
    completionState: 'missing',
    items: [],
    diagnostics: [{ code: 'ac-coverage-unavailable' }]
  });
  assert.doesNotMatch(JSON.stringify(detail.body), /coverage-secret|C:\\private/);
});
