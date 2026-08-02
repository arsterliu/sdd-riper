'use strict';

var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var test = require('node:test');

function source(file) {
  return fs.readFileSync(path.resolve('src', 'web', file), 'utf8');
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
