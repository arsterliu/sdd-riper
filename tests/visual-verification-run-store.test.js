const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const store = require('../src/visual-verification/run-store');

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function root() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-run-store-')); }

function run(runId, decision = 'PASS') {
  const changedPixels = decision === 'PASS' ? 0 : 1;
  return {
    schemaVersion: 1,
    runId,
    createdAt: '2026-08-04T18:00:00Z',
    providerId: 'web-visual',
    adapterId: 'playwright-visual',
    providerDigest: sha('provider'),
    adapterManifestDigest: sha('manifest'),
    invocationDigest: sha('invocation'),
    spec: { path: 'mydocs/specs/v3.9-web.md', specDigest: sha('spec'), visualContractDigest: sha('contract'), configDigest: sha('config') },
    codeStateBefore: { aggregateDigest: sha('before') },
    codeStateAfter: { aggregateDigest: sha('after') },
    workspace: {
      workspaceRoot: '.', packageRoot: '.', resolvedToolVersion: '1.52.0',
      manifestDigest: sha('package.json'), lockfileDigest: sha('package-lock.json'), configDigest: sha('playwright.config.js')
    },
    targets: { scenarioIds: ['checkout-default'], projects: ['chromium'] },
    status: decision === 'PASS' ? 'passed' : 'failed',
    freshness: 'fresh',
    gateDecision: decision,
    process: { status: decision === 'PASS' ? 0 : 1, signal: '' },
    visual: {
      scenarios: [{
        scenarioId: 'checkout-default',
        baselineDigest: sha('baseline'),
        currentDigest: sha('current'),
        changedPixels,
        totalPixels: 100,
        changedRatio: changedPixels / 100,
        threshold: 0.001,
        masks: [{ x: 0, y: 0, width: 1, height: 1 }],
        maskedPixels: 1,
        decision
      }]
    },
    attachments: [],
    diagnostics: []
  };
}

test('commits a visual-only immutable run under its own namespace', () => {
  const project = root();
  const result = store.commitVisualRun(project, 'mydocs', run('visual-1'), []);

  assert.ok(fs.existsSync(path.join(project, 'mydocs/runs/visual/visual-1/run.json')));
  assert.equal(fs.existsSync(path.join(project, 'mydocs/runs/verification/visual-1/run.json')), false);
  assert.deepEqual(result.run.targets, { scenarioIds: ['checkout-default'], projects: ['chromium'] });
  assert.throws(() => store.commitVisualRun(project, 'mydocs', run('visual-1'), []), error => error.code === 'VISUAL_RUN_ALREADY_EXISTS');
});

test('content-addresses current and diff attachments while retaining the immutable baseline reference only as a digest', () => {
  const project = root();
  fs.writeFileSync(path.join(project, 'current.png'), 'current');
  fs.writeFileSync(path.join(project, 'diff.png'), 'diff');
  const value = run('visual-2', 'FAIL');

  const result = store.commitVisualRun(project, 'mydocs', value, [
    { source: path.join(project, 'current.png'), name: 'current.png', mediaType: 'image/png' },
    { source: path.join(project, 'diff.png'), name: 'diff.png', mediaType: 'image/png' }
  ]);

  assert.equal(result.run.attachments.length, 2);
  assert.match(result.run.attachments[0].path, /^artifacts\/[a-f0-9]{64}-0-current\.png$/);
  assert.equal(JSON.stringify(result.run).includes('baseline.png'), false);
});

test('rejects e2e AC targets, unsafe attachments, and PASS conclusions that exceed a configured threshold', () => {
  const project = root();
  const e2eShape = run('visual-3');
  e2eShape.targets.acIds = ['AC-001'];
  assert.throws(() => store.commitVisualRun(project, 'mydocs', e2eShape, []), error => error.code === 'VISUAL_RUN_SCHEMA_INVALID');

  const unsafeAttachment = run('visual-4');
  assert.throws(() => store.commitVisualRun(project, 'mydocs', unsafeAttachment, [{ source: path.join(project, '../outside.png'), name: 'outside.png' }]),
    error => error.code === 'PATH_ESCAPE');

  const falsePass = run('visual-5');
  falsePass.visual.scenarios[0].changedPixels = 1;
  falsePass.visual.scenarios[0].changedRatio = 0.01;
  assert.throws(() => store.commitVisualRun(project, 'mydocs', falsePass, []), error => error.code === 'VISUAL_RUN_SCHEMA_INVALID');
});
