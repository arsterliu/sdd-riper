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
  write(path.join(root, '.sdd-config'), 'DOCS_DIR="mydocs"\nAPPROVAL_POLICY="agent"\n');
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
