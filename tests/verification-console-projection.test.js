'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const evidence = require('../src/verification/evidence');
const readiness = require('../src/verification/readiness');

function run(id, createdAt, decision, acIds, extra) {
  return Object.assign({
    runId: id,
    createdAt,
    providerId: 'console-e2e',
    adapterId: 'playwright-test',
    status: decision === 'PASS' ? 'passed' : 'failed',
    freshness: 'fresh',
    gateDecision: decision,
    targets: { acIds, projects: ['chromium'] },
    diagnostics: [],
    attachments: [],
    process: { stdout: 'must never reach the browser' },
    environmentDigests: { SECRET_TOKEN: 'a'.repeat(64) },
    testExecutions: [{ id: 'raw-playwright-test-id' }]
  }, extra || {});
}

test('shared evaluator uses dynamic freshness and latest fresh evidence for each AC/project', () => {
  const oldPass = run('old-pass', '2026-07-12T00:00:00Z', 'PASS', ['AC-003']);
  const newerFail = run('new-fail', '2026-07-12T00:01:00Z', 'FAIL', ['AC-003']);
  const persistedFreshButStale = run('stale-pass', '2026-07-12T00:02:00Z', 'PASS', ['AC-004']);

  const result = evidence.evaluateProviderEvidence({
    runs: [oldPass, persistedFreshButStale, newerFail],
    expectedAcs: ['AC-003', 'AC-004'],
    expectedProjects: ['chromium'],
    evaluateFreshness(current) {
      return current.runId === 'stale-pass'
        ? { freshness: 'stale', reasons: ['codeState'] }
        : { freshness: 'fresh', reasons: [] };
    }
  });

  assert.equal(result.runs[0].runId, 'stale-pass');
  assert.equal(result.runs[0].freshness, 'stale');
  assert.deepEqual(result.runs[0].freshnessReasons, ['codeState']);
  assert.deepEqual(result.matrix.cells.find(cell => cell.acId === 'AC-003'), {
    acId: 'AC-003', project: 'chromium', state: 'FAIL', gateDecision: 'FAIL', runId: 'new-fail'
  });
  assert.deepEqual(result.matrix.cells.find(cell => cell.acId === 'AC-004'), {
    acId: 'AC-004', project: 'chromium', state: 'missing', gateDecision: '', runId: ''
  });
  assert.deepEqual(result.missingPairs, ['AC-003/chromium', 'AC-004/chromium']);
});

test('run projection is a strict whitelist with secondary redaction and controlled attachments', () => {
  const projected = evidence.projectRun(run('unsafe', '2026-07-12T00:00:00Z', 'FAIL', ['AC-003'], {
    diagnostics: [{
      code: 'token=code-secret',
      message: 'token=super-secret at C:\\Users\\alice\\repo\\failure.txt ' + 'x'.repeat(1200)
    }],
    attachments: [
      { name: 'C:\\Users\\alice\\token=name-secret.zip', mediaType: 'secret=media-secret', size: 42, sha256: 'b'.repeat(64), path: 'artifacts/token=path-secret.zip' },
      { name: 'escape.txt', mediaType: 'text/plain', size: 1, sha256: 'c'.repeat(64), path: '../escape.txt' }
    ]
  }), { freshness: 'fresh', reasons: [] });

  assert.deepEqual(Object.keys(projected).sort(), [
    'attachments', 'createdAt', 'diagnostics', 'freshness', 'freshnessReasons',
    'gateDecision', 'runId', 'status', 'targets'
  ]);
  const serialized = JSON.stringify(projected);
  assert.doesNotMatch(serialized, /super-secret|code-secret|name-secret|media-secret|path-secret|C:\\\\Users|process|environmentDigests|raw-playwright-test-id/);
  assert.match(projected.diagnostics[0].message, /token=\[REDACTED\]/);
  assert.ok(projected.diagnostics[0].message.length <= 1000);
  assert.deepEqual(projected.attachments.map(item => item.path), ['artifacts/token=[REDACTED]']);
});

test('console projection exposes only referenced provider configuration and bounded run evidence', () => {
  const spec = [
    '## Acceptance Criteria',
    '### AC-003: Console works',
    'Verification: e2e',
    'Provider: console-e2e'
  ].join('\n');
  const provider = {
    adapter: 'playwright-test', workspaceRoot: 'C:\\outside\\token=provider-secret', packageRoot: '../apps/web',
    config: '/outside/playwright.config.js', projects: ['chromium'], command: 'forbidden'
  };
  const result = evidence.buildConsoleProjection(spec, '/project', '/project/spec.md', {
    loadConfig() { return { schemaVersion: 1, providers: { 'console-e2e': provider, unrelated: provider } }; },
    runsForProvider() { return [run('one', '2026-07-12T00:00:00Z', 'PASS', ['AC-003'])]; },
    evaluateFreshness() { return { freshness: 'fresh', reasons: [] }; }
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.state, 'ready');
  assert.equal(result.providers.length, 1);
  assert.deepEqual(Object.keys(result.providers[0]).sort(), [
    'adapter', 'config', 'id', 'issues', 'matrix', 'packageRoot', 'projects',
    'readiness', 'runs', 'toolVersion', 'workspaceRoot'
  ]);
  assert.equal(JSON.stringify(result).includes('command'), false);
  assert.doesNotMatch(JSON.stringify(result), /provider-secret|C:\\\\outside|\.\.\/|\/outside/);
});

test('temporary project cleanup requires prefix, temp containment, marker kind, token, and matching pid', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const fixture = require('./helpers/verification-fixtures');
  const wrong = fs.mkdtempSync(path.join(os.tmpdir(), 'unowned-console-'));
  fs.writeFileSync(path.join(wrong, fixture.OWNER_FILE), JSON.stringify({ kind: 'sdd-console-e2e', token: 'x', serverPid: 10 }));
  assert.equal(fixture.ownedProject({ projectDir: wrong, token: 'x', serverPid: 10 }), false);
  fs.rmSync(wrong, { recursive: true, force: true });

  const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-console-e2e-'));
  fs.writeFileSync(path.join(owned, fixture.OWNER_FILE), JSON.stringify({ kind: 'wrong', token: 'x', serverPid: 10 }));
  assert.equal(fixture.ownedProject({ projectDir: owned, token: 'x', serverPid: 10 }), false);
  fs.writeFileSync(path.join(owned, fixture.OWNER_FILE), JSON.stringify({ kind: 'sdd-console-e2e', token: 'x', serverPid: 11 }));
  assert.equal(fixture.ownedProject({ projectDir: owned, token: 'x', serverPid: 10 }), false);
  fs.writeFileSync(path.join(owned, fixture.OWNER_FILE), JSON.stringify({ kind: 'sdd-console-e2e', token: 'x', serverPid: 10 }));
  assert.equal(fixture.ownedProject({ projectDir: owned, token: 'x', serverPid: 10 }), true);
  assert.equal(fixture.cleanupOwnedProject({ projectDir: owned, token: 'x', serverPid: 10 }), true);
});

test('complete fresh evidence keeps Console ready despite historical stale runs and sanitizes matrix projects', () => {
  const spec = ['## Acceptance Criteria', '### AC-003: Console works', 'Verification: e2e', 'Provider: console-e2e'].join('\n');
  const provider = { adapter: 'playwright-test', workspaceRoot: '.', packageRoot: '.',
    config: 'playwright.config.js', projects: ['token=matrix-secret'] };
  const fresh = run('fresh-pass', '2026-07-12T00:01:00Z', 'PASS', ['AC-003'], {
    targets: { acIds: ['AC-003'], projects: ['token=matrix-secret'] }
  });
  const stale = run('old-stale', '2026-07-12T00:00:00Z', 'PASS', ['AC-003'], {
    targets: { acIds: ['AC-003'], projects: ['token=matrix-secret'] }
  });
  const result = evidence.buildConsoleProjection(spec, '/project', '/project/spec.md', {
    loadConfig() { return { schemaVersion: 1, providers: { 'console-e2e': provider } }; },
    runsForProvider() { return [fresh, stale]; },
    evaluateFreshness(current) { return current.runId === 'old-stale'
      ? { freshness: 'stale', reasons: ['codeState'] } : { freshness: 'fresh', reasons: [] }; }
  });
  assert.equal(result.state, 'ready');
  assert.equal(result.providers[0].readiness, 'ready');
  assert.equal(result.providers[0].runs.find(item => item.runId === 'old-stale').freshness, 'stale');
  assert.doesNotMatch(JSON.stringify(result.providers[0].matrix), /matrix-secret/);
});

test('redaction collisions never merge raw project identities in gate evaluation or Console matrix', () => {
  const onlyOne = run('one-project', '2026-07-12T00:00:00Z', 'PASS', ['AC-003'], {
    targets: { acIds: ['AC-003'], projects: ['token=one'] }
  });
  const evaluated = evidence.evaluateProviderEvidence({
    runs: [onlyOne], expectedAcs: ['AC-003'], expectedProjects: ['token=one', 'token=two'],
    evaluateFreshness() { return { freshness: 'fresh', reasons: [] }; }
  });
  assert.equal(evaluated.ready, false);
  assert.deepEqual(evaluated.missingPairs, ['AC-003/token=two']);

  const spec = ['## Acceptance Criteria', '### AC-003: Console works', 'Verification: e2e', 'Provider: console-e2e'].join('\n');
  const result = evidence.buildConsoleProjection(spec, '/project', '/project/spec.md', {
    loadConfig() { return { schemaVersion: 1, providers: { 'console-e2e': {
      adapter: 'playwright-test', workspaceRoot: '.', packageRoot: '.', config: 'playwright.config.js',
      projects: ['token=one', 'token=two']
    } } }; },
    runsForProvider() { return [onlyOne]; },
    evaluateFreshness() { return { freshness: 'fresh', reasons: [] }; }
  });
  assert.equal(result.state, 'blocked');
  assert.equal(result.providers[0].matrix.projects.length, 2);
  assert.notEqual(result.providers[0].matrix.projects[0], result.providers[0].matrix.projects[1]);
  assert.doesNotMatch(JSON.stringify(result.providers[0].matrix), /token=one|token=two/);
});

test('readiness assessment aggregates configured Provider Run evidence and inspect projects its summary', () => {
  const spec = ['## Acceptance Criteria', '### AC-003: Console works', 'Verification: e2e', 'Provider: console-e2e'].join('\n');
  const counts = { config: 0, runs: 0, freshness: 0 };
  const provider = { adapter: 'playwright-test', workspaceRoot: '.', packageRoot: '.',
    config: 'playwright.config.js', projects: ['chromium'] };
  const deps = {
    loadConfig() {
      counts.config += 1;
      return { schemaVersion: 1, providers: { 'console-e2e': provider } };
    },
    runsForProvider() {
      counts.runs += 1;
      return [run('assessment-run', '2026-07-12T00:00:00Z', 'PASS', ['AC-003'])];
    },
    evaluateFreshness() {
      counts.freshness += 1;
      return { freshness: 'fresh', reasons: [] };
    }
  };

  const assessment = readiness.assess(spec, '/project', '/project/spec.md', deps);

  assert.deepEqual(counts, { config: 1, runs: 1, freshness: 1 });
  assert.equal(Object.isFrozen(assessment), true);
  assert.equal(Object.isFrozen(assessment.providers), true);
  assert.equal(Object.isFrozen(assessment.providers[0]), true);
  assert.equal(assessment.providers.length, 1);
  assert.equal(assessment.providers[0].id, 'console-e2e');
  assert.equal(assessment.providers[0].evidence.ready, true);
  assert.equal(assessment.providers[0].evidence.runs[0].freshness, 'fresh');
  assert.deepEqual(readiness.inspect(spec, '/project', '/project/spec.md', deps), assessment.summary);
});

test('assessment preserves inspect short-circuit summary while retaining later Provider evidence for Console', () => {
  const spec = [
    '## Acceptance Criteria',
    '### AC-003: First provider',
    'Verification: e2e',
    'Provider: first-e2e',
    '### AC-004: Later provider',
    'Verification: e2e',
    'Provider: later-e2e'
  ].join('\n');
  const provider = { adapter: 'playwright-test', workspaceRoot: '.', packageRoot: '.',
    config: 'playwright.config.js', projects: ['chromium'] };
  const deps = {
    loadConfig() { return { schemaVersion: 1, providers: { 'first-e2e': provider, 'later-e2e': provider } }; },
    runsForProvider(projectDir, docsDir, providerId) {
      return providerId === 'first-e2e' ? [] : [run('later-fail', '2026-07-12T00:00:00Z', 'FAIL', ['AC-004'])];
    },
    evaluateFreshness() { return { freshness: 'fresh', reasons: [] }; }
  };

  const assessment = readiness.assess(spec, '/project', '/project/spec.md', deps);
  const projection = evidence.buildConsoleProjection(spec, '/project', '/project/spec.md', { assessment });

  assert.deepEqual(assessment.summary, {
    state: 'configured', requiredProviders: ['first-e2e', 'later-e2e'], missingProviders: [], issues: []
  });
  assert.equal(assessment.providers.find(item => item.id === 'later-e2e').state, 'blocked');
  assert.deepEqual(readiness.inspect(spec, '/project', '/project/spec.md', deps), assessment.summary);
  assert.equal(projection.state, 'blocked');
});

test('Console projection consumes an injected assessment without rereading dependencies and preserves redaction', () => {
  const spec = ['## Acceptance Criteria', '### AC-003: Console works', 'Verification: e2e', 'Provider: console-e2e'].join('\n');
  const counts = { config: 0, runs: 0, freshness: 0 };
  const provider = { adapter: 'playwright-test', workspaceRoot: 'C:\\outside\\token=provider-secret', packageRoot: '.',
    config: 'playwright.config.js', projects: ['token=matrix-secret'], command: 'token=command-secret' };
  const deps = {
    loadConfig() {
      counts.config += 1;
      return { schemaVersion: 1, providers: { 'console-e2e': provider } };
    },
    runsForProvider() {
      counts.runs += 1;
      return [run('token=run-secret', '2026-07-12T00:00:00Z', 'PASS', ['AC-003'], {
        targets: { acIds: ['AC-003'], projects: ['token=matrix-secret'] }
      })];
    },
    evaluateFreshness() {
      counts.freshness += 1;
      return { freshness: 'fresh', reasons: [] };
    }
  };
  const assessment = readiness.assess(spec, '/project', '/project/spec.md', deps);
  const beforeProjection = { ...counts };

  const result = evidence.buildConsoleProjection(spec, '/project', '/project/spec.md', Object.assign({}, deps, { assessment }));

  assert.deepEqual(counts, beforeProjection);
  assert.equal(result.state, 'ready');
  assert.doesNotMatch(JSON.stringify(result), /provider-secret|command-secret|run-secret|matrix-secret|C:\\outside/);
});

test('separate readiness assessments recompute config Run and freshness facts', () => {
  const spec = ['## Acceptance Criteria', '### AC-003: Console works', 'Verification: e2e', 'Provider: console-e2e'].join('\n');
  const counts = { config: 0, runs: 0, freshness: 0 };
  const deps = {
    loadConfig() {
      counts.config += 1;
      return { schemaVersion: 1, providers: { 'console-e2e': {
        adapter: 'playwright-test', workspaceRoot: '.', packageRoot: '.', config: 'playwright.config.js', projects: ['chromium']
      } } };
    },
    runsForProvider() {
      counts.runs += 1;
      return [run('freshness-' + counts.runs, '2026-07-12T00:00:00Z', 'PASS', ['AC-003'])];
    },
    evaluateFreshness() {
      counts.freshness += 1;
      return { freshness: 'fresh', reasons: [] };
    }
  };

  const first = readiness.assess(spec, '/project', '/project/spec.md', deps);
  const second = readiness.assess(spec, '/project', '/project/spec.md', deps);

  assert.notStrictEqual(first, second);
  assert.deepEqual(counts, { config: 2, runs: 2, freshness: 2 });
});

test('forged ready assessment is recomputed instead of deciding Console readiness', () => {
  const spec = ['## Acceptance Criteria', '### AC-003: Console works', 'Verification: e2e', 'Provider: console-e2e'].join('\n');
  const counts = { config: 0, runs: 0, freshness: 0 };
  const deps = {
    loadConfig() {
      counts.config += 1;
      return { schemaVersion: 1, providers: { 'console-e2e': {
        adapter: 'playwright-test', workspaceRoot: '.', packageRoot: '.', config: 'playwright.config.js', projects: ['chromium']
      } } };
    },
    runsForProvider() {
      counts.runs += 1;
      return [run('actual-fail', '2026-07-12T00:00:00Z', 'FAIL', ['AC-003'])];
    },
    evaluateFreshness() {
      counts.freshness += 1;
      return { freshness: 'fresh', reasons: [] };
    }
  };

  const result = evidence.buildConsoleProjection(spec, '/project', '/project/spec.md', Object.assign({}, deps, {
    assessment: { state: 'ready', providers: [], summary: { state: 'ready' } }
  }));

  assert.equal(result.state, 'blocked');
  assert.equal(result.providers.length, 1);
  assert.deepEqual(counts, { config: 1, runs: 1, freshness: 1 });
});

test('forged assessment raw Provider and Run fields never reach Console JSON', () => {
  const spec = ['## Acceptance Criteria', '### AC-003: Console works', 'Verification: e2e', 'Provider: console-e2e'].join('\n');
  const actualProvider = { adapter: 'playwright-test', workspaceRoot: '.', packageRoot: '.',
    config: 'playwright.config.js', projects: ['chromium'] };
  const forged = {
    state: 'ready',
    providers: [{
      id: 'console-e2e',
      provider: { adapter: 'forged-adapter-secret', workspaceRoot: '.', packageRoot: '.', config: 'forged-config-secret', projects: ['chromium'] },
      runs: [],
      evidence: {
        ready: true,
        runs: [{ runId: 'forged-run-secret', process: { stdout: 'forged-process-secret' }, environmentDigests: { TOKEN: 'forged-token-secret' } }],
        matrix: { acIds: [], projects: [], cells: [] }
      },
      issues: [],
      state: 'ready'
    }],
    summary: { state: 'ready' }
  };
  const result = evidence.buildConsoleProjection(spec, '/project', '/project/spec.md', {
    assessment: forged,
    loadConfig() { return { schemaVersion: 1, providers: { 'console-e2e': actualProvider } }; },
    runsForProvider() { return [run('actual-pass', '2026-07-12T00:00:00Z', 'PASS', ['AC-003'])]; },
    evaluateFreshness() { return { freshness: 'fresh', reasons: [] }; }
  });

  assert.equal(result.state, 'ready');
  assert.doesNotMatch(JSON.stringify(result), /forged-adapter-secret|forged-config-secret|forged-run-secret|forged-process-secret|forged-token-secret/);
});

test('incomplete or tampered assessment is recomputed without TypeError or a false ready state', () => {
  const spec = ['## Acceptance Criteria', '### AC-003: Console works', 'Verification: e2e', 'Provider: console-e2e'].join('\n');
  const deps = {
    loadConfig() { return { schemaVersion: 1, providers: { 'console-e2e': {
      adapter: 'playwright-test', workspaceRoot: '.', packageRoot: '.', config: 'playwright.config.js', projects: ['chromium']
    } } }; },
    runsForProvider() { return [run('actual-fail', '2026-07-12T00:00:00Z', 'FAIL', ['AC-003'])]; },
    evaluateFreshness() { return { freshness: 'fresh', reasons: [] }; }
  };
  let incomplete;
  assert.doesNotThrow(() => {
    incomplete = evidence.buildConsoleProjection(spec, '/project', '/project/spec.md', Object.assign({}, deps, {
      assessment: { state: 'ready', summary: { state: 'ready' } }
    }));
  });
  assert.equal(incomplete.state, 'blocked');

  const trusted = readiness.assess(spec, '/project', '/project/spec.md', deps);
  const tampered = Object.assign({}, trusted, { state: 'ready', providers: [] });
  const result = evidence.buildConsoleProjection(spec, '/project', '/project/spec.md', Object.assign({}, deps, { assessment: tampered }));

  assert.equal(result.state, 'blocked');
  assert.equal(result.providers.length, 1);
});
