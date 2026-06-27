const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const workflow = require('../src/core/workflow');

const tmpBase = path.join(os.tmpdir(), 'sdd-wf-test-' + Date.now());
const projectDir = path.join(tmpBase, 'proj');
const specsDir = path.join(projectDir, 'mydocs', 'specs');

function writeSpec(name, body) {
  if (!fs.existsSync(specsDir)) fs.mkdirSync(specsDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.sdd-config'), 'DOCS_DIR="mydocs"\nMODE="lite"\n', 'utf-8');
  var p = path.join(specsDir, name);
  fs.writeFileSync(p, '---\ndate: 2026-06-01\nmode: lite\nstatus: draft\ndesign-file: ""\n---\n\n' + body, 'utf-8');
  return p;
}

describe('riskFlags action-region scanning', function() {
  afterEach(function() {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it('does not flag risk words that appear only in narrative (AC-004)', function() {
    var spec = writeSpec('v1.0-meta.md',
      '## Intake\n讨论 security 和 migration 的分类。\n\n## Findings\nsecurity migration schema 都是关键词。\n\n' +
      '## Plan\n1. 新建一份文档说明。\n2. 打印一行提示。\n\n## Design Note\nApproach: 仅文档改动，无任何风险动作。\n');
    var action = workflow.actionText(projectDir, spec);
    assert.deepEqual(workflow.riskFlags(action), [], 'action region should be clean: ' + action);
    assert.ok(workflow.riskFlags(fs.readFileSync(spec, 'utf-8')).length > 0, 'full content should still flag');
  });

  it('flags genuine risk actions in Plan/Design (AC-005)', function() {
    var spec = writeSpec('v1.0-real.md',
      '## Intake\n做点事。\n\n## Plan\n1. run data migration on the user table.\n2. permanently delete data no longer needed.\n\n' +
      '## Design Note\nApproach: backfill then delete data (irreversible).\n');
    var flags = workflow.riskFlags(workflow.actionText(projectDir, spec));
    assert.ok(flags.indexOf('migration') !== -1, 'expected migration: ' + flags);
    assert.ok(flags.indexOf('irreversible') !== -1, 'expected irreversible: ' + flags);
  });

  it('security regex respects word boundaries (AC-006)', function() {
    assert.deepEqual(workflow.riskFlags('the author refactored the authentication-free helper'), []);
    assert.deepEqual(workflow.riskFlags('we add an auth check'), ['security']);
  });

  it('falls back to full content when there is no action region (AC-007)', function() {
    var spec = writeSpec('v1.0-early.md',
      '## Intake\nwe will delete data permanently as the core action.\n\n## Plan\n\n## Design Note\n');
    assert.equal(workflow.actionText(projectDir, spec).trim(), '', 'action region should be empty');
    var state = workflow.analyzeSpec(projectDir, spec, {});
    assert.ok(state.riskFlags.indexOf('irreversible') !== -1, 'fallback should flag from full content: ' + state.riskFlags);
  });
});
