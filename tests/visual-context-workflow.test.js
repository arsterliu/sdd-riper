const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const validate = require('../src/commands/validate');
const workflow = require('../src/core/workflow');
const next = require('../src/commands/next');
const visual = require('../src/commands/visual');
const canonical = require('../src/profile/canonical');
const profileFixtures = require('./helpers/profile-fixtures');

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function createSpec(frontmatter) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-context-workflow-'));
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-ui-task.md');
  write(specPath, [
    '---',
    'task-name: "ui-task"',
    'mode: micro',
    'context-source: "mydocs/context/ui-task"',
    'visual-evidence: ""',
    'visual-evidence-file: ""',
    'execute-log-file: "mydocs/logs/v1.0-ui-task.execute.md"'
  ].concat(frontmatter || []).concat([
    '---',
    '## Plan',
    'Impact Scope: x',
    'Data Impact: x',
    'Interface Impact: x',
    'Acceptance: x',
    'Verification: x',
    'Plan Approved By: agent:fixture',
    'Approved At: 2026-08-03T18:00:00Z',
    'Gate Evidence: fixture'
  ]).join('\n'));
  write(path.join(projectDir, 'mydocs', 'logs', 'v1.0-ui-task.execute.md'), '## Execute Log\n');
  return { projectDir, specPath };
}

function visualIssues(result) {
  return result.issues.filter(function(issue) { return /visual|VISUAL/i.test(issue); });
}

function captureNext(projectDir, specPath) {
  const output = [];
  const original = console.log;
  console.log = function(line) { output.push(String(line)); };
  try { next(projectDir, { spec: specPath }); }
  finally { console.log = original; }
  return output.join('\n');
}

function addProfileReference(fixture, roles, affectedUnits, addBackendUnit) {
  const profile = profileFixtures.validProfile();
  profile.units[0].roles = roles;
  if (addBackendUnit) {
    const backend = JSON.parse(JSON.stringify(profile.units[0]));
    backend.id = 'api';
    backend.root = 'apps/api';
    backend.roles = ['backend'];
    backend.manifests = ['apps/api/package.json'];
    backend.commandRefs[0].source = 'apps/api/package.json';
    backend.evidence[0].id = 'ev-api';
    backend.evidence[0].path = 'apps/api/package.json';
    backend.frameworks[0].evidenceIds = ['ev-api'];
    profile.units.push(backend);
  }
  const digest = canonical.digestProfile(profile);
  const revision = 'profiles/revisions/' + digest.replace(':', '-') + '.json';
  write(path.join(fixture.projectDir, 'mydocs', revision), JSON.stringify({
    schemaVersion: 1,
    kind: 'sdd-project-profile-revision',
    profileDigest: digest,
    profile: profile,
    confirmation: { confirmedBy: 'human:fixture', confirmedAt: '2026-08-03T18:00:00Z', evidence: 'fixture' }
  }));
  const content = fs.readFileSync(fixture.specPath, 'utf-8').replace('---\n', [
    '---',
    'project-profile-revision: "' + revision + '"',
    'project-profile-digest: "' + digest + '"',
    'affected-units: "' + (affectedUnits || 'web') + '"'
  ].join('\n') + '\n');
  fs.writeFileSync(fixture.specPath, content, 'utf-8');
}

function addFrontendProfileReference(fixture) {
  addProfileReference(fixture, ['frontend']);
}

test('ui-impact=no 和 not-required 不产生视觉 Plan blocker', function() {
  [
    ['ui-impact: "no"', 'visual-context-intent: "not-applicable"'],
    ['ui-impact: "yes"', 'visual-context-intent: "not-required"']
  ].forEach(function(frontmatter) {
    const fixture = createSpec(frontmatter);
    const validation = validate.validateSpec(fixture.specPath, { projectDir: fixture.projectDir });
    const state = workflow.analyzeSpec(fixture.projectDir, fixture.specPath);

    assert.deepEqual(visualIssues(validation), []);
    assert.deepEqual(state.blockers.filter(function(issue) { return /visual|VISUAL/i.test(issue); }), []);
  });
});

test('新前端 Spec 缺少 intent 时在 Plan 前提供一次性选择 blocker', function() {
  const fixture = createSpec(['ui-impact: "yes"', 'visual-context-intent: ""']);
  const validation = validate.validateSpec(fixture.specPath, { projectDir: fixture.projectDir });
  const state = workflow.analyzeSpec(fixture.projectDir, fixture.specPath);
  const output = captureNext(fixture.projectDir, fixture.specPath);

  assert.ok(validation.issues.some(function(issue) { return issue.indexOf('VISUAL_CONTEXT_SELECTION_REQUIRED') !== -1; }));
  assert.ok(state.gates.plan.blockers.some(function(blocker) {
    return blocker.message.indexOf('VISUAL_CONTEXT_SELECTION_REQUIRED') !== -1;
  }));
  assert.match(output, /UI_IMPACT: yes/);
  assert.match(output, /VISUAL_CONTEXT_INTENT: pending/);
  assert.match(output, /VISUAL_CONTEXT_GUIDANCE:.*visual select/i);
});

test('direction/fidelity 未启用严格合同仅给出 discover/init 指导', function() {
  ['direction', 'fidelity'].forEach(function(intent) {
    const fixture = createSpec(['ui-impact: "yes"', 'visual-context-intent: "' + intent + '"']);
    const validation = validate.validateSpec(fixture.specPath, { projectDir: fixture.projectDir });
    const state = workflow.analyzeSpec(fixture.projectDir, fixture.specPath);
    const output = captureNext(fixture.projectDir, fixture.specPath);

    assert.deepEqual(visualIssues(validation), []);
    assert.deepEqual(state.blockers.filter(function(issue) { return /visual|VISUAL/i.test(issue); }), []);
    assert.match(output, new RegExp('VISUAL_CONTEXT_INTENT: ' + intent));
    assert.match(output, /VISUAL_CONTEXT_GUIDANCE:.*visual discover.*visual init/i);
  });
});

test('archive-ready 不因新视觉意图字段新增 blocker，旧 Spec 也兼容', function() {
  [
    ['ui-impact: "yes"', 'visual-context-intent: ""'],
    []
  ].forEach(function(frontmatter) {
    const fixture = createSpec(frontmatter);
    const archiveValidation = validate.validateSpec(fixture.specPath, { projectDir: fixture.projectDir, archiveReady: true });
    assert.deepEqual(visualIssues(archiveValidation), []);
  });
});

test('archive-ready 工作流不注入视觉选择 blocker，但普通工作流仍会注入', function() {
  const fixture = createSpec(['ui-impact: "yes"', 'visual-context-intent: ""']);
  const ordinary = workflow.analyzeSpec(fixture.projectDir, fixture.specPath);
  const archiveReady = workflow.analyzeSpec(fixture.projectDir, fixture.specPath, { archiveReady: true });

  assert.ok(ordinary.blockers.some(function(issue) { return issue.indexOf('VISUAL_CONTEXT_SELECTION_REQUIRED') !== -1; }));
  assert.deepEqual(archiveReady.blockers.filter(function(issue) { return issue.indexOf('VISUAL_CONTEXT_SELECTION_REQUIRED') !== -1; }), []);
});

test('严格视觉合同未就绪只阻塞普通 Plan 工作流，不污染 archive-ready 工作流', function() {
  const fixture = createSpec([
    'ui-impact: "yes"',
    'visual-context-intent: "fidelity"'
  ]);
  const strictSpec = fs.readFileSync(fixture.specPath, 'utf-8')
    .replace('visual-evidence: ""', 'visual-evidence: "required"')
    .replace('visual-evidence-file: ""', 'visual-evidence-file: "mydocs/context/ui-task/visual-evidence.json"');
  fs.writeFileSync(fixture.specPath, strictSpec, 'utf-8');
  const ordinary = workflow.analyzeSpec(fixture.projectDir, fixture.specPath);
  const archiveReady = workflow.analyzeSpec(fixture.projectDir, fixture.specPath, { archiveReady: true });

  assert.ok(ordinary.gates.plan.blockers.some(function(blocker) {
    return blocker.message.indexOf('VISUAL_EVIDENCE_FILE_MISSING') !== -1;
  }));
  assert.deepEqual(archiveReady.blockers.filter(function(issue) {
    return issue.indexOf('VISUAL_EVIDENCE_FILE_MISSING') !== -1;
  }), []);
});

test('非法或矛盾的视觉选择在普通路径阻塞 Plan，archive-ready 路径保持不注入', function() {
  [
    ['ui-impact: "yes"', 'visual-context-intent: "foo"'],
    ['ui-impact: "no"', 'visual-context-intent: "fidelity"']
  ].forEach(function(frontmatter) {
    const fixture = createSpec(frontmatter);
    const ordinary = workflow.analyzeSpec(fixture.projectDir, fixture.specPath);
    const archiveReady = workflow.analyzeSpec(fixture.projectDir, fixture.specPath, { archiveReady: true });
    const output = captureNext(fixture.projectDir, fixture.specPath);

    assert.ok(ordinary.gates.plan.blockers.some(function(blocker) {
      return blocker.message.indexOf('VISUAL_CONTEXT_SELECTION_INVALID') !== -1;
    }));
    assert.deepEqual(archiveReady.blockers.filter(function(issue) {
      return issue.indexOf('VISUAL_CONTEXT_SELECTION_INVALID') !== -1;
    }), []);
    assert.match(output, /VISUAL_CONTEXT_DIAGNOSTIC: VISUAL_CONTEXT_SELECTION_INVALID/);
  });
});

test('新模板的双空字段要求确认 UI 影响，已确认前端单元时才阻塞 Plan', function() {
  const unknown = createSpec(['ui-impact: ""', 'visual-context-intent: ""']);
  const frontend = createSpec(['ui-impact: ""', 'visual-context-intent: ""']);
  const legacy = createSpec([]);
  addFrontendProfileReference(frontend);

  const unknownState = workflow.analyzeSpec(unknown.projectDir, unknown.specPath);
  const frontendState = workflow.analyzeSpec(frontend.projectDir, frontend.specPath);
  const archiveState = workflow.analyzeSpec(frontend.projectDir, frontend.specPath, { archiveReady: true });
  const legacyState = workflow.analyzeSpec(legacy.projectDir, legacy.specPath);

  assert.equal(unknownState.visualContext.uiImpactConfirmationRequired, true);
  assert.equal(unknownState.visualContext.selectionRequired, false);
  assert.match(captureNext(unknown.projectDir, unknown.specPath), /VISUAL_CONTEXT_DIAGNOSTIC: VISUAL_CONTEXT_UI_IMPACT_CONFIRMATION_REQUIRED/);
  assert.ok(frontendState.gates.plan.blockers.some(function(blocker) {
    return blocker.message.indexOf('VISUAL_CONTEXT_SELECTION_REQUIRED') !== -1;
  }));
  assert.deepEqual(archiveState.blockers.filter(function(issue) { return /VISUAL_CONTEXT_(?:SELECTION|UI_IMPACT)/.test(issue); }), []);
  assert.equal(legacyState.visualContext.uiImpactConfirmationRequired, false);
  assert.deepEqual(legacyState.blockers.filter(function(issue) { return /VISUAL_CONTEXT_(?:SELECTION|UI_IMPACT)/.test(issue); }), []);
});

test('backend-only Profile 跳过视觉提示，正文中的字段名不破坏旧 Spec 兼容', function() {
  const backend = createSpec(['ui-impact: ""', 'visual-context-intent: ""']);
  const legacy = createSpec([]);
  addProfileReference(backend, ['backend']);
  fs.appendFileSync(legacy.specPath, '\n## Notes\n```yaml\nui-impact: "yes"\nvisual-context-intent: "fidelity"\n```\n', 'utf-8');

  const backendValidation = validate.validateSpec(backend.specPath, { projectDir: backend.projectDir });
  const backendState = workflow.analyzeSpec(backend.projectDir, backend.specPath);
  const backendNext = captureNext(backend.projectDir, backend.specPath);
  const legacyState = workflow.analyzeSpec(legacy.projectDir, legacy.specPath);

  assert.equal(backendState.visualContext.profileUiImpact, 'backend-only');
  assert.equal(backendState.visualContext.uiImpactConfirmationRequired, false);
  assert.deepEqual(backendValidation.issues.filter(function(issue) { return /VISUAL_CONTEXT_(?:SELECTION|UI_IMPACT)/.test(issue); }), []);
  assert.doesNotMatch(backendNext, /VISUAL_CONTEXT_(?:GUIDANCE|DIAGNOSTIC)/);
  assert.equal(legacyState.visualContext.profileUiImpact, 'legacy');
  assert.equal(legacyState.visualContext.uiImpactConfirmationRequired, false);
  assert.deepEqual(legacyState.blockers.filter(function(issue) { return /VISUAL_CONTEXT_(?:SELECTION|UI_IMPACT)/.test(issue); }), []);
});

test('affected-units=project 聚合全部单元：含前端的项目要求选择，纯后端项目跳过', function() {
  const frontend = createSpec(['ui-impact: ""', 'visual-context-intent: ""']);
  const mixed = createSpec(['ui-impact: ""', 'visual-context-intent: ""']);
  const backend = createSpec(['ui-impact: ""', 'visual-context-intent: ""']);
  addProfileReference(frontend, ['frontend'], 'project');
  addProfileReference(mixed, ['frontend'], 'project', true);
  addProfileReference(backend, ['backend'], 'project');

  [frontend, mixed].forEach(function(fixture) {
    const state = workflow.analyzeSpec(fixture.projectDir, fixture.specPath);
    assert.equal(state.visualContext.profileUiImpact, 'frontend');
    assert.ok(state.gates.plan.blockers.some(function(blocker) {
      return blocker.message.indexOf('VISUAL_CONTEXT_SELECTION_REQUIRED') !== -1;
    }));
  });
  const backendState = workflow.analyzeSpec(backend.projectDir, backend.specPath);
  assert.equal(backendState.visualContext.profileUiImpact, 'backend-only');
  assert.equal(backendState.visualContext.selectionRequired, false);
});

test('绑定前端或混合 Profile 的 Spec 拒绝选择 no，纯后端和未知 Profile 允许', function() {
  const frontend = createSpec([]);
  const mixed = createSpec([]);
  const backend = createSpec([]);
  const unknown = createSpec([]);
  addProfileReference(frontend, ['frontend']);
  addProfileReference(mixed, ['frontend'], 'project', true);
  addProfileReference(backend, ['backend']);

  [frontend, mixed].forEach(function(fixture) {
    const before = fs.readFileSync(fixture.specPath, 'utf-8');
    assert.throws(function() {
      visual.select(fixture.projectDir, { spec: fixture.specPath, uiImpact: 'no' });
    }, /VISUAL_CONTEXT_UI_IMPACT_CONTRADICTS_PROFILE/);
    assert.equal(fs.readFileSync(fixture.specPath, 'utf-8'), before);
  });
  assert.equal(visual.select(backend.projectDir, { spec: backend.specPath, uiImpact: 'no' }).intent, 'not-applicable');
  assert.equal(visual.select(unknown.projectDir, { spec: unknown.specPath, uiImpact: 'no' }).intent, 'not-applicable');
});

test('手工写入的前端或混合 Profile 的 no/not-applicable 在普通工作流被拦截', function() {
  const frontend = createSpec(['ui-impact: "no"', 'visual-context-intent: "not-applicable"']);
  const mixed = createSpec(['ui-impact: "no"', 'visual-context-intent: "not-applicable"']);
  addProfileReference(frontend, ['frontend']);
  addProfileReference(mixed, ['frontend'], 'project', true);

  [frontend, mixed].forEach(function(fixture) {
    const ordinary = workflow.analyzeSpec(fixture.projectDir, fixture.specPath);
    const archiveReady = workflow.analyzeSpec(fixture.projectDir, fixture.specPath, { archiveReady: true });
    assert.ok(ordinary.gates.plan.blockers.some(function(blocker) {
      return blocker.message.indexOf('VISUAL_CONTEXT_SELECTION_INVALID') !== -1;
    }));
    assert.deepEqual(archiveReady.blockers.filter(function(issue) {
      return issue.indexOf('VISUAL_CONTEXT_SELECTION_INVALID') !== -1;
    }), []);
  });
});
