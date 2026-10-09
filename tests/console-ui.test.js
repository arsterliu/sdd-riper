'use strict';

var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var test = require('node:test');
var vm = require('node:vm');

function source(file) {
  return fs.readFileSync(path.resolve('src', 'web', file), 'utf8');
}

function renderAcCoverage(spec) {
  var js = source('console.js');
  var start = js.indexOf('function esc(');
  var end = js.indexOf('function renderGateList(', start);
  var root = { innerHTML: '' };
  var context = {
    qs: function(id) {
      assert.equal(id, 'ac-coverage');
      return root;
    }
  };
  vm.runInNewContext(js.slice(start, end), context);
  context.renderAcCoverage(spec);
  return root.innerHTML;
}

test('Console 把 Spec 态势板、Profile 与 Quality Plan 固定为只读 UI 契约', function() {
  var html = source('index.html');
  var js = source('console.js');
  var css = source('console.css');

  assert.match(html, /id="spec-status-board"/, '态势板根节点必须稳定可定位');
  assert.match(html, /id="project-profile"/, '项目 Profile 摘要必须有独立容器');
  assert.match(html, /id="quality-plan"/, '选中 Spec 的 Quality Plan 必须有独立容器');
  assert.match(html, /Needs repair/, '摘要必须表达显式需要修复的状态');
  assert.doesNotMatch(html, /Blocked Gates/, '普通未来 Gate 不得被汇总为阻塞');

  assert.match(js, /function renderProjectProfile\(/, '必须渲染 Profile 的受控摘要');
  assert.match(js, /function renderQualityPlan\(/, '必须渲染 Quality Plan 的受控摘要');
  assert.match(js, /workState/, '态势板必须消费服务端派生 Work State');
  assert.match(js, /qualityPlan/, '详情必须消费服务端派生 Quality Plan');
  assert.doesNotMatch(js, /quality plan\s+\./i, '浏览器不得通过 CLI 生成 Quality Plan');

  assert.match(css, /\.spec-board-scroll\s*\{[^}]*overflow-x:\s*auto/s, '宽表仅允许局部横向滚动');
});

test('Console AC Coverage renders only the DTO states and ignores validation prose', function() {
  var html = renderAcCoverage({
    acCoverage: {
      schemaVersion: 1,
      completionState: 'recorded',
      items: [
        { acId: 'AC-001', state: 'missing', skipApprovalState: 'not_applicable' },
        { acId: 'AC-002', state: 'pass', skipApprovalState: 'not_applicable' },
        { acId: 'AC-003', state: 'fail', skipApprovalState: 'not_applicable' },
        { acId: 'AC-004', state: 'skipped', skipApprovalState: 'approved' },
        { acId: 'AC-005', state: 'invalid', skipApprovalState: 'not_applicable' },
        { acId: 'AC-006', state: 'skipped', skipApprovalState: 'incomplete' }
      ],
      diagnostics: [{ code: 'ac-coverage-invalid-evidence' }]
    },
    validate: {
      issues: [
        'AC Coverage: AC-999 verification failed.',
        'WARNING: AC Coverage: AC-998 scenario "old regex" not found.'
      ]
    }
  });

  ['AC-001', 'AC-002', 'AC-003', 'AC-004', 'AC-005', 'AC-006', 'Missing', 'Pass', 'Fail', 'Skipped', 'Invalid', 'Skip approved', 'Skip approval incomplete'].forEach(function(value) {
    assert.match(html, new RegExp(value));
  });
  assert.doesNotMatch(html, /AC-999|AC-998|old regex/);
});

test('Console AC Coverage shows a safe unavailable notice for absent or unsupported DTOs', function() {
  assert.match(renderAcCoverage({}), /暂无结构化 Coverage 数据/);
  assert.match(renderAcCoverage({ acCoverage: { schemaVersion: 2 } }), /暂无结构化 Coverage 数据/);
});

test('Console AC Coverage drops malicious or duplicate DTO entries and unrecognized diagnostics', function() {
  var html = renderAcCoverage({
    acCoverage: {
      schemaVersion: 1,
      completionState: 'recorded',
      items: [
        { acId: 'AC-001', state: 'pass', skipApprovalState: 'not_applicable' },
        { acId: 'AC-001', state: 'fail', skipApprovalState: 'not_applicable' },
        { acId: '<img src=x onerror=coverage-secret>', state: 'pass', skipApprovalState: 'not_applicable' }
      ],
      diagnostics: [
        { code: 'ac-coverage-invalid-evidence' },
        { code: 'ac-coverage-invalid-evidence' },
        { code: '<img src=x onerror=coverage-secret>' }
      ]
    }
  });

  assert.equal((html.match(/AC-001/g) || []).length, 1);
  assert.equal((html.match(/ac-coverage-invalid-evidence/g) || []).length, 1);
  assert.doesNotMatch(html, /coverage-secret|<img|onerror/);
});

test('Console gate and artifact labels follow policy and preserve an optional failed review', function() {
  var js = source('console.js');
  var rows = [];
  var score = { textContent: '' };
  var context = {
    gateDefinitions: [['design', 'Design', 'Technical design'], ['executeLog', 'Execute Log', 'Execution facts'],
      ['challengePass', 'Challenge PASS', 'Independent review']],
    qs: function(id) { return id === 'gate-list' ? { innerHTML: '', appendChild: function(row) { rows.push(row); } } : score; },
    document: { createElement: function() { return { className: '', innerHTML: '' }; } },
    esc: function(value) { return String(value); }
  };
  vm.runInNewContext(js.slice(js.indexOf('function gateValue('), js.indexOf('function previewUrl(')), context);
  vm.runInNewContext(js.slice(js.indexOf('function renderGateList('), js.indexOf('function renderArtifacts(')), context);

  var highMicro = { mode: 'micro', phase: 'design', artifacts: { design: { notRequired: false } },
    workflow: { gates: { design: { state: 'blocked' }, execute: { state: 'pass' }, challenge: { state: 'blocked' } },
      policyRequirements: { completionReview: true }, challengeVerdict: 'FAIL_LOG' }, completion: {} };
  assert.equal(context.gateValue(highMicro, 'design'), false);
  context.renderGateList(highMicro);
  assert.doesNotMatch(rows[0].innerHTML, /Not required/);

  rows.length = 0;
  var low = { mode: 'micro', phase: 'archive_authorization',
    artifacts: { design: { notRequired: true }, executeLog: { notRequired: true } },
    workflow: { gates: { design: { state: 'pass' }, execute: { state: 'pass' }, challenge: { state: 'pass' } },
      policyRequirements: { completionReview: false }, challengeVerdict: 'NOT_REQUIRED' }, completion: {} };
  context.renderGateList(low);
  assert.equal(rows.filter(function(row) { return /Not required/.test(row.innerHTML); }).length, 3);
  assert.match(context.artifactHtml('Execute Log', 'executeLog', { notRequired: true }), /验证记录保存在 Spec/);
  assert.match(context.artifactHtml('Learning', 'learning', { notRequired: true }), /Learning Record/);

  rows.length = 0;
  low.workflow.gates.challenge.state = 'failed';
  low.workflow.challengeVerdict = 'FAIL_CODE';
  context.renderGateList(low);
  assert.doesNotMatch(rows[2].innerHTML, /Not required/);
  assert.match(rows[2].innerHTML, /Failed/);
});

function consoleView() {
  assert.ok(fs.existsSync(path.resolve('src/web/console-view.js')), '共享展示模块尚未实现');
  return require('../src/web/console-view');
}

test('任务搜索组合范围与名称、版本、中文状态，并保持输入集合不变', function() {
  var view = consoleView();
  var specs = [
    { id: 'a', taskName: 'Web-Console', version: 'v4.21', status: 'draft', phase: 'plan', workState: { id: 'awaiting_plan_approval' } },
    { id: 'b', taskName: 'retire-legacy', version: 'v4.20', status: 'archived', phase: 'archived', workState: { id: 'archived' } }
  ];
  assert.deepEqual(view.filterTasks(specs, ' WEB-CON ', 'active').map(function(s) { return s.id; }), ['a']);
  assert.deepEqual(view.filterTasks(specs, '4.20', 'all').map(function(s) { return s.id; }), ['b']);
  assert.deepEqual(view.filterTasks(specs, '待批准', 'active').map(function(s) { return s.id; }), ['a']);
  assert.deepEqual(view.filterTasks(specs, '只读', 'archived').map(function(s) { return s.id; }), ['b']);
  assert.equal(view.filterTasks(specs, 'legacy', 'active').length, 0);
  assert.equal(view.filterTasks(specs, '不存在', 'all').length, 0);
  assert.equal(specs.length, 2);
});

test('归档目录索引不是任务，不进入任务搜索结果', function() {
  var view = consoleView();
  assert.equal(view.filterTasks([{ fileName: 'index.md', status: 'archived', taskName: 'index' }], '', 'all').length, 0);
});

test('真实目标从 Spec 提取，缺失时不将模拟内容或后续章节当成目标', function() {
  var view = consoleView();
  assert.equal(view.goalFromSpec('---\ntask-name: x\n---\n## Intake\nRequirement: 实际目标\nScope: 当前范围\n'), '实际目标');
  assert.equal(view.goalFromSpec('## Intake\nGoal: 明确目标\nRequirement: 补充需求\n'), '明确目标');
  assert.equal(view.goalFromSpec('## Summary\n尚未填写\n## Plan\nRequirement: 不是任务目标\n'), '');
});

test('文档阅读转义 HTML 与代码，仅允许安全链接，原文不被修改', function() {
  var view = consoleView();
  var original = '---\nstatus: draft\n---\n# 标题\n\n<script>alert(1)</script>\n\n[危险](javascript:alert(1)) [来源](https://example.org/a?q=1)\n\n```js\n<img src=x onerror=alert(1)>\n```';
  var html = view.documentHtml(original);
  assert.match(html, /<h1[^>]*>标题<\/h1>/);
  assert.doesNotMatch(html, /<script>|<img|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="https:\/\/example.org/);
  assert.match(html, /<pre>/);
  assert.equal(original.includes('status: draft'), true);
});

test('历史制品只提供阅读，没有编辑入口', function() {
  var js = source('console.js');
  var context = { esc: function(v) { return String(v || ''); } };
  vm.runInNewContext(js.slice(js.indexOf('function artifactHtml('), js.indexOf('function renderArtifacts(')), context);
  var html = context.artifactHtml('Design', 'design', { exists: true, hasContent: true, relativePath: 'mydocs/archive/old.design.md' }, true);
  assert.match(html, /data-preview-artifact/);
  assert.doesNotMatch(html, /data-open-artifact|>Edit</);
});

function browserHarness() {
  var requests = [];
  var nodes = {};
  var context = {
    ConsoleView: fs.existsSync(path.resolve('src/web/console-view.js')) ? require('../src/web/console-view') : {},
    document: { getElementById: function(id) {
      return nodes[id] || (nodes[id] = { textContent: '', innerHTML: '', value: '', classList: { add: function() {}, remove: function() {}, toggle: function() {} }, addEventListener: function() {}, setAttribute: function() {} });
    } },
    fetch: function(url) { return new Promise(function(resolve) { requests.push({ url: url, resolve: resolve }); }); },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    localStorage: { getItem: function() { return null; }, setItem: function() {} },
    window: {}
  };
  var js = source('console.js').replace(/loadProjectInfo\(\);\s*$/, '');
  vm.runInNewContext(js, context);
  var rendered = [];
  context.render = function() {};
  context.renderDetail = function(spec) { context.state.detail = spec; rendered.push(spec.id); };
  context.renderProjectProfile = function() {};
  context.state.project = { configured: true, projectDir: 'project-a' };
  return { context: context, requests: requests, rendered: rendered };
}

test('较早的任务请求不能覆盖较新的选择', async function() {
  var h = browserHarness();
  h.context.loadDetail('a', { id: 'a' });
  h.context.loadDetail('b', { id: 'b' });
  h.requests[1].resolve({ ok: true, json: async function() { return { id: 'b' }; } });
  await new Promise(function(resolve) { setImmediate(resolve); });
  h.requests[0].resolve({ ok: true, json: async function() { return { id: 'a' }; } });
  await new Promise(function(resolve) { setImmediate(resolve); });
  assert.equal(h.context.state.selectedId, 'b');
  assert.equal(h.context.state.detail.id, 'b');
});

test('清理项目后旧详情响应不能恢复旧项目内容', async function() {
  var h = browserHarness();
  h.context.loadDetail('old', { id: 'old' });
  h.context.resetProjectView('切换项目');
  h.requests[0].resolve({ ok: true, json: async function() { return { id: 'old' }; } });
  await new Promise(function(resolve) { setImmediate(resolve); });
  assert.equal(h.context.state.selectedId, '');
  assert.equal(h.context.state.detail, null);
});

test('文件夹选择与其他项目切换串行，迟到选择不覆盖最后项目', async function() {
  var h = browserHarness();
  var seen = [];
  h.context.renderProject = function(info) { h.context.state.project = info; seen.push(info.projectDir); };
  h.context.loadSpecs = function() {};
  var browse = h.context.chooseProjectFolder();
  await new Promise(function(resolve) { setImmediate(resolve); });
  var latest = h.context.setProject('latest');
  await new Promise(function(resolve) { setImmediate(resolve); });
  assert.equal(h.requests.length, 1, '切换请求应等待文件夹选择完成');
  h.requests[0].resolve({ ok: true, json: async function() { return { projectDir: 'picker', configured: true }; } });
  await browse;
  await new Promise(function(resolve) { setImmediate(resolve); });
  h.requests[1].resolve({ ok: true, json: async function() { return { projectDir: 'latest', configured: true }; } });
  await latest;
  assert.equal(h.context.state.project.projectDir, 'latest');
  assert.deepEqual(seen, ['latest']);
});

test('文件夹选择完成后，初始项目的迟到响应不覆盖新项目', async function() {
  var h = browserHarness();
  var seen = [];
  h.context.renderProject = function(info) { h.context.state.project = info; seen.push(info.projectDir); };
  h.context.loadSpecs = function() {};
  h.context.loadProjectInfo();
  var browse = h.context.chooseProjectFolder();
  await new Promise(function(resolve) { setImmediate(resolve); });
  h.requests[1].resolve({ ok: true, json: async function() { return { projectDir: 'picker', configured: true }; } });
  await browse;
  h.requests[0].resolve({ ok: true, json: async function() { return { projectDir: 'initial', configured: true }; } });
  await new Promise(function(resolve) { setImmediate(resolve); });
  assert.deepEqual(seen, ['picker']);
});

test('打开文件的迟到成功或失败不影响新任务验证区', async function() {
  for (var ok of [true, false]) {
    var h = browserHarness();
    var issues = [];
    h.context.renderValidation = function(result) { issues.push(result); };
    h.context.state.selectedId = 'a'; h.context.state.detail = { id: 'a' };
    h.context.openArtifact('spec');
    h.context.state.selectedId = 'b'; h.context.state.detail = { id: 'b' };
    h.requests[0].resolve({ ok: ok, json: async function() { return ok ? { target: { relativePath: 'a.md' } } : { error: 'A 文件打开失败' }; } });
    await new Promise(function(resolve) { setImmediate(resolve); });
    assert.equal(issues.length, 0);
    assert.equal(h.context.document.getElementById('validation-summary').textContent, '');
  }
});
