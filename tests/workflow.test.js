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

  it('extracts irreversible flag from Irreversibility label (AC-011)', function() {
    var crSection = 'Scope Boundary: single module\nIrreversibility: 数据库 schema 变更，不可回滚\nImpact Radius: internal\nDependencies & Constraints: none\nAcceptance Intent: behavior preserved';
    var flags = workflow.riskFlags('no risk here', crSection);
    assert.ok(flags.indexOf('irreversible') !== -1, 'expected irreversible from Irreversibility label: ' + flags);
  });

  it('extracts public-api flag from Impact Radius label (AC-012)', function() {
    var crSection = 'Scope Boundary: API layer\nIrreversibility: none\nImpact Radius: 涉及公开 API 接口\nDependencies & Constraints: none\nAcceptance Intent: API compatibility';
    var flags = workflow.riskFlags('no risk here', crSection);
    assert.ok(flags.indexOf('public-api') !== -1, 'expected public-api from Impact Radius label: ' + flags);
  });

  it('extracts security/billing/migration from Dependencies & Constraints label (AC-013)', function() {
    var crSection = 'Scope Boundary: auth module\nIrreversibility: none\nImpact Radius: internal\nDependencies & Constraints: 依赖认证服务和计费系统，涉及数据迁移\nAcceptance Intent: auth preserved';
    var flags = workflow.riskFlags('no risk here', crSection);
    assert.ok(flags.indexOf('security') !== -1, 'expected security from Dependencies label: ' + flags);
    assert.ok(flags.indexOf('billing') !== -1, 'expected billing from Dependencies label: ' + flags);
    assert.ok(flags.indexOf('migration') !== -1, 'expected migration from Dependencies label: ' + flags);
  });

  it('extracts migration from Scope Boundary label when not already flagged (AC-014)', function() {
    var crSection = 'Scope Boundary: 涉及 schema 变更\nIrreversibility: none\nImpact Radius: internal\nDependencies & Constraints: none\nAcceptance Intent: schema preserved';
    var flags = workflow.riskFlags('no risk here', crSection);
    assert.ok(flags.indexOf('migration') !== -1, 'expected migration from Scope Boundary label: ' + flags);
  });

  it('falls back to full-text scanning when no structured fields (AC-015)', function() {
    var crSection = '这是一个自由文本的 Confirmed Requirement，提到了 security 和 migration';
    var flags = workflow.riskFlags('提到了 security 和 migration 的内容', crSection);
    assert.ok(flags.indexOf('security') !== -1, 'expected security from full-text fallback: ' + flags);
    assert.ok(flags.indexOf('migration') !== -1, 'expected migration from full-text fallback: ' + flags);
  });

  it('Irreversibility none/reversible does not flag irreversible (AC-016)', function() {
    var crSection = 'Scope Boundary: single module\nIrreversibility: none, fully reversible\nImpact Radius: internal\nDependencies & Constraints: none\nAcceptance Intent: behavior preserved';
    var flags = workflow.riskFlags('no risk here', crSection);
    assert.ok(flags.indexOf('irreversible') === -1, 'should not flag irreversible when none/reversible: ' + flags);
  });

  it('Chinese reversible wording suppresses irreversible while destructive wording still flags it', function() {
    var reversible = 'Scope Boundary: single module\nIrreversibility: 无不可逆数据迁移，变更全部可回滚\nImpact Radius: internal\nDependencies & Constraints: none\nAcceptance Intent: behavior preserved';
    var destructive = 'Scope Boundary: data cleanup\nIrreversibility: 数据永久删除且不可回滚\nImpact Radius: internal\nDependencies & Constraints: none\nAcceptance Intent: old data removed';
    assert.ok(workflow.riskFlags('no destructive action', reversible).indexOf('irreversible') === -1);
    assert.ok(workflow.riskFlags('delete data permanently', destructive).indexOf('irreversible') !== -1);
  });
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
