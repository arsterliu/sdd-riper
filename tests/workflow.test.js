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

  it('flags Chinese risk keywords in action region (AC-008)', function() {
    var spec = writeSpec('v1.0-cn.md',
      '## Intake\n讨论数据迁移方案。\n\n## Plan\n1. 对用户表执行数据迁移。\n2. 清空数据不再需要的旧日志。\n\n## Design Note\nApproach: 迁移后删除数据（不可逆）。\n');
    var action = workflow.actionText(projectDir, spec);
    var flags = workflow.riskFlags(action);
    assert.ok(flags.indexOf('migration') !== -1, 'expected migration from 数据迁移: ' + flags);
    assert.ok(flags.indexOf('irreversible') !== -1, 'expected irreversible from 不可逆/清空数据: ' + flags);
  });

  it('does not flag Chinese risk words in narrative (AC-009)', function() {
    var spec = writeSpec('v1.0-cn-meta.md',
      '## Intake\n本次任务讨论权限和计费的设计。\n\n## Findings\n数据迁移和支付都是关键领域。\n\n' +
      '## Plan\n1. 新增一个配置项。\n2. 输出日志提示。\n\n## Design Note\nApproach: 纯配置变更，无风险动作。\n');
    var action = workflow.actionText(projectDir, spec);
    assert.deepEqual(workflow.riskFlags(action), [], 'action region should be clean: ' + action);
    assert.ok(workflow.riskFlags(fs.readFileSync(spec, 'utf-8')).length > 0, 'full content should still flag');
  });

  it('Chinese security and billing keywords work directly (AC-010)', function() {
    assert.ok(workflow.riskFlags('增加权限校验').indexOf('security') !== -1);
    assert.ok(workflow.riskFlags('接入支付网关').indexOf('billing') !== -1);
    assert.ok(workflow.riskFlags('公开接口变更').indexOf('public-api') !== -1);
  });
});
