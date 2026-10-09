const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const workflow = require('../src/core/workflow');

const tmpBase = path.join(os.tmpdir(), 'sdd-wf-test-' + Date.now());
const projectDir = path.join(tmpBase, 'proj');
const specsDir = path.join(projectDir, 'mydocs', 'specs');

function writeSpec(name, body, mode) {
  if (!fs.existsSync(specsDir)) fs.mkdirSync(specsDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.sdd-config'), 'DOCS_DIR="mydocs"\nMODE="lite"\n', 'utf-8');
  var p = path.join(specsDir, name);
  fs.writeFileSync(p, '---\nworkflow-policy: streamlined-v1\ndate: 2026-06-01\nmode: ' + (mode || 'lite') + '\nstatus: draft\ndesign-file: ""\n---\n\n' + body, 'utf-8');
  return p;
}

describe('explicit current risk routing', function() {
  afterEach(function() { if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true }); });
  for (const [signals, flags] of [['none', []], ['security,billing,data-migration,public-api,irreversible',
    ['security', 'billing', 'migration', 'public-api', 'irreversible']]]) {
    it('uses declared Risk Signals: ' + signals, function() {
      const spec = writeSpec('v1.0-current.md', '## Intake\nRequirement: task\nScope: local\nRisks: assessed\nRisk Signals: ' + signals + '\n## Plan\nStep: explain security migration and irreversible safeguards.');
      assert.deepEqual(workflow.computeRiskFlags(projectDir, spec, fs.readFileSync(spec, 'utf8')), flags);
    });
  }
});

describe('analyzeSpec no-spec early return shape (v4.11)', function() {
  var tmpBase = path.join(os.tmpdir(), 'sdd-wf-nospec-' + Date.now());
  var noSpecDir = path.join(tmpBase, 'proj');
  afterEach(function() {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it('no-spec state includes authorizedActors and digest fields for all consumers (AC-001)', function() {
    fs.mkdirSync(noSpecDir, { recursive: true });
    fs.writeFileSync(path.join(noSpecDir, '.sdd-config'), 'DOCS_DIR="mydocs"\nAUTONOMY_MODE="supervised"\n', 'utf-8');
    fs.mkdirSync(path.join(noSpecDir, 'mydocs', 'specs'), { recursive: true });
    var state = workflow.analyzeSpec(noSpecDir, '');
    assert.equal(state.nextAction, 'discover_spec');
    assert.deepEqual(state.authorizedActors, []);
    assert.equal(state.authorizedScopeDigest, '');
    assert.equal(state.authorizedRiskSnapshot, '');
    assert.equal(state.activePlanDigest, '');
  });

  it('cruise no-spec path renders discover guidance without TypeError', function() {
    fs.mkdirSync(noSpecDir, { recursive: true });
    fs.writeFileSync(path.join(noSpecDir, '.sdd-config'), 'DOCS_DIR="mydocs"\nAUTONOMY_MODE="supervised"\n', 'utf-8');
    fs.mkdirSync(path.join(noSpecDir, 'mydocs', 'specs'), { recursive: true });
    var cruise = require('../src/commands/cruise');
    var lines = [];
    var origLog = console.log;
    console.log = function() { lines.push(Array.prototype.join.call(arguments, ' ')); };
    try { cruise(noSpecDir, {}); } finally { console.log = origLog; }
    var out = lines.join('\n');
    assert.ok(out.indexOf('TypeError') === -1);
    assert.ok(out.indexOf('NEXT_ACTION: discover_spec') !== -1, out);
    assert.ok(out.indexOf('sdd discover') !== -1, out);
  });

  it('active spec path still renders authorized fields in cruise output (AC-002 regression)', function() {
    fs.mkdirSync(path.join(noSpecDir, 'mydocs', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(noSpecDir, '.sdd-config'), 'DOCS_DIR="mydocs"\nAUTONOMY_MODE="supervised"\n', 'utf-8');
    fs.writeFileSync(path.join(noSpecDir, 'mydocs', 'specs', 'v1.0-t.md'),
      '---\ndate: 2026-08-22\ntask-name: "t"\nmode: micro\nstatus: draft\nautonomy-mode: "human"\ndesign-file: ""\nexecute-log-file: ""\n---\n\n## Summary\nx\n\n## Intake\nrequirement: r\n\n## Plan\nImpact Scope: a\nData Impact: none\nInterface Impact: none\nAcceptance: ok\nVerification: unit\n\nPlan Approved By: human:tester\nApproved At: 2026-08-22T00:00:00.000Z\nGate Evidence: e\n', 'utf-8');
    var cruise = require('../src/commands/cruise');
    var lines = [];
    var origLog = console.log;
    console.log = function() { lines.push(Array.prototype.join.call(arguments, ' ')); };
    try { cruise(noSpecDir, {}); } finally { console.log = origLog; }
    var out = lines.join('\n');
    assert.ok(out.indexOf('HUMAN-GUIDED WORKFLOW') !== -1, out);
    assert.ok(out.indexOf('AUTHORIZED_ACTORS:') !== -1, out);
    assert.ok(out.indexOf('AUTHORIZED_SCOPE_DIGEST:') !== -1, out);
    assert.ok(out.indexOf('AUTHORIZED_RISK_SNAPSHOT:') !== -1, out);
    assert.ok(out.indexOf('ACTIVE_PLAN_DIGEST:') !== -1, out);
    assert.ok(out.indexOf('NEXT_ACTION:') !== -1, out);
  });
});
