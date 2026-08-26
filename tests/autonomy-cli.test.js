const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runSddCli } = require('./helpers/test-cli');
const autonomyState = require('../src/core/autonomy-state');

function root() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-autonomy-cli-')); }
function run(args, cwd) { return runSddCli(args, { cwd: cwd, env: process.env }); }

test('init writes supervised by default and supports an explicit autonomy mode', function() {
  const base = root();
  try {
    const first = path.join(base, 'default');
    assert.equal(run(['init', first], base).status, 0);
    const defaultConfig = fs.readFileSync(path.join(first, '.sdd-config'), 'utf-8');
    assert.match(defaultConfig, /^AUTONOMY_MODE="supervised"$/m);
    assert.doesNotMatch(defaultConfig, /APPROVAL_POLICY|CRUISE_ENABLED/);

    const second = path.join(base, 'auto');
    assert.equal(run(['init', second, '--autonomy-mode', 'auto'], base).status, 0);
    assert.match(fs.readFileSync(path.join(second, '.sdd-config'), 'utf-8'), /^AUTONOMY_MODE="auto"$/m);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('discover freezes the project default or explicit autonomy override in the Spec', function() {
  const base = root();
  try {
    const project = path.join(base, 'project');
    assert.equal(run(['init', project], base).status, 0);
    assert.equal(run(['discover', project, '--task-name', 'one', '--spec-version', 'v1.0', '--requirement', 'x'], base).status, 0);
    assert.equal(run(['discover', project, '--task-name', 'two', '--spec-version', 'v1.1', '--requirement', 'x', '--autonomy-mode', 'human'], base).status, 0);
    const one = fs.readFileSync(path.join(project, 'mydocs', 'specs', 'v1.0-one.md'), 'utf-8');
    const two = fs.readFileSync(path.join(project, 'mydocs', 'specs', 'v1.1-two.md'), 'utf-8');
    assert.match(one, /^autonomy-mode: "supervised"$/m);
    assert.match(one, /^autonomy-mode-source: "project-default"$/m);
    assert.match(two, /^autonomy-mode: "human"$/m);
    assert.match(two, /^autonomy-mode-source: "discover-override"$/m);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('autonomy migrate requires an explicit mode and removes active legacy fields', function() {
  const base = root();
  try {
    const project = path.join(base, 'project');
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, '.sdd-config'), 'DOCS_DIR="mydocs"\nAPPROVAL_POLICY="agent"\nCRUISE_ENABLED="true"\nCRUISE_MAX_ITERATIONS="9"\n', 'utf-8');
    const result = run(['autonomy', 'migrate', project, '--mode', 'human'], base);
    assert.equal(result.status, 0, result.output);
    const config = fs.readFileSync(path.join(project, '.sdd-config'), 'utf-8');
    assert.match(config, /^AUTONOMY_MODE="human"$/m);
    assert.match(config, /^CRUISE_MAX_ITERATIONS="9"$/m);
    assert.doesNotMatch(config, /APPROVAL_POLICY|CRUISE_ENABLED/);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('auto authorization requires the inspected scope digest and appends an auditable event', function() {
  const base = root();
  try {
    const project = path.join(base, 'project');
    assert.equal(run(['init', project, '--autonomy-mode', 'auto'], base).status, 0);
    assert.equal(run(['discover', project, '--task-name', 'auth', '--spec-version', 'v1.0', '--requirement', 'x'], base).status, 0);
    const spec = path.join(project, 'mydocs', 'specs', 'v1.0-auth.md');
    const inspect = run(['autonomy', 'inspect', project, '--spec', spec], base);
    assert.equal(inspect.status, 0, inspect.output);
    assert.match(inspect.output, /SCOPE_DIGEST: sha256:[a-f0-9]+/);
    const digest = inspect.output.match(/SCOPE_DIGEST: (sha256:[a-f0-9]+)/)[1];

    const stale = run(['autonomy', 'authorize', project, '--spec', spec, '--expected-scope-digest', 'sha256:bad', '--authorized-by', 'human:liuy', '--authorization-evidence', '确认'], base);
    assert.equal(stale.status, 3);
    assert.doesNotMatch(fs.readFileSync(spec, 'utf-8'), /task_authorization/);

    const result = run(['autonomy', 'authorize', project, '--spec', spec, '--expected-scope-digest', digest, '--authorized-by', 'human:liuy', '--authorization-evidence', '确认'], base);
    assert.equal(result.status, 0, result.output);
    const content = fs.readFileSync(spec, 'utf-8');
    assert.match(content, /Event Type: task_authorization/);
    assert.match(content, /Authorized Actors: main,worker,research-reviewer,challenge-reviewer/);
    assert.match(content, /Authorized By: human:liuy/);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('supervised continuous authorization requires a human-approved Plan', function() {
  const project = root();
  try {
    run(['init', project, '--mode', 'standard', '--autonomy-mode', 'supervised'], project);
    const created = run(['discover', project, '--task-name', 'supervised-plan', '--spec-version', 'v1.0', '--requirement', 'test', '--mode', 'standard'], project);
    assert.equal(created.status, 0, created.output);
    const spec = path.join(project, 'mydocs', 'specs', 'v1.0-supervised-plan.md');
    const content = fs.readFileSync(spec, 'utf-8');
    const scope = autonomyState.scopeSnapshot(content);
    const denied = run(['autonomy', 'authorize', project, '--spec', spec, '--expected-scope-digest', scope, '--authorized-by', 'human:liuy', '--authorization-evidence', '批准后续自动推进'], project);
    assert.notEqual(denied.status, 0);
    assert.match(denied.output, /SDD_AUTONOMY_PLAN_APPROVAL_REQUIRED/);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('active Spec mode switch is authorized atomic and invalidates prior authority', function() {
  const project = root();
  try {
    assert.equal(run(['init', project, '--autonomy-mode', 'auto'], project).status, 0);
    assert.equal(run(['discover', project, '--task-name', 'switch-mode', '--spec-version', 'v1.0', '--requirement', 'test'], project).status, 0);
    const spec = path.join(project, 'mydocs', 'specs', 'v1.0-switch-mode.md');
    const before = fs.readFileSync(spec, 'utf-8');
    const denied = run(['autonomy', 'select', project, '--spec', spec, '--mode', 'human'], project);
    assert.notEqual(denied.status, 0);
    assert.equal(fs.readFileSync(spec, 'utf-8'), before);
    const scope = autonomyState.scopeSnapshot(before);
    const selected = run(['autonomy', 'select', project, '--spec', spec, '--mode', 'human', '--expected-scope-digest', scope, '--authorized-by', 'human:liuy', '--authorization-evidence', '切换为人工模式'], project);
    assert.equal(selected.status, 0, selected.output);
    const after = fs.readFileSync(spec, 'utf-8');
    assert.match(after, /^autonomy-mode: "human"$/m);
    assert.match(after, /Event Type: invalidation/);
    assert.match(after, /Event Type: mode_change/);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('autonomy writes reject archived and non-current Specs without mutation', function() {
  const project = root();
  try {
    assert.equal(run(['init', project, '--autonomy-mode', 'auto'], project).status, 0);
    assert.equal(run(['discover', project, '--task-name', 'first', '--spec-version', 'v1.0', '--requirement', 'x'], project).status, 0);
    assert.equal(run(['discover', project, '--task-name', 'second', '--spec-version', 'v1.1', '--requirement', 'x'], project).status, 0);
    const first = path.join(project, 'mydocs/specs/v1.0-first.md');
    const before = fs.readFileSync(first, 'utf-8');
    const digest = autonomyState.scopeSnapshot(before);
    const result = run(['autonomy', 'authorize', project, '--spec', first, '--expected-scope-digest', digest, '--authorized-by', 'human:liuy', '--authorization-evidence', '确认'], project);
    assert.equal(result.status, 3, result.output);
    assert.match(result.output, /SDD_AUTONOMY_SPEC_NOT_ACTIVE/);
    assert.equal(fs.readFileSync(first, 'utf-8'), before);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('supervised authorization binds the exact reviewed Plan digest', function() {
  const project = root();
  try {
    run(['init', project, '--mode', 'standard', '--autonomy-mode', 'supervised'], project);
    run(['discover', project, '--task-name', 'bound-plan', '--spec-version', 'v1.0', '--requirement', 'x', '--mode', 'standard'], project);
    const spec = path.join(project, 'mydocs/specs/v1.0-bound-plan.md');
    let content = fs.readFileSync(spec, 'utf-8').replace(/^Plan Approved By:$/m, 'Plan Approved By: human:liuy')
      .replace(/^Approved At:$/m, 'Approved At: 2026-08-11T00:00:00Z');
    fs.writeFileSync(spec, content, 'utf-8');
    const args = ['autonomy', 'authorize', project, '--spec', spec, '--expected-scope-digest', autonomyState.scopeSnapshot(content), '--authorized-by', 'human:liuy', '--authorization-evidence', '确认'];
    const missing = run(args, project);
    assert.equal(missing.status, 3, missing.output);
    assert.match(missing.output, /SDD_AUTONOMY_AUTHORIZATION_STALE/);
    const ok = run(args.concat(['--expected-plan-digest', autonomyState.planSnapshot(content)]), project);
    assert.equal(ok.status, 0, ok.output);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('auto task authorization requires auditable Plan activation after Plan approval', function() {
  const project = root();
  try {
    run(['init', project, '--autonomy-mode', 'auto'], project);
    run(['discover', project, '--task-name', 'activate', '--spec-version', 'v1.0', '--requirement', 'x'], project);
    const spec = path.join(project, 'mydocs/specs/v1.0-activate.md');
    let content = fs.readFileSync(spec, 'utf-8');
    const scope = autonomyState.scopeSnapshot(content);
    assert.equal(run(['autonomy', 'authorize', project, '--spec', spec, '--expected-scope-digest', scope, '--authorized-by', 'human:liuy', '--authorization-evidence', '确认范围'], project).status, 0);
    content = fs.readFileSync(spec, 'utf-8').replace(/^Plan Approved By:$/m, 'Plan Approved By: agent:root')
      .replace(/^Approved At:$/m, 'Approved At: 2026-08-11T00:00:00Z')
      .replace(/^Gate Evidence:$/m, 'Gate Evidence: plan within authorized scope');
    fs.writeFileSync(spec, content, 'utf-8');
    const inspected = run(['autonomy', 'inspect', project, '--spec', spec], project);
    assert.match(inspected.output, /STOP_REASON: plan_activation_required/);
    const risk = inspected.output.match(/AUTHORIZED_RISK_SNAPSHOT: (sha256:[a-f0-9]+)/)[1];
    const plan = autonomyState.planSnapshot(content);
    const activated = run(['autonomy', 'activate-plan', project, '--spec', spec, '--expected-scope-digest', scope,
      '--expected-risk-snapshot', risk, '--expected-plan-digest', plan, '--activated-by', 'agent:root', '--evidence', 'Plan 未超出授权范围'], project);
    assert.equal(activated.status, 0, activated.output);
    assert.match(fs.readFileSync(spec, 'utf-8'), /Event Type: plan_activation/);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('auto next routes a fresh Agent-approved Plan to automatic activation', function() {
  const project = root();
  try {
    run(['init', project, '--autonomy-mode', 'auto'], project);
    run(['discover', project, '--task-name', 'auto-next', '--spec-version', 'v1.0', '--requirement', 'x'], project);
    const spec = path.join(project, 'mydocs/specs/v1.0-auto-next.md');
    let content = fs.readFileSync(spec, 'utf-8');
    const scope = autonomyState.scopeSnapshot(content);
    assert.equal(run(['autonomy', 'authorize', project, '--spec', spec, '--expected-scope-digest', scope, '--authorized-by', 'human:liuy', '--authorization-evidence', '确认范围'], project).status, 0);
    content = fs.readFileSync(spec, 'utf-8').replace(/^Plan Approved By:$/m, 'Plan Approved By: agent:root')
      .replace(/^Approved At:$/m, 'Approved At: 2026-08-26T00:00:00Z')
      .replace(/^Gate Evidence:$/m, 'Gate Evidence: plan within authorized scope');
    fs.writeFileSync(spec, content, 'utf-8');

    const next = run(['next', project], project);
    assert.equal(next.status, 0, next.output);
    assert.match(next.output, /NEXT_ACTION: activate_auto_plan/);
    assert.match(next.output, /GUIDANCE_COMMAND: sdd autonomy activate-plan/);
    assert.doesNotMatch(next.output, /NEXT_ACTION: request_task_authorization/);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('autonomy lock fails closed before any Spec mutation', function() {
  const project = root();
  try {
    run(['init', project, '--autonomy-mode', 'auto'], project);
    run(['discover', project, '--task-name', 'locked', '--spec-version', 'v1.0', '--requirement', 'x'], project);
    const spec = path.join(project, 'mydocs/specs/v1.0-locked.md');
    const before = fs.readFileSync(spec, 'utf-8');
    fs.mkdirSync(path.join(project, '.sdd-autonomy.lock'));
    const result = run(['autonomy', 'authorize', project, '--spec', spec, '--expected-scope-digest', autonomyState.scopeSnapshot(before), '--authorized-by', 'human:liuy', '--authorization-evidence', '确认'], project);
    assert.equal(result.status, 3, result.output);
    assert.match(result.output, /SDD_AUTONOMY_LOCKED/);
    assert.equal(fs.readFileSync(spec, 'utf-8'), before);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});
