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
