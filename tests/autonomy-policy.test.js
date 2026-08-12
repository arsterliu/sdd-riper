const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const governanceContract = require('../src/core/governance-contract');
const common = require('../lib/common');
const autonomyState = require('../src/core/autonomy-state');

function tempProject(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-autonomy-policy-'));
  fs.writeFileSync(path.join(root, '.sdd-config'), config, 'utf-8');
  return root;
}

test('governance contract exposes only the three autonomy modes and supervised default', function() {
  assert.deepEqual(governanceContract.defaults, {
    mode: 'micro',
    autonomyMode: 'supervised',
    cruiseMaxIterations: 5
  });
  assert.deepEqual(governanceContract.autonomyModes, ['auto', 'supervised', 'human']);
  assert.equal(Object.hasOwn(governanceContract.defaults, 'approvalPolicy'), false);
  assert.equal(Object.hasOwn(governanceContract.defaults, 'cruiseEnabled'), false);
});

test('scope plan and risk snapshots are deterministic and boundary-sensitive', function() {
  const first = '## Intake\n### Requirement\nrequirement: x\n### Constraints\nconstraints: none\n### Scope\n- a\n### Risks\n- security\n\n## Plan\nStep A';
  const reorderedRisk = first.replace('- security', '- security  ');
  assert.equal(autonomyState.scopeSnapshot(first), autonomyState.scopeSnapshot(reorderedRisk));
  assert.equal(autonomyState.riskSnapshot(first), autonomyState.riskSnapshot(reorderedRisk));
  assert.notEqual(autonomyState.scopeSnapshot(first), autonomyState.scopeSnapshot(first.replace('- a', '- b')));
  assert.notEqual(autonomyState.planSnapshot(first), autonomyState.planSnapshot(first.replace('Step A', 'Step B')));
});

test('autonomy events round-trip without leaking labels outside the controlled block', function() {
  const content = '## Summary\nready\n\n<!-- sdd-autonomy:start -->\n## Autonomy Control\nAutonomy Schema: 1\n\n<!-- sdd-autonomy:end -->\n';
  const event = {
    eventId: 'evt-1', eventType: 'task_authorization', mode: 'auto', gate: '', decision: 'authorized',
    scopeDigest: 'sha256:scope', riskSnapshot: 'sha256:risk', planDigest: '',
    authorizedActors: 'main,worker,research-reviewer,challenge-reviewer',
    authorizedBy: 'human:liuy', authorizedAt: '2026-08-11T00:00:00Z', authorizationEvidence: '确认',
    invalidatedAt: '', invalidationReason: ''
  };
  const written = autonomyState.appendEvent(content, event);
  assert.deepEqual(autonomyState.parseEvents(written), [event]);
  assert.match(written, /<!-- sdd-autonomy:start -->[\s\S]*### Event: evt-1[\s\S]*<!-- sdd-autonomy:end -->/);
});

test('project autonomy accepts only an explicit legal AUTONOMY_MODE', function() {
  const root = tempProject('DOCS_DIR="mydocs"\nAUTONOMY_MODE="auto"\nCRUISE_MAX_ITERATIONS="7"\n');
  try {
    assert.deepEqual(common.readProjectAutonomy(root), {
      ok: true,
      mode: 'auto',
      issue: '',
      legacyFields: []
    });
    assert.equal(common.getCruiseMaxIterations(root), 7);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('project autonomy requires migration for missing invalid or legacy policy fields', function() {
  const cases = [
    { config: 'DOCS_DIR="mydocs"\n', issue: 'missing' },
    { config: 'AUTONOMY_MODE="agent"\n', issue: 'invalid' },
    { config: 'AUTONOMY_MODE="supervised"\nAPPROVAL_POLICY="agent"\n', issue: 'legacy' },
    { config: 'AUTONOMY_MODE="human"\nCRUISE_ENABLED="false"\n', issue: 'legacy' }
  ];

  cases.forEach(function(entry) {
    const root = tempProject(entry.config);
    try {
      const result = common.readProjectAutonomy(root);
      assert.equal(result.ok, false);
      assert.equal(result.issue, entry.issue);
      assert.equal(result.code, 'SDD_AUTONOMY_MIGRATION_REQUIRED');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
