const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(file) { return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf-8'); }

function assertNoActiveLegacySwitches(content, file) {
  content.split(/\r?\n/).forEach(function(line) {
    if (!/APPROVAL_POLICY|CRUISE_ENABLED/.test(line)) return;
    assert.match(line, /removed|retired|ignored|not supported|已移除|不再支持/i,
      file + ' may name a retired key only in explicit compatibility/removal prose: ' + line);
    assert.doesNotMatch(line, /remains supported|\buse\b|使用|仍可用|继续支持|仍支持|process\.env|config(?:uration)?\s*(?:lookup|read|get)|读取配置/i, file);
  });
}

function assertHumanRiskStops(content, file) {
  const stopContext = /单独询问|单独确认|单独停机|仍会停下|必须停下|人工确认|人工授权|请求确认/;
  [
    ['不可逆', /不可逆/],
    ['范围扩大', /范围扩大|扩大任务范围/],
    ['新风险', /新风险/],
    ['平台权限', /平台权限/]
  ].forEach(function(rule) {
    const matches = Array.from(content.matchAll(new RegExp(rule[1].source, 'g')));
    assert.ok(matches.length, file + ' must name hard stop: ' + rule[0]);
    const hasStopContext = matches.some(function(match) {
      const context = content.slice(Math.max(0, match.index - 500), match.index + match[0].length + 160);
      return stopContext.test(context);
    });
    assert.ok(hasStopContext, file + ' must place ' + rule[0] + ' in an explicit human-confirmation/stop context');
  });
}

test('human-facing guides explain the three autonomy modes without legacy policy switches', function() {
  ['README.md', 'GUIDE.md', 'TEAM-GUIDE.md', 'REFERENCE.md', 'SKILL.md'].forEach(function(file) {
    const content = read(file);
    assert.match(content, /auto/);
    assert.match(content, /supervised/);
    assert.match(content, /human/);
    assertNoActiveLegacySwitches(content, file);
  });
  assert.match(read('GUIDE.md'), /(?=[\s\S]*Plan Approval)(?=[\s\S]*(?:后续持续授权|持续自动推进))(?=[\s\S]*(?:不会自动推出|不能推导|独立))[\s\S]+/,
    'GUIDE must separate Plan Approval from continuing authorization');
  assert.match(read('README.md'), /AI[^。\n]{0,160}(?:说明[^。\n]{0,80}风险[^。\n]{0,100}告诉[^。\n]{0,100}确认|什么时候停)/,
    'README must explain hard stops in natural language');
  assertHumanRiskStops(read('README.md'), 'README.md');
});

test('generated agent guidance permits only freshly authorized automatic reviewers', function() {
  ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.github/copilot-instructions.md'].forEach(function(file) {
    const content = read(file);
    assert.match(content, /fresh task\/plan authorization/);
    assert.match(content, /project configuration or Plan Approval alone is insufficient/);
    assertNoActiveLegacySwitches(content, file);
  });
});

test('current governance sources do not restore removed approval or cruise switches', function() {
  ['src/commands/_gen-ai-configs.js', 'src/core/ai-config-rules.js', 'protocols/sdd-riper-one.md', 'protocols/sdd-riper-one-light.md'].forEach(function(file) {
    const content = read(file);
    assert.doesNotMatch(content, /(?:APPROVAL_POLICY|CRUISE_ENABLED)\s*[:=]/, file + ' must not generate an active configuration key');
    assertNoActiveLegacySwitches(content, file);
  });
});

test('legacy switch helper accepts removal prose and rejects active support or lookup prose', function() {
  [
    'APPROVAL_POLICY is removed; CRUISE_ENABLED is no longer supported.',
    'APPROVAL_POLICY is retired.',
    'CRUISE_ENABLED 已移除。'
  ].forEach(function(line) {
    assert.doesNotThrow(function() { assertNoActiveLegacySwitches(line, 'fixture'); }, line);
  });
  [
    'APPROVAL_POLICY remains supported',
    'APPROVAL_POLICY is removed but use APPROVAL_POLICY for old tasks',
    'APPROVAL_POLICY 已移除，但仍使用 APPROVAL_POLICY',
    'CRUISE_ENABLED 已移除但仍可用',
    'CRUISE_ENABLED retired; 继续支持 CRUISE_ENABLED',
    'APPROVAL_POLICY removed; 仍支持 APPROVAL_POLICY',
    '继续使用 CRUISE_ENABLED',
    'process.env.APPROVAL_POLICY',
    'config lookup: CRUISE_ENABLED'
  ].forEach(function(line) {
    assert.throws(function() { assertNoActiveLegacySwitches(line, 'fixture'); }, line);
  });
});

const agentRules = [
  ['archive', /request_archive_authorization[\s\S]{0,220}(?:explicit|current user)/i],
  ['profile', /(?=[^\n]{0,320}exact reviewed digest)(?=[^\n]{0,320}(?:authorization|stop))[^\n]+/i],
  ['E2E Provider', /Verification: e2e[^\n]{0,160}Provider: <provider-id>/i],
  ['E2E SKIPPED human gate', /E2E[^\n]{0,180}SKIPPED[^\n]{0,180}(?:human:<name>|human authorization|human approval)/i],
  ['visual baseline', /(?=[^\n]{0,500}baseline)(?=[^\n]{0,500}(?:never|must not))(?=[^\n]{0,500}(?:approve|replace|create))[^\n]+/i],
  ['irreversible stop', /(?=[^\n]{0,420}irreversible)(?=[^\n]{0,420}(?:must stop|still stop|stop for|human authorization|non-delegable stop))[^\n]+/i],
  ['scope expansion stop', /(?=[^\n]{0,420}scope expansion)(?=[^\n]{0,420}(?:must stop|still stop|stop for|human authorization|non-delegable stop))[^\n]+/i],
  ['new risk stop', /(?=[^\n]{0,420}new risk)(?=[^\n]{0,420}(?:must stop|still stop|stop for|human authorization|non-delegable stop))[^\n]+/i],
  ['platform permission stop', /(?=[^\n]{0,420}platform permissions?)(?=[^\n]{0,420}(?:must stop|still stop|stop for|human authorization|non-delegable stop))[^\n]+/i],
  ['history readonly', /Archived and legacy artifacts remain readable without migration|Historical Read Compatibility/i]
];
['SKILL.md', 'src/core/ai-config-rules.js'].forEach(function(file) {
  agentRules.forEach(function(rule) {
    test(file + ' preserves hard stop: ' + rule[0], function() { assert.match(read(file), rule[1]); });
  });
});

const humanResponsibilities = {
  'README.md': [/(?=[\s\S]*单独停机)(?=[\s\S]*最终归档)/, /(?=[\s\S]*Project Profile)(?=[\s\S]*精确摘要)(?=[\s\S]*digest)/, /(?=[\s\S]*E2E)(?=[\s\S]*SKIPPED)(?=[\s\S]*单独停机)/],
  'GUIDE.md': [/归档[^。\n]{0,160}(?:明确|当前用户|授权)/, /工程画像确认/, /跳过 E2E/],
  'REFERENCE.md': [/exact reviewed digest|精确 digest/i, /SKIPPED[\s\S]{0,160}human:<name>/i, /baseline[\s\S]{0,180}(?:human|人工|批准)/i, /archived|legacy|历史制品/i],
  'TEAM-GUIDE.md': [/归档[^。\n]{0,160}(?:当前用户|授权)/, /E2E[^。\n]{0,160}人工/, /不可逆[^。\n]{0,160}(?:人工|介入)/]
};
Object.entries(humanResponsibilities).forEach(function(entry) {
  entry[1].forEach(function(pattern, index) {
    test(entry[0] + ' preserves assigned hard stop ' + (index + 1), function() { assert.match(read(entry[0]), pattern); });
  });
});

['README.md', 'GUIDE.md'].forEach(function(file) {
  test(file + ' preserves four independently checked human risk stops', function() {
    assertHumanRiskStops(read(file), file);
  });
});
