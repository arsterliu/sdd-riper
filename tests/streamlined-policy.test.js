const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const policy = require('../src/core/workflow-policy');
const autonomy = require('../src/core/autonomy-state');
const specState = require('../src/core/spec-state');
const specIndex = require('../src/core/spec-index');
const validate = require('../src/commands/validate');

function spec(mode, signals) {
  return [
    '---', 'mode: ' + mode, 'workflow-policy: streamlined-v1', 'autonomy-mode: human', 'status: draft', '---',
    '## Intake', 'Requirement: 完成一个任务', 'Scope: 局部修改', 'Risks: 可回滚', 'Risk Signals: ' + signals,
    '## Acceptance Criteria', 'Acceptance: 行为可观察', 'Verification: unit',
    '## Plan', 'Step: 实施并验证', 'Plan Approved By: human:reviewer',
    'Approved At: 2026-01-01T00:00:00Z', 'Gate Evidence: 已审阅',
    '## Completion Verification', 'Result: PASS', 'Verification: node --test',
    'Verified At: 2026-01-02T00:00:00Z'
  ].join('\n') + '\n';
}

function log() {
  return ['## Execute Log', 'Step 1:', 'Status: DONE', 'Verification: node --test',
    'Timestamp: 2026-01-02T00:00:00Z', 'Step: completion-verification', 'Status: DONE',
    'Result: 验收通过', 'Verification: node --test', 'Timestamp: 2026-01-02T00:01:00Z'].join('\n');
}

function design() {
  return ['## Design', 'Approach: 采用共享策略', 'Impact: 一个模块',
    'Interface / Data: 兼容原接口', 'Compatibility / Rollback: 可回滚',
    'Verification: node --test'].join('\n');
}

function reviewed(content) {
  return content.replace('## Completion Verification', [
    '## Completion Verification', 'Challenge Verdict: PASS',
    'Backtrack Target: Ready', 'Challenge Summary: 独立检查通过',
    'Challenge Executed By: subagent:fixture',
    'Challenge Executed At: 2026-01-02T00:02:00Z',
    'Challenge Evidence: PASS - 独立检查通过'
  ].join('\n'));
}

function snapshot(content, additions) {
  return Object.assign({ exists: true, location: 'active', status: 'draft', isGitRepo: false,
    mode: policy.frontmatter(content, 'mode'), autonomyMode: 'human', content,
    design: { exists: false, content: '' }, executeLog: { exists: false, content: '' },
    learning: { exists: false, content: '' },
    autonomy: { authorizationState: 'active', authorizedActors: ['design-reviewer', 'challenge-reviewer'] }
  }, additions || {});
}

function activateAuto(content) {
  const taskAuthorized = autonomy.appendEvent(content.replace('autonomy-mode: human', 'autonomy-mode: auto'), {
    eventId: 'task-authorization', eventType: 'task_authorization', mode: 'auto', decision: 'authorized',
    scopeDigest: autonomy.scopeSnapshot(content), riskSnapshot: autonomy.riskSnapshot(content),
    authorizedActors: 'main,worker,design-reviewer,challenge-reviewer',
    authorizedBy: 'human:fixture', authorizedAt: '2026-01-01T00:00:00Z', authorizationEvidence: '已确认'
  });
  return autonomy.appendEvent(taskAuthorized, {
    eventId: 'plan-activation', eventType: 'plan_activation', mode: 'auto', gate: 'Plan', decision: 'activated',
    scopeDigest: autonomy.scopeSnapshot(content), riskSnapshot: autonomy.riskSnapshot(content),
    planDigest: autonomy.planSnapshot(content), authorizedActors: 'main,worker,design-reviewer,challenge-reviewer',
    authorizedBy: 'agent:fixture', authorizedAt: '2026-01-01T00:00:01Z', authorizationEvidence: '已核对 Plan'
  });
}

test('risk tier uses explicit signals, a strict mode floor, and rejects ambiguous declarations', () => {
  assert.equal(policy.evaluate(spec('micro', 'none'), 'micro').tier, 'low');
  assert.equal(policy.evaluate(spec('micro', 'cross-module'), 'micro').tier, 'medium');
  assert.equal(policy.evaluate(spec('micro', 'public-api'), 'micro').tier, 'high');
  assert.equal(policy.evaluate(spec('standard', 'none'), 'standard').tier, 'high');
  assert.equal(policy.evaluate(spec('lite', 'none'), 'lite').tier, 'medium');
  assert.equal(policy.evaluate(spec('micro', 'none,security'), 'micro').issues.length > 0, true);
  assert.equal(policy.evaluate(spec('micro', 'invented'), 'micro').issues.length > 0, true);
  const negated = spec('micro', 'none').replace('Risks: 可回滚', 'Risks: 不修改权限、计费或数据迁移');
  assert.deepEqual(policy.evaluate(negated, 'micro').flags, []);
});

test('new authorization snapshots bind Intake, confirmed requirement, Research and risk content across modes', () => {
  for (const mode of ['micro', 'lite', 'standard']) {
    let content = spec(mode, 'none');
    content += mode === 'standard'
      ? '## Research\n### Findings\n事实 A\n### Confirmed Requirement\nScope Boundary: A\n'
      : '## Findings\n事实 A\n## Confirmed Requirement\nScope Boundary: A\n';
    assert.notEqual(autonomy.scopeSnapshot(content), autonomy.scopeSnapshot(content.replace('Scope Boundary: A', 'Scope Boundary: B')), mode);
    assert.notEqual(autonomy.scopeSnapshot(content), autonomy.scopeSnapshot(content.replace('Scope: 局部修改', 'Scope: 跨包修改')), mode);
    assert.notEqual(autonomy.researchSnapshot(content), autonomy.researchSnapshot(content.replace('事实 A', '事实 B')), mode);
    const topLevel = content + '## Requirement Review\n原始目标 A\n## Open Questions\n待确认 A\n';
    assert.notEqual(autonomy.researchSnapshot(topLevel), autonomy.researchSnapshot(topLevel.replace('原始目标 A', '原始目标 B')), mode);
    assert.notEqual(autonomy.researchSnapshot(topLevel), autonomy.researchSnapshot(topLevel.replace('待确认 A', '待确认 B')), mode);
    assert.notEqual(autonomy.riskSnapshot(content), autonomy.riskSnapshot(content.replace('Risks: 可回滚', 'Risks: 影响用户数据')), mode);
    assert.equal(autonomy.scopeSnapshot(content), autonomy.scopeSnapshot(content.replace(/\n/g, '\r\n').replace('Scope: 局部修改', 'Scope:   局部修改  ')), mode);
    assert.equal(autonomy.scopeSnapshot(content), autonomy.scopeSnapshot(content.replace('Scope: 局部修改', 'Scope:\t局部修改')), mode);
    assert.equal(autonomy.planSnapshot(content), autonomy.planSnapshot(content.replace('Step: 实施并验证', 'Step:\t实施并验证')), mode);
    const twoSignals = content.replace('Risk Signals: none', 'Risk Signals: cross-module,multi-step');
    assert.equal(autonomy.scopeSnapshot(twoSignals), autonomy.scopeSnapshot(twoSignals.replace('cross-module,multi-step', ' multi-step, cross-module ')), mode);
  }
});

test('streamlined authorizations expire on requirement or risk changes without a false formatting change', () => {
  const content = spec('micro', 'none');
  const authorized = activateAuto(content);
  assert.equal(autonomy.resolve(authorized).authorizationState, 'active');
  assert.equal(autonomy.resolve(authorized.replace('Scope: 局部修改', 'Scope: 跨模块修改')).authorizationState, 'required');
  assert.equal(autonomy.resolve(authorized.replace('Risks: 可回滚', 'Risks: 不可回滚')).authorizationState, 'required');
  assert.equal(autonomy.resolve(authorized.replace('Risk Signals: none', 'Risk Signals: public-api')).authorizationState, 'required');
  assert.equal(autonomy.resolve(authorized.replace('Scope: 局部修改', 'Scope:   局部修改  ')).authorizationState, 'active');
});

test('low-risk task reaches archive authorization with inline fresh verification', () => {
  const state = specState.evaluate(snapshot(spec('micro', 'none')));
  assert.equal(state.policy.tier, 'low');
  assert.equal(state.nextAction, 'request_archive_authorization');
  assert.equal(state.gates.challenge.required, false);
  assert.equal(specState.evaluate(snapshot(spec('micro', 'none').replace('Result: PASS', 'Result: FAIL'))).completionReady, false);
  const failedChallenge = spec('micro', 'none').replace('## Completion Verification',
    '## Completion Verification\nChallenge Verdict: FAIL_CODE');
  const failed = specState.evaluate(snapshot(failedChallenge));
  assert.equal(failed.completionReady, false);
  assert.equal(failed.gates.challenge.state, 'failed');
});

test('missing autonomy mode cannot pass streamlined archive readiness', () => {
  const content = spec('micro', 'none').replace('autonomy-mode: human\n', '');
  const state = specState.evaluate(snapshot(content, { autonomyMode: '' }));
  assert.equal(state.completionReady, false);
  assert.match(state.blockers.map(blocker => blocker.message).join('\n'), /Autonomy mode is missing or invalid/);
});

test('medium task needs log and independent completion review; design latitude additionally needs Design', () => {
  const content = spec('micro', 'cross-module');
  assert.match(specState.evaluate(snapshot(content)).blockers.map(b => b.message).join('\n'), /Execute Log is required/);
  const withLog = snapshot(content, { executeLog: { exists: true, content: log() } });
  assert.match(specState.evaluate(withLog).blockers.map(b => b.message).join('\n'), /Challenge Verdict/);
  const complete = specState.evaluate(snapshot(reviewed(content), { executeLog: { exists: true, content: log() } }));
  assert.equal(complete.completionReady, true, JSON.stringify(complete.blockers));
  const latitude = specState.evaluate(snapshot(reviewed(spec('micro', 'design-latitude')), { executeLog: { exists: true, content: log() } }));
  assert.match(latitude.blockers.map(b => b.message).join('\n'), /Design file is required/);
});

test('compact acceptance and verification remain valid in lite and standard modes', () => {
  const lite = reviewed(spec('lite', 'none'));
  const liteState = specState.evaluate(snapshot(lite, { mode: 'lite', executeLog: { exists: true, content: log() } }));
  assert.equal(liteState.blockers.some(b => /AC-###/.test(b.message)), false);
  const highContent = reviewed(spec('standard', 'none'));
  const high = specState.evaluate(snapshot(highContent, { mode: 'standard', design: { exists: true, content: design() },
    executeLog: { exists: true, content: log() } }));
  assert.equal(high.blockers.some(b => /AC-###/.test(b.message)), false);
});

test('medium-risk Execute Log cannot close with unresolved work or an unapproved major deviation', () => {
  const content = reviewed(spec('micro', 'cross-module'));
  const blocked = log().replace('Status: DONE', 'Status: BLOCKED');
  const blockedState = specState.evaluate(snapshot(content, { executeLog: { exists: true, content: blocked } }));
  assert.match(blockedState.blockers.map(b => b.message).join('\n'), /unresolved BLOCKED/);
  const escalated = log().replace('Status: DONE', 'Status: BUGFIX_ESCALATED');
  const escalatedState = specState.evaluate(snapshot(content, { executeLog: { exists: true, content: escalated } }));
  assert.match(escalatedState.blockers.map(b => b.message).join('\n'), /unresolved BUGFIX_ESCALATED/);
  const major = log().replace('Status: DONE', 'Status: DEVIATED_MAJOR');
  const majorState = specState.evaluate(snapshot(content, { executeLog: { exists: true, content: major } }));
  assert.match(majorState.blockers.map(b => b.message).join('\n'), /later explicit human authorization/);
});

test('high-risk Design review is required and becomes stale when Design changes', () => {
  const body = design();
  const base = reviewed(spec('micro', 'public-api'));
  const withReview = base.replace('## Acceptance Criteria', [
    '## Design Reference', 'Design Reviewed By: subagent:designer',
    'Design Reviewed At: 2026-01-01T12:00:00Z',
    'Design Review Digest: ' + policy.designReviewDigest(base, body),
    'Design Review Summary: 方案边界已核查', '## Acceptance Criteria'
  ].join('\n'));
  const additions = { design: { exists: true, content: body }, executeLog: { exists: true, content: log() } };
  assert.equal(specState.evaluate(snapshot(withReview, additions)).completionReady, true);
  const stale = specState.evaluate(snapshot(withReview, Object.assign({}, additions, {
    design: { exists: true, content: body.replace('一个模块', '两个模块') }
  })));
  assert.match(stale.blockers.map(b => b.message).join('\n'), /Design Review Digest is missing or stale/);
  const changedScope = withReview.replace('Scope: 局部修改', 'Scope: 扩大到另一模块');
  assert.match(specState.evaluate(snapshot(changedScope, additions)).blockers.map(b => b.message).join('\n'), /Design Review Digest is missing or stale/);
  const changedAcceptance = withReview.replace('Acceptance: 行为可观察', 'Acceptance: 新增错误场景');
  assert.match(specState.evaluate(snapshot(changedAcceptance, additions)).blockers.map(b => b.message).join('\n'), /Design Review Digest is missing or stale/);
  const late = withReview.replace('Design Reviewed At: 2026-01-01T12:00:00Z', 'Design Reviewed At: 2026-01-02T01:00:00Z');
  assert.match(specState.evaluate(snapshot(late, additions)).blockers.map(b => b.message).join('\n'), /review must precede implementation/);
});

test('legacy content keeps the prior digest and gate behavior', () => {
  const old = spec('micro', 'none').replace('workflow-policy: streamlined-v1\n', '');
  assert.equal(policy.version(old), 'legacy-v1');
  assert.equal(autonomy.scopeSnapshot(old), autonomy.scopeSnapshot(old.replace('## Intake', '## Intake').replace('Scope: 局部修改', 'Scope: 局部修改')));
  const result = specState.evaluate(snapshot(old));
  assert.equal(result.policy, undefined);
  assert.match(result.blockers.map(b => b.message).join('\n'), /Execute Log/);
  const bodyMention = old + '\n## Research\n引用：workflow-policy: streamlined-v1\n';
  assert.equal(policy.version(bodyMention), 'legacy-v1');
  assert.equal(specState.evaluate(snapshot(bodyMention)).policy, undefined);
  const spoofMode = spec('micro', 'none').replace('autonomy-mode: human\n', '') + '\n## Notes\nautonomy-mode: human\n';
  assert.equal(autonomy.resolve(spoofMode).mode, '');
});

test('stale auto authorization blocks archive validation and archive command', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-streamlined-stale-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const specsDir = path.join(root, 'mydocs', 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
  const file = path.join(specsDir, 'v1.0-stale.md');
  const approved = activateAuto(spec('micro', 'none'));
  fs.writeFileSync(file, approved, 'utf8');
  assert.equal(validate.validateSpec(file, { projectDir: root, archiveReady: true }).ok, true);
  fs.writeFileSync(file, approved.replace('Scope: 局部修改', 'Scope: 跨模块修改'), 'utf8');
  assert.equal(validate.validateSpec(file, { projectDir: root, archiveReady: true }).ok, false);
  const cli = path.resolve(__dirname, '../bin/cli.js');
  const archive = spawnSync(process.execPath, [cli, 'archive', root, 'stale', '--authorized-by', 'human:fixture',
    '--authorization-evidence', '测试夹具授权'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(archive.status, 0);
  assert.match(archive.stderr, /authorization is missing or stale/);
});

test('status, index, inspection and execution review follow policy rather than legacy mode', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-streamlined-projection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '.sdd-config'), 'DOCS_DIR="mydocs"\nAUTONOMY_MODE="human"\n', 'utf8');
  const specsDir = path.join(root, 'mydocs', 'specs');
  const designDir = path.join(root, 'mydocs', 'design');
  const logsDir = path.join(root, 'mydocs', 'logs');
  [specsDir, designDir, logsDir].forEach(dir => fs.mkdirSync(dir, { recursive: true }));
  const highFile = path.join(specsDir, 'v1.0-high.md');
  fs.writeFileSync(highFile, spec('micro', 'public-api').replace('status: draft',
    'status: draft\ndesign-file: "mydocs/design/v1.0-high.design.md"\nexecute-log-file: "mydocs/logs/v1.0-high.execute.md"'), 'utf8');
  fs.writeFileSync(path.join(designDir, 'v1.0-high.design.md'), design(), 'utf8');
  fs.writeFileSync(path.join(logsDir, 'v1.0-high.execute.md'), log(), 'utf8');
  const liteFile = path.join(specsDir, 'v1.0-medium.md');
  fs.writeFileSync(liteFile, spec('lite', 'none').replace('status: draft',
    'status: draft\ndesign-file: "mydocs/design/v1.0-medium.design.md"\nexecute-log-file: "mydocs/logs/v1.0-medium.execute.md"'), 'utf8');
  const indexed = specIndex.listSpecs(root).specs;
  const high = indexed.find(item => item.taskName === 'high' || item.slug === 'high');
  const medium = indexed.find(item => item.taskName === 'medium' || item.slug === 'medium');
  assert.equal(high.artifacts.design.notRequired, undefined);
  assert.equal(high.artifacts.design.hasContent, true);
  assert.equal(medium.artifacts.design.notRequired, true);
  const cli = path.resolve(__dirname, '../bin/cli.js');
  const run = args => spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' });
  const inspect = run(['autonomy', 'inspect', root, '--spec', highFile]);
  assert.equal(inspect.status, 0, inspect.stdout + inspect.stderr);
  assert.match(inspect.stdout, /RISK_TIER: high/);
  assert.match(inspect.stdout, /DESIGN_DIGEST: sha256:/);
  const status = run(['status', root]);
  assert.match(status.stdout, /RISK_TIER: high/);
  assert.match(status.stdout, /REQUIRED_ARTIFACTS: Spec,Design,Execute Log/);
  const review = run(['review-execute', root, '--spec', highFile]);
  assert.match(review.stdout, /Approach: 采用共享策略/);
  assert.match(review.stdout, /Acceptance: 行为可观察/);
  assert.doesNotMatch(review.stdout, /micro mode: design and acceptance are embedded in Plan/);
  fs.writeFileSync(path.join(logsDir, 'v1.0-high.execute.md'),
    '<!--\nFiles:\nVerification: template placeholder\n-->\n' + log().replace('Status: DONE',
      'Status: DONE\nFiles: src/example.js'), 'utf8');
  const challenge = run(['challenge', root, '--spec', highFile]);
  const codeFiles = challenge.stdout.match(/^CODE_FILES: (.*)$/m);
  assert.equal(codeFiles && codeFiles[1], 'src/example.js');
});

test('discover defaults to the compact policy and can explicitly create legacy Specs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-streamlined-discover-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cli = path.resolve(__dirname, '../bin/cli.js');
  const run = args => spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' });
  assert.equal(run(['init', root]).status, 0);
  const fresh = run(['discover', root, '--task-name', 'fresh', '--spec-version', 'v1.0',
    '--requirement', '一个小任务', '--goal', '局部修复', '--context', 'none', '--autonomy-mode', 'human']);
  assert.equal(fresh.status, 0, fresh.stdout + fresh.stderr);
  const freshFile = path.join(root, 'mydocs/specs/v1.0-fresh.md');
  assert.match(fs.readFileSync(freshFile, 'utf8'), /^workflow-policy: streamlined-v1$/m);
  assert.equal(fs.existsSync(path.join(root, 'mydocs/logs/v1.0-fresh.execute.md')), false);
  const legacy = run(['discover', root, '--task-name', 'old', '--spec-version', 'v1.1',
    '--requirement', '旧任务', '--context', 'none', '--workflow-policy', 'legacy-v1']);
  assert.equal(legacy.status, 0, legacy.stdout + legacy.stderr);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'mydocs/specs/v1.1-old.md'), 'utf8'), /^workflow-policy:/m);
  assert.equal(fs.existsSync(path.join(root, 'mydocs/logs/v1.1-old.execute.md')), true);
});

test('auto authorization grants only reviewers required by the new risk tier', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-streamlined-actors-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cli = path.resolve(__dirname, '../bin/cli.js');
  const run = args => spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' });
  assert.equal(run(['init', root, '--autonomy-mode', 'auto']).status, 0);
  for (const [name, signals, actors] of [
    ['low', 'none', 'main,worker'],
    ['medium', 'cross-module', 'main,worker,challenge-reviewer'],
    ['high', 'public-api', 'main,worker,design-reviewer,challenge-reviewer']
  ]) {
    assert.equal(run(['discover', root, '--task-name', name, '--spec-version', 'v1.0',
      '--requirement', '测试任务', '--goal', '验证授权', '--context', 'none']).status, 0);
    const file = path.join(root, 'mydocs', 'specs', 'v1.0-' + name + '.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
      .replace('Risks:', 'Risks: 可回滚')
      .replace('Risk Signals:', 'Risk Signals: ' + signals), 'utf8');
    const inspect = run(['autonomy', 'inspect', root, '--spec', file]);
    assert.equal(inspect.status, 0, inspect.stdout + inspect.stderr);
    const digest = inspect.stdout.match(/AUTHORIZED_SCOPE_DIGEST: (sha256:[a-f0-9]+)/)[1];
    const result = run(['autonomy', 'authorize', root, '--spec', file, '--expected-scope-digest', digest,
      '--authorized-by', 'human:fixture', '--authorization-evidence', '测试任务授权']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(fs.readFileSync(file, 'utf8'), new RegExp('Authorized Actors: ' + actors + '(?:\\r?\\n|$)'));
  }
});

test('archive validation uses the same streamlined state as direct evaluation', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-streamlined-validate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const specsDir = path.join(root, 'mydocs', 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
  const file = path.join(specsDir, 'v1.0-low.md');
  fs.writeFileSync(file, spec('micro', 'none'), 'utf8');
  assert.equal(validate.validateSpec(file, { projectDir: root, archiveReady: true }).ok, true);
  fs.writeFileSync(file, spec('micro', 'none').replace('Result: PASS', 'Result: FAIL'), 'utf8');
  assert.equal(validate.validateSpec(file, { projectDir: root, archiveReady: true }).ok, false);
});

test('low-risk task archives without optional Design, Execute Log, or Challenge', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-streamlined-archive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const specsDir = path.join(root, 'mydocs', 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
  fs.writeFileSync(path.join(specsDir, 'v1.0-low.md'), spec('micro', 'none'), 'utf8');
  const cli = path.resolve(__dirname, '../bin/cli.js');
  const run = spawnSync(process.execPath, [cli, 'archive', root, 'low', '--authorized-by', 'human:fixture',
    '--authorization-evidence', '测试夹具授权'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const archived = fs.readFileSync(path.join(root, 'mydocs', 'archive', 'v1.0-low.md'), 'utf8');
  assert.match(archived, /## 最终方案\s+Step: 实施并验证/);
  assert.match(fs.readFileSync(path.join(root, 'mydocs', 'archive', 'index.md'), 'utf8'), /\| PASS \|/);
  const reopened = spawnSync(process.execPath, [cli, 'reopen', root, 'low', '--defect', '回归缺陷'],
    { cwd: root, encoding: 'utf8' });
  assert.equal(reopened.status, 0, reopened.stdout + reopened.stderr);
  assert.match(fs.readFileSync(path.join(specsDir, 'v1.0-low.md'), 'utf8'), /^workflow-policy: streamlined-v1$/m);
  assert.equal(fs.existsSync(path.join(root, 'mydocs/logs/v1.0-low.execute.md')), false);
});
