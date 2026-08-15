const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execSync, spawnSync } = require('child_process');
const autonomyState = require('../src/core/autonomy-state');

const CLI = 'node ' + path.resolve('bin/cli.js');
const tmpBase = path.join(os.tmpdir(), 'sdd-cmd-test-' + Date.now());

function run(args) {
  try {
    return execSync(CLI + ' ' + args, { encoding: 'utf-8', cwd: tmpBase });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '') + ' exit:' + (e.status || 1);
  }
}

function countOccurrences(text, needle) {
  return (text.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

function stripFencedCode(text) {
  var lines = text.split(/\r?\n/);
  var fence = null;
  return lines.map(function(line) {
    var marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (!fence && marker) { fence = { char: marker[1][0], length: marker[1].length }; return ''; }
    if (fence && new RegExp('^ {0,3}' + fence.char + '{' + fence.length + ',}\\s*$').test(line)) { fence = null; return ''; }
    return fence ? '' : line;
  }).join('\n');
}

function gfmSlug(title) {
  return title.trim().toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[`*~]/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function markdownAnchors(text) {
  var anchors = new Set();
  var counts = new Map();
  Array.from(stripFencedCode(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm), function(match) { return match[1]; }).forEach(function(title) {
    var slug = gfmSlug(title);
    var count = counts.get(slug) || 0;
    counts.set(slug, count + 1);
    anchors.add(count ? slug + '-' + count : slug);
  });
  return anchors;
}

function markdownSection(text, headingPattern, level) {
  var source = stripFencedCode(text);
  var heading = new RegExp('^' + '#'.repeat(level) + '\\s+.*(?:' + headingPattern + ').*$', 'mi').exec(source);
  if (!heading) return '';
  var tail = source.slice(heading.index + heading[0].length);
  var nextBoundary = /^#{1,6}\s+/gm;
  var boundary;
  while ((boundary = nextBoundary.exec(tail))) {
    var boundaryLevel = boundary[0].match(/^#+/)[0].length;
    if (boundaryLevel <= level) break;
  }
  return boundary ? source.slice(heading.index, heading.index + heading[0].length + boundary.index) : source.slice(heading.index);
}

function artifactPath(projectDir, specFile, field) {
  var content = fs.readFileSync(specFile, 'utf-8');
  var match = content.match(new RegExp('^' + field + ':\\s*"?([^"\\r\\n]*)"?\\s*$', 'm'));
  assert.ok(match && match[1], specFile + ' missing ' + field);
  var ref = match[1].trim();
  return path.isAbsolute(ref) ? ref : path.join(projectDir, ref);
}

function headingNames(heading) {
  return [heading];
}

function insertSectionContent(file, heading, body) {
  var content = fs.readFileSync(file, 'utf-8');
  var marker = headingNames(heading).map(function(name) { return new RegExp('(^## ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\r?\\n)', 'm'); })
    .find(function(candidate) { return candidate.test(content); });
  assert.ok(marker, file + ' missing section ' + heading);
  fs.writeFileSync(file, content.replace(marker, '$1' + body + '\n'), 'utf-8');
}

function replaceSectionStart(content, heading, body) {
  var marker = headingNames(heading).map(function(name) { return new RegExp('(^## ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\r?\\n)', 'm'); })
    .find(function(candidate) { return candidate.test(content); });
  assert.ok(marker, 'missing section ' + heading);
  return content.replace(marker, '$1' + body + '\n');
}

function fillApproval(content) {
  return fillConfirmedReq(content)
    .replace(/^Research Reviewed By:$/m, 'Research Reviewed By: subagent:research-fixture')
    .replace(/^Research Reviewed At:$/m, 'Research Reviewed At: 2026-01-01T00:00:00Z')
    .replace(/^Plan Approved By:$/m, 'Plan Approved By: human:fixture')
    .replace(/^Approved At:$/m, 'Approved At: 2026-01-01T00:00:00Z')
    .replace(/^Gate Evidence:$/m, 'Gate Evidence: fixture approval evidence');
}

function authorizeFixture(content) {
  var mode = (content.match(/^autonomy-mode:\s*"?([^"\r\n]+)/m) || [])[1] || 'supervised';
  if (mode === 'human') return content;
  var riskSnapshot = autonomyState.riskFlagsSnapshot([]);
  var authorized = autonomyState.appendEvent(content, {
    eventId: 'fixture-authorization', eventType: mode === 'auto' ? 'task_authorization' : 'plan_authorization',
    mode: mode, gate: mode === 'supervised' ? 'Plan' : '', decision: 'authorized',
    scopeDigest: autonomyState.scopeSnapshot(content), riskSnapshot: riskSnapshot,
    planDigest: mode === 'supervised' ? autonomyState.planSnapshot(content) : '',
    authorizedActors: 'main,worker,research-reviewer,challenge-reviewer', authorizedBy: 'human:fixture',
    authorizedAt: '2026-01-01T00:00:00Z', authorizationEvidence: 'fixture authorization'
  });
  if (mode !== 'auto') return authorized;
  return autonomyState.appendEvent(authorized, {
    eventId: 'fixture-plan-activation', eventType: 'plan_activation', mode: 'auto', gate: 'Plan', decision: 'activated',
    scopeDigest: autonomyState.scopeSnapshot(content), riskSnapshot: riskSnapshot, planDigest: autonomyState.planSnapshot(content),
    authorizedActors: 'main,worker,research-reviewer,challenge-reviewer', authorizedBy: 'agent:fixture',
    authorizedAt: '2026-01-01T00:00:01Z', authorizationEvidence: 'fixture plan activation'
  });
}

function runArgs(args, cwd) {
  var result = spawnSync(process.execPath, [path.resolve('bin/cli.js')].concat(args), {
    encoding: 'utf-8',
    cwd: cwd || tmpBase
  });
  return {
    status: result.status,
    output: (result.stdout || '') + (result.stderr || '')
  };
}

function snapshotTree(root) {
  var result = {};
  function visit(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).sort().forEach(function(name) {
      var absolute = path.join(dir, name);
      var relative = path.relative(root, absolute).replace(/\\/g, '/');
      var stat = fs.statSync(absolute);
      if (stat.isDirectory()) {
        result[relative + '/'] = 'dir';
        visit(absolute);
      } else {
        result[relative] = fs.readFileSync(absolute, 'utf-8');
      }
    });
  }
  visit(root);
  return result;
}

function archiveAuthorizationArgs() {
  return ['--authorized-by', 'human:fixture', '--authorization-evidence', 'user approved this archive'];
}

function fillChallenge(content, verdict, opts) {
  opts = opts || {};
  var summary = opts.summary || 'ok.';
  var targets = {
    PASS: 'Ready',
    PASS_WITH_CONCERNS: 'Learning Check',
    FAIL_SPEC: 'Research',
    FAIL_DESIGN: 'Design',
    FAIL_ACCEPTANCE: 'Acceptance',
    FAIL_PLAN: 'Plan',
    FAIL_CODE: 'Execute / Debug',
    FAIL_LOG: 'Execute Log',
    FAIL_LEARNING: 'Learning Check'
  };
  return content
    .replace(/^Challenge Verdict:$/m, 'Challenge Verdict: ' + verdict)
    .replace(/^Backtrack Target:$/m, 'Backtrack Target: ' + (opts.backtrack || targets[verdict] || 'Research'))
    .replace(/^Challenge Summary:$/m, 'Challenge Summary: ' + summary)
    .replace(/^Challenge Executed By:$/m, 'Challenge Executed By: ' + (opts.executedBy || 'subagent:challenge-fixture'))
    .replace(/^Challenge Executed At:$/m, 'Challenge Executed At: ' + (opts.executedAt || '2026-01-01T00:01:00Z'))
    .replace(/^Challenge Evidence:$/m, 'Challenge Evidence: ' + (opts.evidence || verdict + ' - ' + summary));
}

function fillAutoApproval(content) {
  return fillConfirmedReq(content)
    .replace(/^Research Reviewed By:$/m, 'Research Reviewed By: subagent:research-fixture')
    .replace(/^Research Reviewed At:$/m, 'Research Reviewed At: 2026-01-01T00:00:00Z')
    .replace(/^Plan Approved By:$/m, 'Plan Approved By: agent:codex')
    .replace(/^Approved At:$/m, 'Approved At: 2026-01-01T00:00:00Z')
    .replace(/^Gate Evidence:$/m, 'Gate Evidence: validate-ready evidence recorded by agent.');
}

function fillConfirmedReq(content) {
  return content
    .replace(/^Scope Boundary:$/m, 'Scope Boundary: single module')
    .replace(/^Irreversibility:$/m, 'Irreversibility: none')
    .replace(/^Impact Radius:$/m, 'Impact Radius: internal only')
    .replace(/^Dependencies & Constraints:$/m, 'Dependencies & Constraints: none')
    .replace(/^Acceptance Intent:$/m, 'Acceptance Intent: behavior preserved');
}

function completionVerificationLog(timestamp) {
  return [
    'Step: completion-verification',
    'Status: DONE',
    'Result: completion verification passed.',
    'AC Coverage:',
    '  - AC-001: PASS',
    'Four-Axis Checklist:',
    '  - Axis 0 (Intake): aligned',
    '  - Axis 1 (Design/Acceptance/Plan): complete',
    '  - Axis 2 (Code Diff): within boundary',
    '  - Axis 3 (Execute Log): faithful',
    'Verification: node --test tests\\commands.test.js',
    'Timestamp: ' + (timestamp || '2026-01-01T00:00:00Z')
  ].join('\n');
}

function withCompletionContract(logText) {
  return logText + '\n---\n' + completionVerificationLog().replace('AC-001: PASS', 'AC-999: PASS');
}

function standardDesignContent() {
  return [
    'Selected Option / ADR: 选择方案 A，原因是边界清晰且可回滚。',
    'Requirement Traceability: AC-001 覆盖归档门禁和设计合同。',
    'Impact Scope: 影响 CLI validate/archive 流程和测试夹具，不影响运行时业务逻辑。',
    'Architecture View: validate 作为归档门禁读取 Spec、Design、Execute Log 并输出阻断项。',
    'Data Model / Schema: 不新增持久化表结构，仅读取 markdown frontmatter 和章节字段。',
    'Interface Contract: CLI 输入保持 sdd validate <dir> --archive-ready，输出仍为 RESULT 和 issue 列表。',
    'Compatibility / Rollback: 新 spec 使用更严格字段；回滚方式是恢复旧模板和字段列表。',
    'Test Strategy: node:test command suite.'
  ].join('\n');
}

function requestJson(server, requestPath, method) {
  method = method || 'GET';
  var address = server.address();
  return new Promise(function(resolve, reject) {
    var req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path: requestPath,
      method: method
    }, function(res) {
      var chunks = '';
      res.setEncoding('utf-8');
      res.on('data', function(chunk) { chunks += chunk; });
      res.on('end', function() {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(chunks) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function requestText(server, requestPath, method) {
  method = method || 'GET';
  var address = server.address();
  return new Promise(function(resolve, reject) {
    var req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path: requestPath,
      method: method
    }, function(res) {
      var chunks = '';
      res.setEncoding('utf-8');
      res.on('data', function(chunk) { chunks += chunk; });
      res.on('end', function() {
        resolve({ statusCode: res.statusCode, body: chunks });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function requestJsonBody(server, requestPath, method, payload) {
  method = method || 'POST';
  var address = server.address();
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify(payload || {});
    var req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path: requestPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, function(res) {
      var chunks = '';
      res.setEncoding('utf-8');
      res.on('data', function(chunk) { chunks += chunk; });
      res.on('end', function() {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(chunks) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function waitForSpecs(server, expectedCount) {
  for (var i = 0; i < 20; i++) {
    var response = await requestJson(server, '/api/specs');
    if (response.statusCode === 200 && response.body.state === 'ready' && response.body.specs.length === expectedCount) {
      return response;
    }
    await delay(25);
  }
  return requestJson(server, '/api/specs');
}

async function waitForProjectSummary(server, projectCount) {
  for (var i = 0; i < 20; i++) {
    var response = await requestJsonBody(server, '/api/projects/summary', 'POST', {
      projectDirs: Array.prototype.slice.call(arguments, 2)
    });
    if (response.statusCode === 200 &&
        response.body.projects.length === projectCount &&
        response.body.projects.every(function(project) { return project.state === 'ready'; })) {
      return response;
    }
    await delay(25);
  }
  return requestJsonBody(server, '/api/projects/summary', 'POST', {
    projectDirs: Array.prototype.slice.call(arguments, 2)
  });
}

function makeStandardArchiveReady(demo, specFile) {
  var designFile = artifactPath(demo, specFile, 'design-file');
  var logFile = artifactPath(demo, specFile, 'execute-log-file');
  fs.mkdirSync(path.join(demo, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(demo, 'tests', 'commands.test.js'), 'test fixture\n', 'utf-8');
  var content = fs.readFileSync(specFile, 'utf-8');
  content = content;
  content = replaceSectionStart(content, 'Innovate Options', 'Option A: 保留校验后的归档流程。Pros: 简单。Cons: 仅测试覆盖。\nOption B: 跳过归档。Pros: 无。Cons: 无法覆盖。\nSelected: 方案 A。');
  content = replaceSectionStart(content, 'Acceptance Criteria', '### AC-001: 完整 standard spec 可以归档\nRequirement: archive-flow\nType: functional\nVerification: unit\nAutomated: yes\nTest: tests/commands.test.js\n\nScenario: 有效 standard spec\n  Given standard spec 包含设计、AC、审批、执行日志和 PASS 评审\n  When archive 执行\n  Then spec 被移动到 archive');
  content = fillApproval(content);
  // Fill Challenge fields (Completion Verification section replaces old Review Verdict)
  content = content
    .replace(/^Challenge Verdict:$/m, 'Challenge Verdict: PASS')
    .replace(/^Backtrack Target:$/m, 'Backtrack Target: Ready')
    .replace(/^Challenge Summary:$/m, 'Challenge Summary: all gates pass.')
    .replace(/^Challenge Executed By:$/m, 'Challenge Executed By: subagent:archive-fixture')
    .replace(/^Challenge Executed At:$/m, 'Challenge Executed At: 2026-01-01T00:01:00Z')
    .replace(/^Challenge Evidence:$/m, 'Challenge Evidence: PASS - all gates pass.');
  fs.writeFileSync(specFile, authorizeFixture(content), 'utf-8');
  insertSectionContent(designFile, 'Technical Design', standardDesignContent());
  insertSectionContent(logFile, 'Execute Log', [
    'Step: completion-verification',
    'Status: DONE',
    'Result: 验证通过。',
    'AC Coverage:',
    '  - AC-001: PASS',
    '    Test: tests/commands.test.js',
    '    Method: unit',
    'Four-Axis Checklist:',
    '  - Axis 0 (Intake): aligned',
    '  - Axis 1 (Design/Acceptance/Plan): complete',
    '  - Axis 2 (Code Diff): within boundary',
    '  - Axis 3 (Execute Log): faithful',
    'Verification: node --test tests\\commands.test.js',
    'Timestamp: 2026-01-01T00:00:00Z'
  ].join('\n'));
  return { designFile: designFile, logFile: logFile };
}

function makeStandardExecutedButUnchallenged(demo, specFile) {
  var designFile = artifactPath(demo, specFile, 'design-file');
  var logFile = artifactPath(demo, specFile, 'execute-log-file');
  fs.mkdirSync(path.join(demo, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(demo, 'tests', 'commands.test.js'), 'test fixture\n', 'utf-8');
  var content = fs.readFileSync(specFile, 'utf-8');
  content = content;
  content = replaceSectionStart(content, 'Innovate Options', 'Option A: 在执行完成后强制路由到 Challenge。Pros: 不会漏掉门禁。Cons: 需要显式记录结果。\nOption B: 只依赖归档校验。Pros: 改动小。Cons: 容易误导 agent。\nSelected: Option A。');
  content = replaceSectionStart(content, 'Acceptance Criteria', '### AC-001: challenge required after execute\nRequirement: challenge-route\nType: functional\nVerification: unit\nAutomated: yes\nTest: tests/commands.test.js\n\nScenario: Challenge required\n  Given standard spec 已完成执行\n  When next 或 resume 运行\n  Then 输出 Challenge 阶段');
  content = fillApproval(content);
  fs.writeFileSync(specFile, authorizeFixture(content), 'utf-8');
  insertSectionContent(designFile, 'Technical Design', standardDesignContent());
  insertSectionContent(logFile, 'Execute Log', [
    'Step: completion-verification',
    'Status: DONE',
    'Result: 执行完成，等待 Challenge。',
    'AC Coverage:',
    '  - AC-001: PASS',
    '    Test: tests/commands.test.js',
    '    Method: unit',
    'Four-Axis Checklist:',
    '  - Axis 0 (Intake): aligned',
    '  - Axis 1 (Design/Acceptance/Plan): complete',
    '  - Axis 2 (Code Diff): within boundary',
    '  - Axis 3 (Execute Log): faithful',
    'Verification: node --test tests\\commands.test.js',
    'Timestamp: 2026-01-01T00:00:00Z'
  ].join('\n'));
  return { designFile: designFile, logFile: logFile };
}

function makeStandardBlockedCompletionVerification(demo, specFile) {
  var artifacts = makeStandardExecutedButUnchallenged(demo, specFile);
  fs.writeFileSync(artifacts.logFile, [
    '# Execute Log',
    '',
    '## Execute Log',
    '',
    '---',
    'Step: 1 - implementation',
    'Status: DONE',
    'Result: 普通执行步骤完成。',
    'Timestamp: 2026-01-01T00:00:00Z',
    '---',
    '',
    '---',
    'Step: completion-verification',
    'Status: BLOCKED',
    'Result: 完成验证未通过，不能进入 Challenge。',
    'Timestamp: 2026-01-01T00:01:00Z',
    '---'
  ].join('\n'), 'utf-8');
  return artifacts;
}

function makeStandardBlockedThenDoneCompletionVerification(demo, specFile) {
  var artifacts = makeStandardExecutedButUnchallenged(demo, specFile);
  fs.writeFileSync(artifacts.logFile, [
    '# Execute Log',
    '',
    '## Execute Log',
    '',
    '---',
    'Step: completion-verification',
    'Status: BLOCKED',
    'Result: 第一次完成验证未通过。',
    'Timestamp: 2026-01-01T00:01:00Z',
    '---',
    '',
    '---',
    'Step: completion-verification',
    'Status: DONE',
    'Result: 修复后完成验证通过，等待 Challenge。',
    'AC Coverage:',
    '  - AC-001: PASS',
    '    Test: tests/commands.test.js',
    '    Method: unit',
    'Four-Axis Checklist:',
    '  - Axis 0 (Intake): aligned',
    '  - Axis 1 (Design/Acceptance/Plan): complete',
    '  - Axis 2 (Code Diff): within boundary',
    '  - Axis 3 (Execute Log): faithful',
    'Verification: node --test tests\\commands.test.js',
    'Timestamp: 2026-01-01T00:02:00Z',
    '---'
  ].join('\n'), 'utf-8');
  return artifacts;
}

function appendPostChallengeCompletion(logFile) {
  fs.appendFileSync(logFile, [
    '',
    '---',
    'Step: 2 - post-challenge bugfix',
    'Status: BUGFIX',
    'Result: Challenge 涔嬪悗杩藉姞淇锛岄渶瑕侀噸鏂拌Е鍙?Challenge銆?',
    'Timestamp: 2026-01-01T00:02:00Z',
    '---',
    '',
    '---',
    'Step: completion-verification',
    'Status: DONE',
    'Result: 淇鍚庨噸鏂板畬鎴愰獙璇侊紝Challenge evidence 宸茶繃鏈熴€?',
    'AC Coverage:',
    '  - AC-001: PASS',
    '    Test: tests/commands.test.js',
    '    Method: unit',
    'Four-Axis Checklist:',
    '  - Axis 0 (Intake): aligned',
    '  - Axis 1 (Design/Acceptance/Plan): complete',
    '  - Axis 2 (Code Diff): within boundary',
    '  - Axis 3 (Execute Log): faithful',
    'Verification: node --test tests\\commands.test.js',
    'Timestamp: 2026-01-01T00:03:00Z',
    '---'
  ].join('\n'), 'utf-8');
}

describe('CLI commands', function() {
  beforeEach(function() {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(tmpBase, { recursive: true });
  });

  afterEach(function() {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it('init creates project structure', function() {
    var out = run('init ' + path.join(tmpBase, 'demo') + ' --mode standard');
    assert.ok(out.indexOf('[CREATE]') !== -1);
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', '.sdd-config')));
    var configText = fs.readFileSync(path.join(tmpBase, 'demo', '.sdd-config'), 'utf-8');
    assert.match(configText, /^AUTONOMY_MODE="supervised"$/m);
    assert.strictEqual(configText.indexOf('CRUISE_POLICY='), -1);
    assert.match(configText, /^CRUISE_MAX_ITERATIONS="5"$/m);
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'specs', '.gitkeep')));
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'design', '.gitkeep')));
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'logs', '.gitkeep')));
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'learnings', '.gitkeep')));
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'runs', '.gitkeep')));
    var agentsText = fs.readFileSync(path.join(tmpBase, 'demo', 'AGENTS.md'), 'utf-8');
    var claudeText = fs.readFileSync(path.join(tmpBase, 'demo', 'CLAUDE.md'), 'utf-8');
    assert.ok(agentsText.indexOf('<!-- sdd-riper:start -->') !== -1);
    assert.ok(agentsText.indexOf('This project uses SDD-RIPER') !== -1);
    assert.ok(agentsText.indexOf('Do not manually fill Challenge Evidence fields') !== -1);
    assert.ok(agentsText.indexOf('AUTONOMY_MODE') !== -1);
    assert.ok(agentsText.indexOf('Independent Review') !== -1);
    assert.ok(agentsText.indexOf('Cruise Driver') !== -1);
    assert.ok(claudeText.indexOf('Explicitly track RIPER phase transitions') !== -1);
  });

  it('init defaults generated AI config mode to micro', function() {
    var demo = path.join(tmpBase, 'demo-default-init-mode');
    run('init ' + demo);
    var agentsText = fs.readFileSync(path.join(demo, 'AGENTS.md'), 'utf-8');
    var configText = fs.readFileSync(path.join(demo, '.sdd-config'), 'utf-8');
    assert.ok(agentsText.indexOf('- Mode: micro') !== -1);
    assert.strictEqual(configText.indexOf('\nMODE='), -1);
  });

  it('init appends SDD-RIPER block to existing AI config files', function() {
    var demo = path.join(tmpBase, 'demo-existing-ai');
    fs.mkdirSync(path.join(demo, '.github'), { recursive: true });
    fs.writeFileSync(path.join(demo, 'AGENTS.md'), '# Project Agents\n\n- keep this project rule\n', 'utf-8');
    fs.writeFileSync(path.join(demo, 'CLAUDE.md'), '# Project Claude Rules\n\n- keep this Claude rule\n', 'utf-8');
    fs.writeFileSync(path.join(demo, '.cursorrules'), 'RULE: keep cursor rule\n', 'utf-8');
    fs.writeFileSync(path.join(demo, '.github', 'copilot-instructions.md'), '# Copilot\n\n- keep copilot rule\n', 'utf-8');

    var out = run('init ' + demo + ' --mode lite');
    assert.ok(out.indexOf('[MERGE]') !== -1);

    var agentsText = fs.readFileSync(path.join(demo, 'AGENTS.md'), 'utf-8');
    assert.ok(agentsText.indexOf('- keep this project rule') !== -1);
    assert.ok(agentsText.indexOf('<!-- sdd-riper:start -->') !== -1);
    assert.ok(agentsText.indexOf('- Mode: lite') !== -1);

    var claudeText = fs.readFileSync(path.join(demo, 'CLAUDE.md'), 'utf-8');
    assert.ok(claudeText.indexOf('- keep this Claude rule') !== -1);
    assert.ok(claudeText.indexOf('Claude-specific reminder') !== -1);
  });

  it('init refreshes existing SDD-RIPER block without duplicating it', function() {
    var demo = path.join(tmpBase, 'demo-refresh-ai');
    run('init ' + demo + ' --mode standard');
    var agentsFile = path.join(demo, 'AGENTS.md');
    var first = fs.readFileSync(agentsFile, 'utf-8');
    fs.writeFileSync(agentsFile, '# Custom Header\n\n' + first.replace('- Mode: standard', '- Mode: stale'), 'utf-8');

    var out = run('init ' + demo + ' --mode micro');
    assert.ok(out.indexOf('[UPDATE]') !== -1);

    var agentsText = fs.readFileSync(agentsFile, 'utf-8');
    assert.ok(agentsText.indexOf('# Custom Header') !== -1);
    assert.strictEqual(countOccurrences(agentsText, '<!-- sdd-riper:start -->'), 1);
    assert.strictEqual(countOccurrences(agentsText, '<!-- sdd-riper:end -->'), 1);
    assert.ok(agentsText.indexOf('- Mode: micro') !== -1);
    assert.strictEqual(agentsText.indexOf('- Mode: stale'), -1);
  });

  it('init --force does not overwrite existing AI config content', function() {
    var demo = path.join(tmpBase, 'demo-force-ai');
    fs.mkdirSync(demo, { recursive: true });
    fs.writeFileSync(path.join(demo, 'AGENTS.md'), '# Existing Agents\n\n- never delete me\n', 'utf-8');

    var out = run('init ' + demo + ' --mode standard --force');
    assert.ok(out.indexOf('[MERGE]') !== -1);

    var agentsText = fs.readFileSync(path.join(demo, 'AGENTS.md'), 'utf-8');
    assert.ok(agentsText.indexOf('- never delete me') !== -1);
    assert.ok(agentsText.indexOf('<!-- sdd-riper:start -->') !== -1);
    assert.strictEqual(countOccurrences(agentsText, '<!-- sdd-riper:start -->'), 1);
  });

  it('discover creates spec, design, and execute log artifacts', function() {
    var demo = path.join(tmpBase, 'd2');
    run('init ' + demo + ' --mode standard');
    var out = run('discover ' + demo + ' --task-name my-login --spec-version v1.0 --requirement login --mode standard');
    assert.ok(out.indexOf('SPEC CREATION PROMPT') !== -1);
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-my-login.md');
    var designFile = path.join(demo, 'mydocs', 'design', 'v1.0-my-login.design.md');
    var logFile = path.join(demo, 'mydocs', 'logs', 'v1.0-my-login.execute.md');
    assert.ok(fs.existsSync(sf));
    assert.ok(fs.existsSync(designFile));
    assert.ok(fs.existsSync(logFile));
    assert.strictEqual(artifactPath(demo, sf, 'design-file'), designFile);
    assert.strictEqual(artifactPath(demo, sf, 'execute-log-file'), logFile);
    assert.match(fs.readFileSync(sf, 'utf-8'), /^learning-file:\s*$/m);
    var specText = fs.readFileSync(sf, 'utf-8');
    var designText = fs.readFileSync(designFile, 'utf-8');
    var logText = fs.readFileSync(logFile, 'utf-8');
    assert.ok(specText.indexOf('### Confirmed Requirement') !== -1);
    assert.ok(specText.indexOf('## Innovate Options') !== -1);
    assert.ok(specText.indexOf('## Acceptance Criteria') !== -1);
    assert.ok(specText.indexOf('Plan Approved By:') !== -1);
    assert.ok(designText.indexOf('## Technical Design') !== -1);
    assert.ok(designText.indexOf('Selected Option / ADR') !== -1);
    assert.ok(designText.indexOf('Impact Scope') !== -1);
    assert.ok(designText.indexOf('Data Model / Schema') !== -1);
    assert.ok(designText.indexOf('Compatibility / Rollback') !== -1);
    assert.ok(logText.indexOf('## Execute Log') !== -1);
  });

  it('discover defaults new specs to micro when no mode is configured', function() {
    var demo = path.join(tmpBase, 'd2-default-micro');
    run('init ' + demo + ' --mode standard');
    var out = run('discover ' + demo + ' --task-name default-micro --spec-version v1.0 --requirement x');
    assert.ok(out.indexOf('[MODE] micro') !== -1, out);
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-default-micro.md');
    var designFile = path.join(demo, 'mydocs', 'design', 'v1.0-default-micro.design.md');
    var specText = fs.readFileSync(sf, 'utf-8');
    assert.match(specText, /^mode: micro$/m);
    assert.match(specText, /^design-file: ""$/m);
    assert.ok(!fs.existsSync(designFile), 'micro discover should not create a standalone design artifact');
  });

  it('discover accepts three-part versions and keeps version plus task-name unique', function() {
    var demo = path.join(tmpBase, 'd2-version3');
    run('init ' + demo + ' --mode standard');
    var out = run('discover ' + demo + ' --task-name sdk-adapter --spec-version v1.3.6 --requirement sdk --mode standard');
    assert.ok(out.indexOf('SPEC CREATION PROMPT') !== -1);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'specs', 'v1.3.6-sdk-adapter.md')));
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'design', 'v1.3.6-sdk-adapter.design.md')));
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'logs', 'v1.3.6-sdk-adapter.execute.md')));

    var parallel = run('discover ' + demo + ' --task-name api-contract --spec-version v1.3.6 --requirement api --mode standard');
    assert.ok(parallel.indexOf('SPEC CREATION PROMPT') !== -1);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'specs', 'v1.3.6-api-contract.md')));

    var duplicate = run('discover ' + demo + ' --task-name sdk-adapter --spec-version v1.3.6 --requirement sdk --mode standard');
    assert.ok(duplicate.indexOf('task-name must be unique within version') !== -1, duplicate);
    assert.ok(duplicate.indexOf('exit:') !== -1, duplicate);
  });

  it('discover keeps two-part versions compatible', function() {
    var demo = path.join(tmpBase, 'd2-version2');
    run('init ' + demo + ' --mode standard');
    var out = run('discover ' + demo + ' --task-name sdk-adapter --spec-version v1.3 --requirement sdk --mode standard');
    assert.ok(out.indexOf('SPEC CREATION PROMPT') !== -1);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'specs', 'v1.3-sdk-adapter.md')));
  });

  it('discover rejects unsupported version formats with clear guidance', function() {
    var demo = path.join(tmpBase, 'd2-bad-version');
    run('init ' + demo + ' --mode standard');
    var out = run('discover ' + demo + ' --task-name sdk-adapter --spec-version 1.3.6 --requirement sdk --mode standard');
    assert.ok(out.indexOf('Expected: v{N}.{M} or v{N}.{M}.{P}') !== -1, out);
    assert.ok(out.indexOf('exit:') !== -1, out);
  });

  it('discover accepts --version alias and fills structured intake fields', function() {
    var demo = path.join(tmpBase, 'd2b');
    run('init ' + demo + ' --mode standard');
    var out = run('discover ' + demo + ' --task-name my-login --version v1.0 --requirement login --goal auth --constraints none --mode standard');
    assert.ok(out.indexOf('SPEC CREATION PROMPT') !== -1);
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-my-login.md');
    var c = fs.readFileSync(sf, 'utf-8');
    assert.match(c, /^date: \d{4}-\d{2}-\d{2}$/m);
    assert.match(c, /^diff-base:/m);
    assert.ok(c.indexOf('## Intake') !== -1);
    assert.ok(c.indexOf('## ' + 'Invoc' + 'ation') === -1);
    assert.match(c, /### Requirement\r?\nrequirement: login\r?\ngoal: auth/);
    assert.match(c, /### Constraints\r?\nconstraints: none/);
  });

  it('discover auto-binds context/<task-name>/ as context-source', function() {
    var demo = path.join(tmpBase, 'd2c');
    run('init ' + demo + ' --mode standard');
    var ctxDir = path.join(demo, 'mydocs', 'context', 'my-task');
    fs.mkdirSync(ctxDir, { recursive: true });
    fs.writeFileSync(path.join(ctxDir, 'prd.md'), '# PRD', 'utf-8');
    var out = run('discover ' + demo + ' --task-name my-task --spec-version v1.0 --requirement x --mode standard');
    assert.ok(out.indexOf('Context source: mydocs/context/my-task') !== -1, 'should report context-source in output');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-my-task.md');
    var c = fs.readFileSync(sf, 'utf-8');
    assert.ok(c.indexOf('context-source: "mydocs/context/my-task"') !== -1, 'spec should have context-source frontmatter');
  });

  it('discover uses --context override when provided', function() {
    var demo = path.join(tmpBase, 'd2d');
    run('init ' + demo + ' --mode standard');
    var out = run('discover ' + demo + ' --task-name other --spec-version v1.0 --requirement x --context custom/path --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-other.md');
    var c = fs.readFileSync(sf, 'utf-8');
    assert.ok(c.indexOf('context-source: "custom/path"') !== -1, 'spec should use explicit --context value');
  });

  it('resume shows context-source when present', function() {
    var demo = path.join(tmpBase, 'd2e');
    run('init ' + demo + ' --mode standard');
    var ctxDir = path.join(demo, 'mydocs', 'context', 'ctx-task');
    fs.mkdirSync(ctxDir, { recursive: true });
    run('discover ' + demo + ' --task-name ctx-task --spec-version v1.0 --requirement x --mode standard');
    var out = run('resume ' + demo);
    assert.ok(out.indexOf('CONTEXT_SOURCE: mydocs/context/ctx-task') !== -1, 'resume should show context-source');
  });

  it('archive and reopen preserve three-part versions', function() {
    var demo = path.join(tmpBase, 'd2-version-archive');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name tri --spec-version v1.3.6 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.3.6-tri.md');
    makeStandardArchiveReady(demo, sf);

    var archived = run('archive ' + demo + ' tri --authorized-by human:fixture --authorization-evidence "user approved this archive"');
    assert.ok(archived.indexOf('[ARCHIVE]') !== -1, archived);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'archive', 'v1.3.6-tri.md')));
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'archive', 'v1.3.6-tri.design.md')));
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'archive', 'v1.3.6-tri.execute.md')));

    var reopened = run('reopen ' + demo + ' tri --defect regression --mode micro');
    assert.ok(reopened.indexOf('[CREATE]') !== -1, reopened);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'specs', 'v1.3.6-tri.md')));
    var c = fs.readFileSync(path.join(demo, 'mydocs', 'specs', 'v1.3.6-tri.md'), 'utf-8');
    assert.match(c, /^reopened-from: "v1.3.6"$/m);
  });

  it('archive honors an explicit version when same task-name exists in multiple versions', function() {
    var demo = path.join(tmpBase, 'd2-versioned-archive-target');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name tri --spec-version v1.3.6 --requirement x --mode standard');
    run('discover ' + demo + ' --task-name tri --spec-version v1.4 --requirement y --mode standard');
    makeStandardArchiveReady(demo, path.join(demo, 'mydocs', 'specs', 'v1.3.6-tri.md'));
    makeStandardArchiveReady(demo, path.join(demo, 'mydocs', 'specs', 'v1.4-tri.md'));

    var archived = run('archive ' + demo + ' v1.3.6-tri --authorized-by human:fixture --authorization-evidence "user approved this archive"');
    assert.ok(archived.indexOf('[ARCHIVE]') !== -1, archived);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'archive', 'v1.3.6-tri.md')));
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'specs', 'v1.4-tri.md')), 'v1.4 should remain active');
  });

  it('reopen honors an explicit version when archived task-name exists in multiple versions', function() {
    var demo = path.join(tmpBase, 'd2-versioned-reopen-target');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name tri --spec-version v1.3.6 --requirement x --mode standard');
    run('discover ' + demo + ' --task-name tri --spec-version v1.4 --requirement y --mode standard');
    makeStandardArchiveReady(demo, path.join(demo, 'mydocs', 'specs', 'v1.4-tri.md'));
    run('archive ' + demo + ' v1.4-tri --authorized-by human:fixture --authorization-evidence "user approved this archive"');
    makeStandardArchiveReady(demo, path.join(demo, 'mydocs', 'specs', 'v1.3.6-tri.md'));
    run('archive ' + demo + ' v1.3.6-tri --authorized-by human:fixture --authorization-evidence "user approved this archive"');

    var reopened = run('reopen ' + demo + ' v1.3.6-tri --defect regression --mode micro');
    assert.ok(reopened.indexOf('[CREATE]') !== -1, reopened);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'specs', 'v1.3.6-tri.md')));
    assert.ok(!fs.existsSync(path.join(demo, 'mydocs', 'specs', 'v1.4-tri.md')), 'v1.4 should remain archived');
    var c = fs.readFileSync(path.join(demo, 'mydocs', 'specs', 'v1.3.6-tri.md'), 'utf-8');
    assert.match(c, /^reopened-from: "v1.3.6"$/m);
  });

  it('new-learning honors an explicit version when same task-name exists in multiple versions', function() {
    var demo = path.join(tmpBase, 'd2-versioned-learning-target');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name tri --spec-version v1.3.6 --requirement x --mode standard');
    run('discover ' + demo + ' --task-name tri --spec-version v1.4 --requirement y --mode standard');

    var created = run('new-learning ' + demo + ' v1.3.6-tri');
    assert.ok(created.indexOf('[LEARNING]') !== -1, created);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'learnings', 'v1.3.6-tri.learning.md')));
    assert.ok(!fs.existsSync(path.join(demo, 'mydocs', 'learnings', 'v1.4-tri.learning.md')));
    var oldSpec = fs.readFileSync(path.join(demo, 'mydocs', 'specs', 'v1.3.6-tri.md'), 'utf-8');
    var newSpec = fs.readFileSync(path.join(demo, 'mydocs', 'specs', 'v1.4-tri.md'), 'utf-8');
    assert.ok(oldSpec.indexOf('learning-file: "mydocs/learnings/v1.3.6-tri.learning.md"') !== -1);
    assert.match(newSpec, /^learning-file:\s*$/m);
  });

  it('challenge record-result honors an explicit versioned --name', function() {
    var demo = path.join(tmpBase, 'd2-versioned-challenge-target');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name tri --spec-version v1.3.6 --requirement x --mode standard');
    run('discover ' + demo + ' --task-name tri --spec-version v1.4 --requirement y --mode standard');

    var out = run('challenge ' + demo + ' --name v1.3.6-tri --record-result PASS --summary ok --executed-by subagent:versioned-fixture');
    assert.ok(out.indexOf('v1.3.6-tri.md') !== -1, out);
    var oldSpec = fs.readFileSync(path.join(demo, 'mydocs', 'specs', 'v1.3.6-tri.md'), 'utf-8');
    var newSpec = fs.readFileSync(path.join(demo, 'mydocs', 'specs', 'v1.4-tri.md'), 'utf-8');
    assert.match(oldSpec, /^Challenge Verdict: PASS$/m);
    assert.match(newSpec, /^Challenge Verdict:\s*$/m);
  });

  it('challenge record-result honors an explicit --spec path', function() {
    var demo = path.join(tmpBase, 'd2-spec-path-challenge-target');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name alpha --spec-version v1.0 --requirement x --mode standard');
    run('discover ' + demo + ' --task-name beta --spec-version v1.1 --requirement y --mode standard');
    var alphaSpec = path.join(demo, 'mydocs', 'specs', 'v1.0-alpha.md');

    var out = run('challenge ' + demo + ' --spec ' + alphaSpec + ' --record-result PASS --summary ok --executed-by subagent:path-fixture');
    assert.ok(out.indexOf('v1.0-alpha.md') !== -1, out);
    var alphaText = fs.readFileSync(alphaSpec, 'utf-8');
    var betaText = fs.readFileSync(path.join(demo, 'mydocs', 'specs', 'v1.1-beta.md'), 'utf-8');
    assert.match(alphaText, /^Challenge Verdict: PASS$/m);
    assert.match(betaText, /^Challenge Verdict:\s*$/m);
  });

  it('challenge record-result requires explicit executed-by evidence', function() {
    var demo = path.join(tmpBase, 'd2-challenge-executor-required');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-executor --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-executor.md');

    var out = run('challenge ' + demo + ' --name challenge-executor --record-result PASS --summary ok');
    assert.ok(out.indexOf('--executed-by') !== -1, out);
    assert.ok(out.indexOf('[ERROR] --executed-by is required with --record-result (use subagent:<id>|external-agent:<id>|human:<name>|inline).') !== -1, out);
    assert.ok(out.indexOf('exit:') !== -1, out);
    var specText = fs.readFileSync(sf, 'utf-8');
    assert.match(specText, /^Challenge Executed By:\s*$/m);
  });

  it('resume routes executed standard specs without challenge evidence to challenge phase', function() {
    var demo = path.join(tmpBase, 'd2-resume-challenge-required');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-route --spec-version v1.0 --requirement x --mode standard');
    makeStandardExecutedButUnchallenged(demo, path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-route.md'));

    var out = run('resume ' + demo);
    assert.ok(out.indexOf('PHASE_HINT: challenge') !== -1, out);
    assert.ok(out.indexOf('Challenge Verdict') !== -1, out);
  });

  it('resume does not execute when agent plan approval is missing gate evidence', function() {
    var demo = path.join(tmpBase, 'd2-resume-plan-gate-incomplete');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name incomplete-plan --spec-version v1.0 --requirement x --mode standard');
    var specFile = path.join(demo, 'mydocs', 'specs', 'v1.0-incomplete-plan.md');
    var content = fs.readFileSync(specFile, 'utf-8');
    content = fillConfirmedReq(content)
      .replace(/^Research Reviewed By:$/m, 'Research Reviewed By: subagent:research-fixture')
      .replace(/^Research Reviewed At:$/m, 'Research Reviewed At: 2026-01-01T00:00:00Z')
      .replace(/^Plan Approved By:$/m, 'Plan Approved By: agent:codex');
    fs.writeFileSync(specFile, content, 'utf-8');

    var out = run('resume ' + demo);
    assert.ok(out.indexOf('PHASE_HINT: research_or_plan') !== -1, out);
    assert.ok(out.indexOf('PHASE_HINT: execute') === -1, out);
  });

  it('resume backtracks a fresh FAIL_CODE challenge to execute', function() {
    var demo = path.join(tmpBase, 'd2-resume-failed-challenge');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-fails --spec-version v1.0 --requirement x --mode standard');
    var specFile = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-fails.md');
    makeStandardExecutedButUnchallenged(demo, specFile);
    run('challenge ' + demo + ' --name challenge-fails --record-result FAIL_CODE --summary broken --executed-by subagent:challenge-fixture');

    var out = run('resume ' + demo);
    assert.ok(out.indexOf('PHASE_HINT: archive') === -1, out);
    assert.ok(out.indexOf('PHASE_HINT: execute') !== -1, out);
  });

  it('next routes executed specs without challenge evidence to run_challenge', function() {
    var demo = path.join(tmpBase, 'd2-next-challenge-required');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-route --spec-version v1.0 --requirement x --mode standard');
    makeStandardExecutedButUnchallenged(demo, path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-route.md'));

    var out = run('next ' + demo);
    assert.ok(out.indexOf('BACKTRACK_TARGET: Challenge') !== -1, out);
    assert.ok(out.indexOf('NEXT_ACTION: run_challenge') !== -1, out);
    assert.ok(out.indexOf('sdd challenge') !== -1, out);
    assert.ok(out.indexOf('--record-result') !== -1, out);
  });

  it('validate archive-ready explains how to run and record missing challenge', function() {
    var demo = path.join(tmpBase, 'd2-validate-challenge-required');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-route --spec-version v1.0 --requirement x --mode standard');
    makeStandardExecutedButUnchallenged(demo, path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-route.md'));

    var out = run('validate ' + demo + ' --archive-ready');
    assert.ok(out.indexOf('Challenge has not been executed') !== -1, out);
    assert.ok(out.indexOf('sdd challenge') !== -1, out);
    assert.ok(out.indexOf('--record-result') !== -1, out);
    assert.ok(out.indexOf('exit:') !== -1, out);
  });

  it('recorded challenge pass no longer routes to run_challenge', function() {
    var demo = path.join(tmpBase, 'd2-challenge-recorded-ready');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-route --spec-version v1.0 --requirement x --mode standard');
    makeStandardExecutedButUnchallenged(demo, path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-route.md'));
    run('challenge ' + demo + ' --name challenge-route --record-result PASS --summary ok --executed-by subagent:challenge-fixture');

    var next = run('next ' + demo);
    assert.ok(next.indexOf('NEXT_ACTION: request_archive_authorization') !== -1, next);
    assert.ok(next.indexOf('NEXT_ACTION: archive_ready') === -1, next);
    assert.ok(next.indexOf('NEXT_ACTION: run_challenge') === -1, next);
    var ok = run('validate ' + demo + ' --archive-ready');
    assert.ok(ok.indexOf('RESULT: OK') !== -1, ok);
  });

  it('stale recorded challenge routes back to run_challenge after new execution', function() {
    var demo = path.join(tmpBase, 'd2-stale-challenge-rerun');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-route --spec-version v1.0 --requirement x --mode standard');
    var specFile = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-route.md');
    var artifacts = makeStandardExecutedButUnchallenged(demo, specFile);
    run('challenge ' + demo + ' --name challenge-route --record-result PASS --summary ok --executed-by subagent:challenge-fixture');
    var content = fs.readFileSync(specFile, 'utf-8')
      .replace(/^Challenge Executed At:.*$/m, 'Challenge Executed At: 2026-01-01T00:01:00Z');
    fs.writeFileSync(specFile, content, 'utf-8');
    appendPostChallengeCompletion(artifacts.logFile);

    var resume = run('resume ' + demo);
    assert.ok(resume.indexOf('PHASE_HINT: challenge') !== -1, resume);
    var next = run('next ' + demo);
    assert.ok(next.indexOf('BACKTRACK_TARGET: Challenge') !== -1, next);
    assert.ok(next.indexOf('NEXT_ACTION: run_challenge') !== -1, next);
    assert.ok(next.indexOf('--record-result') !== -1, next);
    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Challenge Executed At must be after the last Execute Log step timestamp') !== -1, blocked);
    assert.ok(blocked.indexOf('--record-result') !== -1, blocked);
  });

  it('stale failed challenge routes to rerun challenge instead of old backtrack', function() {
    var demo = path.join(tmpBase, 'd2-stale-failed-challenge-rerun');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-route --spec-version v1.0 --requirement x --mode standard');
    var specFile = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-route.md');
    var artifacts = makeStandardExecutedButUnchallenged(demo, specFile);
    run('challenge ' + demo + ' --name challenge-route --record-result FAIL_CODE --summary old-failure --executed-by subagent:challenge-fixture');
    var content = fs.readFileSync(specFile, 'utf-8')
      .replace(/^Challenge Executed At:.*$/m, 'Challenge Executed At: 2026-01-01T00:01:00Z');
    fs.writeFileSync(specFile, content, 'utf-8');
    appendPostChallengeCompletion(artifacts.logFile);

    var next = run('next ' + demo);
    assert.ok(next.indexOf('BACKTRACK_TARGET: Challenge') !== -1, next);
    assert.ok(next.indexOf('NEXT_ACTION: run_challenge') !== -1, next);
    assert.ok(next.indexOf('repair_execute_debug') === -1, next);
  });

  it('stale non-code failed challenge routes to rerun challenge instead of old backtrack', function() {
    var demo = path.join(tmpBase, 'd2-stale-design-challenge-rerun');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-route --spec-version v1.0 --requirement x --mode standard');
    var specFile = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-route.md');
    var artifacts = makeStandardExecutedButUnchallenged(demo, specFile);
    run('challenge ' + demo + ' --name challenge-route --record-result FAIL_DESIGN --summary old-design-failure --executed-by subagent:challenge-fixture');
    var content = fs.readFileSync(specFile, 'utf-8')
      .replace(/^Challenge Executed At:.*$/m, 'Challenge Executed At: 2026-01-01T00:01:00Z');
    fs.writeFileSync(specFile, content, 'utf-8');
    appendPostChallengeCompletion(artifacts.logFile);

    var next = run('next ' + demo);
    assert.ok(next.indexOf('BACKTRACK_TARGET: Challenge') !== -1, next);
    assert.ok(next.indexOf('NEXT_ACTION: run_challenge') !== -1, next);
    assert.ok(next.indexOf('repair_design') === -1, next);
  });

  it('partial challenge evidence routes back to run_challenge', function() {
    var demo = path.join(tmpBase, 'd2-partial-challenge-evidence');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-route --spec-version v1.0 --requirement x --mode standard');
    var specFile = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-route.md');
    makeStandardExecutedButUnchallenged(demo, specFile);
    var content = fs.readFileSync(specFile, 'utf-8')
      .replace(/^Challenge Verdict:$/m, 'Challenge Verdict: PASS')
      .replace(/^Backtrack Target:$/m, 'Backtrack Target: Ready')
      .replace(/^Challenge Summary:$/m, 'Challenge Summary: verdict exists but evidence is incomplete')
      .replace(/^Challenge Executed By:$/m, 'Challenge Executed By: subagent:challenge-fixture')
      .replace(/^Challenge Evidence:$/m, 'Challenge Evidence: PASS - missing timestamp');
    fs.writeFileSync(specFile, content, 'utf-8');

    var resume = run('resume ' + demo);
    assert.ok(resume.indexOf('PHASE_HINT: challenge') !== -1, resume);
    var next = run('next ' + demo);
    assert.ok(next.indexOf('BACKTRACK_TARGET: Challenge') !== -1, next);
    assert.ok(next.indexOf('NEXT_ACTION: run_challenge') !== -1, next);
    assert.ok(next.indexOf('--record-result') !== -1, next);
    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Challenge Executed At is empty') !== -1, blocked);
    assert.ok(blocked.indexOf('--record-result') !== -1, blocked);
  });

  it('blocked completion verification does not route to challenge yet', function() {
    var demo = path.join(tmpBase, 'd2-blocked-completion-no-challenge');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-route --spec-version v1.0 --requirement x --mode standard');
    makeStandardBlockedCompletionVerification(demo, path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-route.md'));

    var resume = run('resume ' + demo);
    assert.ok(resume.indexOf('PHASE_HINT: execute') !== -1, resume);
    var next = run('next ' + demo);
    assert.ok(next.indexOf('NEXT_ACTION: run_challenge') === -1, next);
  });

  it('validate does not request challenge before completion verification is done', function() {
    var demo = path.join(tmpBase, 'd2-validate-blocked-completion-no-challenge');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-route --spec-version v1.0 --requirement x --mode standard');
    makeStandardBlockedCompletionVerification(demo, path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-route.md'));

    var out = run('validate ' + demo + ' --archive-ready');
    assert.ok(out.indexOf('Challenge has not been executed') === -1, out);
    assert.ok(out.indexOf('Execute Log completion-verification is not DONE') !== -1, out);
  });

  it('completion verification status uses the latest appended completion block', function() {
    var demo = path.join(tmpBase, 'd2-latest-completion-status');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-route --spec-version v1.0 --requirement x --mode standard');
    makeStandardBlockedThenDoneCompletionVerification(demo, path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-route.md'));

    var resume = run('resume ' + demo);
    assert.ok(resume.indexOf('PHASE_HINT: challenge') !== -1, resume);
    var next = run('next ' + demo);
    assert.ok(next.indexOf('NEXT_ACTION: run_challenge') !== -1, next);
  });

  it('next shows context-source when present', function() {
    var demo = path.join(tmpBase, 'd2f');
    run('init ' + demo + ' --mode standard');
    var ctxDir = path.join(demo, 'mydocs', 'context', 'next-task');
    fs.mkdirSync(ctxDir, { recursive: true });
    run('discover ' + demo + ' --task-name next-task --spec-version v1.0 --requirement x --mode standard');
    var out = run('next ' + demo);
    assert.ok(out.indexOf('CONTEXT_SOURCE: mydocs/context/next-task') !== -1, 'next should show context-source');
  });

  it('resume and status work', function() {
    var demo = path.join(tmpBase, 'd3');
    run('init ' + demo + ' --mode standard');
    assert.ok(run('resume ' + demo).indexOf('PHASE_HINT: new_task') !== -1);
    assert.ok(run('status ' + demo).indexOf('Structure:    OK') !== -1);
  });

  it('status warns when agent plan approval is missing gate evidence', function() {
    var demo = path.join(tmpBase, 'd3-plan-gate-warn');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name incomplete-plan --spec-version v1.0 --requirement x --mode standard');
    var specFile = path.join(demo, 'mydocs', 'specs', 'v1.0-incomplete-plan.md');
    var content = fs.readFileSync(specFile, 'utf-8');
    content = fillConfirmedReq(content)
      .replace(/^Research Reviewed By:$/m, 'Research Reviewed By: subagent:research-fixture')
      .replace(/^Research Reviewed At:$/m, 'Research Reviewed At: 2026-01-01T00:00:00Z')
      .replace(/^Plan Approved By:$/m, 'Plan Approved By: agent:codex');
    fs.writeFileSync(specFile, content, 'utf-8');

    var out = run('status ' + demo);
    assert.ok(out.indexOf('Plan:         WARN') !== -1, out);
    assert.ok(out.indexOf('v1.0-incomplete-plan.md') !== -1, out);
  });

  it('archive and reopen flow moves referenced artifacts', function() {
    var demo = path.join(tmpBase, 'd4');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name arch --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-arch.md');
    var artifacts = makeStandardArchiveReady(demo, sf);
    var out = run('archive ' + demo + ' arch --authorized-by human:fixture --authorization-evidence "user approved this archive"');
    assert.ok(out.indexOf('[ARCHIVE]') !== -1 || out.indexOf('[MOVED]') !== -1);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'archive', 'v1.0-arch.md')));
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'archive', 'v1.0-arch.design.md')));
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'archive', 'v1.0-arch.execute.md')));
    assert.ok(!fs.existsSync(artifacts.designFile));
    assert.ok(!fs.existsSync(artifacts.logFile));
    var archivedSpec = fs.readFileSync(path.join(demo, 'mydocs', 'archive', 'v1.0-arch.md'), 'utf-8');
    assert.ok(archivedSpec.indexOf('design-file: "mydocs/archive/v1.0-arch.design.md"') !== -1);
    assert.ok(archivedSpec.indexOf('execute-log-file: "mydocs/archive/v1.0-arch.execute.md"') !== -1);
    var out2 = run('reopen ' + demo + ' arch --defect bug --mode micro');
    assert.ok(out2.indexOf('[CREATE]') !== -1);
    var patchSpec = path.join(demo, 'mydocs', 'specs', 'v1.0-arch.md');
    assert.ok(fs.existsSync(patchSpec));
    assert.ok(fs.existsSync(artifactPath(demo, patchSpec, 'execute-log-file')));
  });

  it('archive authorization failures are fail-closed before any filesystem write', function() {
    [
      { name: 'missing', args: [] },
      { name: 'partial', args: ['--authorized-by', 'human:fixture'] },
      { name: 'agent', args: ['--authorized-by', 'agent:codex', '--authorization-evidence', 'claimed approval'] },
      { name: 'empty', args: ['--authorized-by', 'human:fixture', '--authorization-evidence', '   '] },
      { name: 'multiline', args: ['--authorized-by', 'human:fixture', '--authorization-evidence', 'line one\nline two'] },
      { name: 'force', args: ['--force'] }
    ].forEach(function(scenario) {
      var demo = path.join(tmpBase, 'd4-auth-' + scenario.name);
      run('init ' + demo + ' --mode standard');
      run('discover ' + demo + ' --task-name auth-' + scenario.name + ' --spec-version v1.0 --requirement x --mode standard');
      var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-auth-' + scenario.name + '.md');
      makeStandardArchiveReady(demo, sf);
      var before = snapshotTree(demo);

      var result = runArgs(['archive', demo, 'auth-' + scenario.name].concat(scenario.args), demo);

      assert.equal(result.status, 2, scenario.name + ': ' + result.output);
      assert.match(result.output, /SDD_ARCHIVE_AUTHORIZATION_(REQUIRED|INVALID)/, scenario.name);
      assert.deepStrictEqual(snapshotTree(demo), before, scenario.name + ' must not write any file or directory');
    });
  });

  it('archive records one-shot human authorization in the archived Spec', function() {
    var demo = path.join(tmpBase, 'd4-auth-success');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name auth-success --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-auth-success.md');
    makeStandardArchiveReady(demo, sf);
    assert.doesNotMatch(fs.readFileSync(sf, 'utf-8'), /Archive Authorized By:/);

    var result = runArgs(['archive', demo, 'auth-success'].concat(archiveAuthorizationArgs()), demo);

    assert.equal(result.status, 0, result.output);
    var archived = fs.readFileSync(path.join(demo, 'mydocs', 'archive', 'v1.0-auth-success.md'), 'utf-8');
    assert.match(archived, /^## Archive Authorization$/m);
    assert.match(archived, /^Archive Authorized By: human:fixture$/m);
    assert.match(archived, /^Archive Authorized At: \d{4}-\d{2}-\d{2}T/m);
    assert.match(archived, /^Archive Authorization Evidence: user approved this archive$/m);
  });

  it('archive completion failure with valid authorization does not create archive output', function() {
    var demo = path.join(tmpBase, 'd4-auth-not-ready');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name auth-not-ready --spec-version v1.0 --requirement x --mode standard');
    var archiveDir = path.join(demo, 'mydocs', 'archive');
    fs.rmSync(archiveDir, { recursive: true, force: true });
    var before = snapshotTree(demo);

    var result = runArgs(['archive', demo, 'auth-not-ready'].concat(archiveAuthorizationArgs()), demo);

    assert.notEqual(result.status, 0, result.output);
    assert.match(result.output, /Spec is not archive-ready/);
    assert.deepStrictEqual(snapshotTree(demo), before);
  });

  it('completed command routing stops to request archive authorization', function() {
    var demo = path.join(tmpBase, 'd4-auth-routing');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name auth-routing --spec-version v1.0 --requirement x --mode standard');
    makeStandardArchiveReady(demo, path.join(demo, 'mydocs', 'specs', 'v1.0-auth-routing.md'));

    var next = run('next ' + demo);
    var resume = run('resume ' + demo);
    var cruise = run('cruise ' + demo + ' --record-run --iteration 1');

    assert.match(next, /NEXT_ACTION: request_archive_authorization/);
    assert.doesNotMatch(next, /archive_ready/);
    assert.match(resume, /PHASE_HINT: await_archive_authorization/);
    assert.match(resume, /AUTONOMY_MODE: supervised/);
    assert.match(resume, /AUTHORIZATION_STATE: active/);
    assert.match(resume, /AUTHORIZED_ACTORS: main,worker,research-reviewer,challenge-reviewer/);
    assert.match(resume, /AUTHORIZED_SCOPE_DIGEST: sha256:/);
    assert.match(resume, /AUTHORIZED_RISK_SNAPSHOT: sha256:/);
    assert.match(resume, /ACTIVE_PLAN_DIGEST: sha256:/);
    assert.match(resume, /STOP_REASON: archive_authorization/);
    assert.doesNotMatch(resume, /PHASE_HINT: archive(?:\r?\n|$)/);
    assert.match(cruise, /NEXT_ACTION: request_archive_authorization/);
    assert.match(cruise, /REUSE_NATIVE_LOOP: no/);
    assert.match(cruise, /STOP_REASON: archive_authorization/);
    assert.match(cruise, /\[RUN_LEDGER_STOP\] archive_authorization/);
  });

  it('cruise budget exhaustion disables the actual native loop', function() {
    var demo = path.join(tmpBase, 'd4-budget-stop');
    run('init ' + demo + ' --mode micro --autonomy-mode auto');
    run('discover ' + demo + ' --task-name budget-stop --spec-version v1.0 --requirement x --mode micro');
    var specFile = path.join(demo, 'mydocs', 'specs', 'v1.0-budget-stop.md');
    var scope = autonomyState.scopeSnapshot(fs.readFileSync(specFile, 'utf-8'));
    var auth = runArgs(['autonomy', 'authorize', demo, '--spec', specFile, '--expected-scope-digest', scope,
      '--authorized-by', 'human:fixture', '--authorization-evidence', 'fixture task authorization'], demo);
    assert.equal(auth.status, 0, auth.output);
    var cruise = run('cruise ' + demo + ' --driver auto --iteration 5 --record-run');
    assert.match(cruise, /STOP_REASON: budget_exhausted/);
    assert.match(cruise, /REUSE_NATIVE_LOOP: no/);
    assert.match(cruise, /\[RUN_LEDGER_STOP\] budget_exhausted/);
  });

  it('archive index records Challenge Verdict for new specs', function() {
    var demo = path.join(tmpBase, 'd4-challenge-verdict-index');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name arch-verdict --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-arch-verdict.md');
    makeStandardArchiveReady(demo, sf);
    var content = fs.readFileSync(sf, 'utf-8')
      .replace(/^Challenge Verdict:.*$/m, 'Challenge Verdict: PASS');
    fs.writeFileSync(sf, content, 'utf-8');

    var out = run('archive ' + demo + ' arch-verdict --authorized-by human:fixture --authorization-evidence "user approved this archive"');
    assert.ok(out.indexOf('[ARCHIVE]') !== -1 || out.indexOf('[MOVED]') !== -1, out);
    var index = fs.readFileSync(path.join(demo, 'mydocs', 'archive', 'index.md'), 'utf-8');
    assert.ok(index.indexOf('| v1.0-arch-verdict.md |') !== -1, index);
    assert.ok(index.indexOf('| PASS |') !== -1, index);
  });

  it('archive requires and moves learning records when execution produced reusable lessons', function() {
    var demo = path.join(tmpBase, 'd4l');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name lessoned --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-lessoned.md');
    var artifacts = makeStandardArchiveReady(demo, sf);
    var logContent = fs.readFileSync(artifacts.logFile, 'utf-8')
      .replace('Step: completion-verification', [
        'Step: 1 - implementation deviation',
        'Status: DEVIATED_MINOR',
        'Result: implementation deviated from the approved plan boundary.',
        'Deviation: implementation approach changed within the same archive fixture.',
        'Timestamp: 2025-12-31T23:59:00Z',
        '',
        '---',
        '',
        'Step: completion-verification'
      ].join('\n'));
    fs.writeFileSync(artifacts.logFile, logContent, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Learning Record is required') !== -1);
    var specIndex = require('../src/core/spec-index');
    specIndex.clearCache();
    var indexed = specIndex.listSpecs(demo);
    assert.equal(indexed.specs[0].phase, 'learning');
    assert.equal(indexed.counts.learning, 1);

    var created = run('new-learning ' + demo + ' lessoned');
    assert.ok(created.indexOf('[LEARNING]') !== -1);
    var learningFile = artifactPath(demo, sf, 'learning-file');
    assert.ok(fs.existsSync(learningFile));
    var learningText = fs.readFileSync(learningFile, 'utf-8');
    assert.ok(learningText.indexOf('## Learning Record') !== -1);
    assert.ok(learningText.indexOf('Source Spec:') !== -1);

    var stillBlocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(stillBlocked.indexOf('Learning Record is empty') !== -1);

    insertSectionContent(learningFile, 'Learning Record', 'Source Spec: mydocs/specs/v1.0-lessoned.md\nTrigger: DEVIATED_MINOR in Execute Log\nObserved Problem: implementation deviated from the approved plan boundary.\nRoot Cause: plan step did not capture the lower-level file boundary.\nDecision Rule: when a step changes implementation approach, record the reusable boundary rule before archive.\nApplies When: future work touches the same boundary.\nDoes Not Apply When: the deviation is only wording or comments.\nRecommended Action: tighten Plan steps with explicit file boundaries.\nEvidence: tests/commands.test.js covers the learning archive gate.\nRelated Artifacts: mydocs/logs/v1.0-lessoned.execute.md');
    var ok = run('validate ' + demo + ' --archive-ready');
    assert.ok(ok.indexOf('RESULT: OK') !== -1);

    var archived = run('archive ' + demo + ' lessoned --authorized-by human:fixture --authorization-evidence "user approved this archive"');
    assert.ok(archived.indexOf('[LEARNING]') !== -1);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'archive', 'v1.0-lessoned.learning.md')));
    var archivedSpec = fs.readFileSync(path.join(demo, 'mydocs', 'archive', 'v1.0-lessoned.md'), 'utf-8');
    assert.ok(archivedSpec.indexOf('learning-file: "mydocs/archive/v1.0-lessoned.learning.md"') !== -1);
  });

  it('validate blocks archive when required gates are missing', function() {
    var demo = path.join(tmpBase, 'd4b');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name blocked --spec-version v1.0 --requirement x --mode standard');
    var out = run('archive ' + demo + ' blocked --authorized-by human:fixture --authorization-evidence "user approved this archive"');
    assert.ok(out.indexOf('Spec is not archive-ready') !== -1);
    assert.ok(out.indexOf('Plan Approved By is empty') !== -1);
    assert.ok(out.indexOf('Technical Design is empty') !== -1);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'specs', 'v1.0-blocked.md')));
  });

  it('validate enforces standard technical design contract fields', function() {
    var demo = path.join(tmpBase, 'd4s');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name strict-design --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-strict-design.md');
    var artifacts = makeStandardArchiveReady(demo, sf);
    fs.writeFileSync(artifacts.designFile, [
      '# Technical Design',
      '',
      '## Technical Design',
      '',
      'Selected Option / ADR: 选择方案 A。',
      'Requirement Traceability: AC-001 覆盖归档门禁。',
      'Test Strategy: node:test command suite.'
    ].join('\n'), 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Technical Design missing required fields') !== -1);
    assert.ok(blocked.indexOf('Impact Scope') !== -1);
    assert.ok(blocked.indexOf('Data Model / Schema') !== -1);
    assert.ok(blocked.indexOf('Interface Contract') !== -1);
    assert.ok(blocked.indexOf('Compatibility / Rollback') !== -1);
  });

  it('validate rejects legacy auto-gate plan approval', function() {
    var demo = path.join(tmpBase, 'd4g');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name auto-gate --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-auto-gate.md');
    makeStandardArchiveReady(demo, sf);
    var content = fs.readFileSync(sf, 'utf-8')
      .replace(/^Plan Approved By:.*$/m, 'Plan Approved By: auto-gate')
      .replace(/^Gate Evidence:.*$/m, 'Gate Evidence: legacy auto gate evidence should not pass');
    fs.writeFileSync(sf, content, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Plan Approved By must be agent:<id> or human:<name>') !== -1, blocked);
  });

  it('validate blocks archive when adversarial challenge failed', function() {
    var demo = path.join(tmpBase, 'd4h');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-fail --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-fail.md');
    makeStandardArchiveReady(demo, sf);
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^Challenge Verdict:.*$/m, 'Challenge Verdict: FAIL_DESIGN')
         .replace(/^Challenge Summary:.*$/m, 'Challenge Summary: design contract missed interface impact.');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Adversarial Challenge failed: FAIL_DESIGN') !== -1);
  });

  it('validate requires challenge evidence fields for archive (AC-001)', function() {
    var demo = path.join(tmpBase, 'd4i');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-evidence --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-evidence.md');
    makeStandardArchiveReady(demo, sf);
    // Remove challenge evidence to test that validate catches the missing fields
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^Challenge Executed By:.*$/m, 'Challenge Executed By:');
    c = c.replace(/^Challenge Executed At:.*$/m, 'Challenge Executed At:');
    c = c.replace(/^Challenge Evidence:.*$/m, 'Challenge Evidence:');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Challenge Executed By is empty') !== -1, 'missing Executed By');
  });

  it('validate requires Challenge Executed At when Executed By is present', function() {
    var demo = path.join(tmpBase, 'd4i2');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-at --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-at.md');
    makeStandardArchiveReady(demo, sf);
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^Challenge Executed At:.*$/m, 'Challenge Executed At:');
    c = c.replace(/^Challenge Evidence:.*$/m, 'Challenge Evidence:');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Challenge Executed At is empty') !== -1, 'missing Executed At');
  });

  it('validate requires Challenge Evidence when Executed By and At are present', function() {
    var demo = path.join(tmpBase, 'd4i3');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-ev --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-ev.md');
    makeStandardArchiveReady(demo, sf);
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/Challenge Evidence:.*\n/, 'Challenge Evidence:\n');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Challenge Evidence is required') !== -1, 'missing Evidence');
  });

  it('validate rejects inline challenge for lite mode (AC-004 lite)', function() {
    var demo = path.join(tmpBase, 'd4l2');
    run('init ' + demo + ' --mode lite');
    run('discover ' + demo + ' --task-name challenge-inline-lite --spec-version v1.0 --requirement x --mode lite');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-inline-lite.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^(### Confirmed Requirement\n)/m, '$1Lite task confirmed.\n');
    c = replaceSectionStart(c, 'Innovate Options', 'Innovate: Skipped, Reason: simple change.');
    c = replaceSectionStart(c, 'Acceptance Criteria', '### AC-001: lite task\nRequirement: lite\nType: functional\nVerification: unit\nAutomated: yes\nTest: tests/commands.test.js');
    c = fillApproval(c);
    c = fillChallenge(c, 'PASS', { executedBy: 'inline' });
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Design Note', 'Approach: test.\nImpact Scope: minimal.\nInterface / Data Impact: none.\nCompatibility: ok.\nRisks: none.\nTest Strategy: unit.');
    insertSectionContent(logFile, 'Execute Log', completionVerificationLog());

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Challenge requires independent reviewer evidence') !== -1);
  });

  it('validate passes when challenge evidence is complete (AC-002)', function() {
    var demo = path.join(tmpBase, 'd4j');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-ok --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-ok.md');
    makeStandardArchiveReady(demo, sf);

    var result = run('validate ' + demo + ' --archive-ready');
    assert.ok(result.indexOf('Challenge Executed By') === -1, 'no challenge evidence issues');
  });

  it('validate accepts agent plan approval with evidence in auto mode', function() {
    var demo = path.join(tmpBase, 'approval-agent-default');
    run('init ' + demo + ' --mode standard --autonomy-mode auto');
    run('discover ' + demo + ' --task-name approval-agent --spec-version v1.0 --requirement x --mode standard --autonomy-mode auto');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-approval-agent.md');
    makeStandardArchiveReady(demo, sf);
    var c = fs.readFileSync(sf, 'utf-8')
      .replace(/^Plan Approved By:.*$/m, 'Plan Approved By: agent:codex')
      .replace(/^Gate Evidence:.*$/m, 'Gate Evidence: tests passed');
    fs.writeFileSync(sf, c, 'utf-8');

    var result = run('validate ' + demo + ' --archive-ready');
    assert.ok(result.indexOf('Plan Approved By') === -1, 'agent approval should pass with evidence: ' + result);
  });

  it('validate rejects agent plan approval in human mode', function() {
    var demo = path.join(tmpBase, 'approval-human-policy');
    run('init ' + demo + ' --mode standard --autonomy-mode human');
    run('discover ' + demo + ' --task-name approval-human --spec-version v1.0 --requirement x --mode standard --autonomy-mode human');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-approval-human.md');
    makeStandardArchiveReady(demo, sf);
    var c = fs.readFileSync(sf, 'utf-8')
      .replace(/^Plan Approved By:.*$/m, 'Plan Approved By: agent:codex')
      .replace(/^Gate Evidence:.*$/m, 'Gate Evidence: tests passed');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Supervised and human autonomy modes require Plan Approved By: human:<name>') !== -1, blocked);
  });

  it('validate rejects agent fixture approval in supervised mode', function() {
    var demo = path.join(tmpBase, 'approval-human-bare');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name approval-human-bare --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-approval-human-bare.md');
    makeStandardArchiveReady(demo, sf);

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Supervised and human autonomy modes require Plan Approved By: human:<name>') === -1, blocked);
  });

  it('validate accepts auditable independent reviewers for standard challenge', function() {
    var demo = path.join(tmpBase, 'challenge-external-reviewer');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-external --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-external.md');
    makeStandardArchiveReady(demo, sf);
    var c = fs.readFileSync(sf, 'utf-8')
      .replace(/^Challenge Executed By:.*$/m, 'Challenge Executed By: external-agent:reviewer-1');
    fs.writeFileSync(sf, c, 'utf-8');

    var result = run('validate ' + demo + ' --archive-ready');
    assert.ok(result.indexOf('independent reviewer') === -1, 'external reviewer should pass: ' + result);
  });

  it('validate rejects ambiguous independent reviewers for standard challenge and research gate', function() {
    var demo = path.join(tmpBase, 'reviewer-evidence-invalid');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name reviewer-invalid --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-reviewer-invalid.md');
    makeStandardArchiveReady(demo, sf);
    var c = fs.readFileSync(sf, 'utf-8')
      .replace(/^Research Reviewed By:.*$/m, 'Research Reviewed By: auto-gate')
      .replace(/^Challenge Executed By:.*$/m, 'Challenge Executed By: reviewer');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Research Gate requires independent reviewer evidence') !== -1, blocked);
    assert.ok(blocked.indexOf('Challenge requires independent reviewer evidence') !== -1, blocked);
  });

  it('validate and next surface reviewer guidance when research reviewer is missing', function() {
    var demo = path.join(tmpBase, 'research-reviewer-missing-guidance');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name research-missing --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-research-missing.md');
    var c = fs.readFileSync(sf, 'utf-8');
    c = fillConfirmedReq(c)
      .replace(/^Research Reviewed By:.*$/m, 'Research Reviewed By:')
      .replace(/^Research Reviewed At:.*$/m, 'Research Reviewed At: 2026-01-01T00:00:00Z');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Research Reviewed By is empty') !== -1, blocked);
    assert.ok(blocked.indexOf('Auditable reviewer types: subagent:<id>, external-agent:<id>, human:<name>') !== -1, blocked);
    assert.ok(blocked.indexOf('explicit current-user authorization') !== -1, blocked);
    assert.ok(blocked.indexOf('Do not skip the gate or fabricate reviewer evidence') !== -1, blocked);

    var next = run('next ' + demo);
    assert.ok(next.indexOf('REVIEWER_GUIDANCE:') !== -1, next);
    assert.ok(next.indexOf('explicit current-user authorization') !== -1, next);
  });

  it('validate rejects legacy auto-gate challenge evidence (AC-003)', function() {
    var demo = path.join(tmpBase, 'd4k');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-auto-gate --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-auto-gate.md');
    makeStandardArchiveReady(demo, sf);
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^Challenge Executed By:.*$/m, 'Challenge Executed By: auto-gate');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Challenge requires independent reviewer evidence') !== -1, blocked);
  });

  it('validate rejects inline challenge for standard/lite modes (AC-004)', function() {
    var demo = path.join(tmpBase, 'd4l');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-inline-std --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-inline-std.md');
    makeStandardArchiveReady(demo, sf);
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^Challenge Executed By:.*$/m, 'Challenge Executed By: inline');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Challenge requires independent reviewer evidence') !== -1);
  });

  it('validate allows inline challenge for micro mode (AC-005)', function() {
    var demo = path.join(tmpBase, 'd4m');
    run('init ' + demo + ' --mode micro');
    run('discover ' + demo + ' --task-name challenge-inline-micro --spec-version v1.0 --requirement x --mode micro');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-inline-micro.md');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/## Plan/, '## Plan\n\nImpact Scope: single file\nData Impact: none\nInterface Impact: none\nAcceptance: behavior preserved\nVerification: unit test\n\nPlan Approved By: agent:codex\nApproved At: 2026-06-30T00:00:00Z\nGate Evidence: micro plan complete');
    c = fillChallenge(c, 'PASS', { executedBy: 'inline', evidence: 'PASS - inline review for micro' });
    fs.writeFileSync(sf, c);
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    fs.writeFileSync(logFile, completionVerificationLog(), 'utf-8');

    var result = run('validate ' + demo + ' --archive-ready');
    assert.ok(result.indexOf('Challenge Executed By') === -1 || result.indexOf('inline') === -1, 'micro allows inline');
  });

  it('validate blocks archive when Challenge Executed At is before Execute Log step', function() {
    var demo = path.join(tmpBase, 'd4t');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name time-order --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-time-order.md');
    makeStandardArchiveReady(demo, sf);
    // Set Challenge time before Execute Log step time
    var c = fs.readFileSync(sf, 'utf-8')
      .replace(/^Challenge Executed At:.*$/m, 'Challenge Executed At: 2025-12-31T23:59:59Z');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Challenge Executed At must be after the last Execute Log step timestamp') !== -1);
  });

  it('validate rejects legacy auto-gate Research review', function() {
    var demo = path.join(tmpBase, 'd4rg');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name rg-evidence --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-rg-evidence.md');
    var c = fs.readFileSync(sf, 'utf-8');
    c = fillConfirmedReq(c);
    c = c
      .replace(/^Research Reviewed By:$/m, 'Research Reviewed By: auto-gate')
      .replace(/^Research Reviewed At:$/m, 'Research Reviewed At: 2026-01-01T00:00:00Z');
    fs.writeFileSync(sf, c, 'utf-8');
    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Research Gate requires independent reviewer evidence') !== -1, blocked);
  });

  it('validate warns but does not block on missing CR fields when not archive-ready', function() {
    var demo = path.join(tmpBase, 'd4crw');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name cr-warn --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-cr-warn.md');
    var c = fs.readFileSync(sf, 'utf-8');
    // Fill only Scope Boundary, leave other CR fields empty
    c = c.replace(/^Scope Boundary:$/m, 'Scope Boundary: single module');
    fs.writeFileSync(sf, c, 'utf-8');
    // Non archive-ready: CR missing fields should produce WARNING, not hard failure
    var validate = require('../src/commands/validate');
    var result = validate.validateSpec(sf, { archiveReady: false, projectDir: demo });
    var crIssues = result.issues.filter(function(i) { return i.indexOf('Confirmed Requirement') !== -1; });
    // Should have WARNING (not hard error) for missing CR fields
    assert.ok(crIssues.some(function(i) { return i.indexOf('WARNING') !== -1; }), 'expected WARNING for missing CR fields: ' + crIssues.join('; '));
  });

  it('validate enforces lite design note and acceptance criteria', function() {
    var demo = path.join(tmpBase, 'd4c');
    run('init ' + demo + ' --mode lite');
    run('discover ' + demo + ' --task-name lite-task --spec-version v1.0 --requirement x --mode lite');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-lite-task.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = replaceSectionStart(c, 'Confirmed Requirement', 'Lite task must enforce design and acceptance before archive.');
    c = replaceSectionStart(c, 'Innovate Options', 'Innovate: Skipped, Reason: 复用现有 validate/archive pattern.');
    c = fillApproval(c);
    c = fillChallenge(c, 'PASS');
    fs.writeFileSync(sf, c, 'utf-8');

    c = replaceSectionStart(fs.readFileSync(sf, 'utf-8'), 'Acceptance Criteria', '### AC-001: validate archive-ready gates\nRequirement: lite validation\nType: functional\nVerification: unit\nAutomated: yes\nTest: tests/commands.test.js\n\nScenario: Lite archive readiness\n  Given lite design, acceptance, approval, execute log, and PASS review are present\n  When validate --archive-ready runs\n  Then validation reports OK');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Design Note', 'Approach: 复用 standard validate path.\nImpact Scope: CLI validation only.\nInterface / Data Impact: 不改变外部接口和持久化数据。\nCompatibility: no format break.\nRisks: missing AC would block archive.\nTest Strategy: node test validates this behavior.');
    insertSectionContent(logFile, 'Execute Log', completionVerificationLog());
    var ok = run('validate ' + demo + ' --archive-ready');
    assert.ok(ok.indexOf('RESULT: OK') !== -1);
  });

  it('validate requires acceptance verification metadata', function() {
    var demo = path.join(tmpBase, 'd4v');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-verification --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-ac-verification.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^(### Confirmed Requirement\n)/m, '$1Standard AC must declare verification metadata.\n');
    c = replaceSectionStart(c, 'Innovate Options', 'Option A: require verification metadata. Pros: traceable. Cons: more structure.\nOption B: free text AC. Pros: flexible. Cons: weaker archive gates.\nSelected: Option A.');
    c = replaceSectionStart(c, 'Acceptance Criteria', '### AC-001: missing verification is blocked\nRequirement: ac-verification\nType: functional\nAutomated: yes\nTest: tests/commands.test.js\n\nScenario: Missing verification\n  Given an AC without Verification metadata\n  When validate runs\n  Then archive readiness is blocked');
    c = fillApproval(c);
    c = fillChallenge(c, 'PASS');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', standardDesignContent());
    insertSectionContent(logFile, 'Execute Log', completionVerificationLog());

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Standard Acceptance Criteria missing Verification for: AC-001') !== -1);

    c = fs.readFileSync(sf, 'utf-8')
      .replace('Automated: yes\nTest: tests/commands.test.js\n', 'Verification: e2e\nAutomated: yes\n');
    fs.writeFileSync(sf, c, 'utf-8');
    var e2eBlocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(e2eBlocked.indexOf('Standard E2E Acceptance Criteria require Test or Manual Evidence for: AC-001') !== -1);

    c = fs.readFileSync(sf, 'utf-8')
      .replace('Verification: e2e', 'Verification: unit');
    fs.writeFileSync(sf, c, 'utf-8');
    var automatedBlocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(automatedBlocked.indexOf('Standard Automated Acceptance Criteria require Test for: AC-001') !== -1);
  });

  it('validate reports missing Provider for an active e2e AC even when Test is present', function() {
    var demo = path.join(tmpBase, 'd4-provider-active');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name provider-active --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-provider-active.md');
    var content = replaceSectionStart(fs.readFileSync(sf, 'utf-8'), 'Acceptance Criteria', '### AC-001: active e2e verification\nRequirement: provider-active\nType: functional\nVerification:  E2E  \nAutomated: yes\nTest: tests/e2e/provider-active.spec.js');
    fs.writeFileSync(sf, content, 'utf-8');

    var result = require('../src/commands/validate').validateSpec(sf, { projectDir: demo });
    assert.ok(result.issues.indexOf('E2E Acceptance Criteria require Provider for: AC-001.') !== -1, result.issues.join('\n'));
  });

  it('generated artifacts keep English labels and request Chinese content', function() {
    var demo = path.join(tmpBase, 'd4e');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name english-labels --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-english-labels.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var specText = fs.readFileSync(sf, 'utf-8');
    var designText = fs.readFileSync(designFile, 'utf-8');
    var logText = fs.readFileSync(logFile, 'utf-8');
    assert.ok(specText.indexOf('## Acceptance Criteria') !== -1);
    assert.ok(specText.indexOf('Plan Approved By:') !== -1);
    assert.strictEqual(specText.indexOf('Gate Policy:'), -1);
    assert.ok(designText.indexOf('Selected Option / ADR:') !== -1);
    assert.ok(logText.indexOf('Status: DONE') !== -1);
    assert.ok(specText.indexOf('write') !== -1 || specText.indexOf('Chinese') !== -1);
  });

  it('validate enforces micro plan acceptance and verification labels', function() {
    var demo = path.join(tmpBase, 'd4d');
    run('init ' + demo + ' --mode micro');
    run('discover ' + demo + ' --task-name micro-task --spec-version v1.0 --requirement x --mode micro');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-micro-task.md');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = fillApproval(c);
    c = fillChallenge(c, 'PASS', { executedBy: 'inline' });
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Micro Plan must include Impact Scope') !== -1);
    assert.ok(blocked.indexOf('Micro Plan must include Data Impact') !== -1);
    assert.ok(blocked.indexOf('Micro Plan must include Interface Impact') !== -1);
    assert.ok(blocked.indexOf('Micro Plan must include Acceptance') !== -1);
    assert.ok(blocked.indexOf('Micro Plan must include Verification') !== -1);
    assert.ok(blocked.indexOf('Execute Log is empty') !== -1);

    c = fs.readFileSync(sf, 'utf-8')
      .replace(/^Approved At: 2026-01-01T00:00:00Z$/m, 'Approved At: 2026-01-01T00:00:00Z\n\nScope: single-file test fixture\nTouched Files: none\nChange: validate micro gates\nImpact Scope: micro validation only\nData Impact: none\nInterface Impact: none\nAcceptance: validate reports OK\nVerification: node --test tests/*.test.js\nBlast Radius: micro only');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(logFile, 'Execute Log', completionVerificationLog());
    var ok = run('validate ' + demo + ' --archive-ready');
    assert.ok(ok.indexOf('RESULT: OK') !== -1);
  });

  it('uses Node CLI only and ships no shell entrypoints', function() {
    var shellFiles = fs.readdirSync(path.resolve('bin')).filter(function(file) {
      return file.endsWith('.sh');
    });
    assert.deepStrictEqual(shellFiles, []);
  });

  it('install-skill copies bundled skill entries and can clean stale files', function() {
    var installer = require('../src/commands/install-skill')._private;
    var targetRoot = path.join(tmpBase, 'skill-targets');
    var targets = installer.resolveTargets('codex', targetRoot);
    var ccSwitchTargets = installer.resolveTargets('cc-switch', targetRoot);
    var allTargets = installer.resolveTargets('all', targetRoot);
    var stale = path.join(targets[0].dir, 'stale.txt');
    fs.mkdirSync(targets[0].dir, { recursive: true });
    fs.writeFileSync(stale, 'old', 'utf-8');

    assert.equal(ccSwitchTargets[0].name, 'cc-switch');
    assert.equal(ccSwitchTargets[0].dir, path.join(targetRoot, '.cc-switch', 'skills', 'sdd-riper'));
    assert.ok(allTargets.some(function(item) { return item.name === 'cc-switch'; }));

    var result = installer.installOne(targets[0], { clean: true });
    assert.equal(result.target, 'codex');
    assert.ok(result.copied > 0);
    assert.ok(fs.existsSync(path.join(targets[0].dir, 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(targets[0].dir, 'templates')));
    assert.ok(fs.existsSync(path.join(targets[0].dir, 'protocols')));
    assert.ok(fs.existsSync(path.join(targets[0].dir, 'src')));
    assert.ok(fs.existsSync(path.join(targets[0].dir, 'node_modules', 'commander')), 'commander dependency must be copied for agent environments');
    assert.ok(!fs.existsSync(stale));
  });

  it('install-skill detects same-version content drift without modifying the target', function() {
    var installer = require('../src/commands/install-skill')._private;
    assert.equal(typeof installer.checkOne, 'function', 'installer must expose a read-only integrity check');
    var targetRoot = path.join(tmpBase, 'skill-integrity-target');
    var target = installer.resolveTargets('codex', targetRoot)[0];
    installer.installOne(target, { clean: true });
    var skillFile = path.join(target.dir, 'SKILL.md');
    fs.appendFileSync(skillFile, '\nGATE_POLICY="auto"\n', 'utf-8');
    var before = fs.readFileSync(skillFile, 'utf-8');

    var drift = installer.checkOne(target);
    assert.equal(drift.ok, false);
    assert.equal(drift.reason, 'content-drift');
    assert.notEqual(drift.sourceFingerprint, drift.targetFingerprint);
    assert.equal(fs.readFileSync(skillFile, 'utf-8'), before, 'check must be read-only');

    installer.installOne(target, { clean: true });
    var aligned = installer.checkOne(target);
    assert.equal(aligned.ok, true);
    assert.equal(aligned.sourceFingerprint, aligned.targetFingerprint);
  });

  it('sdd codemap outputs on-demand architecture view', function() {
    var demo = path.join(tmpBase, 'd5');
    run('init ' + demo + ' --mode standard');
    var srcDir = path.join(demo, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'app.js'), 'var mod = require("./mod");\nmodule.exports = { run: run };\nfunction run() {}\n', 'utf-8');
    fs.writeFileSync(path.join(srcDir, 'mod.js'), 'module.exports = { hello: hello };\nfunction hello() {}\n', 'utf-8');
    fs.writeFileSync(path.join(demo, 'package.json'), '{"name":"codemap-test","dependencies":{"express":"^4.0.0"}}\n', 'utf-8');
    var out = run('codemap ' + demo);
    assert.ok(out.indexOf('codemap-test') !== -1, 'should contain project name: ' + out);
    assert.ok(out.indexOf('express') !== -1, 'should list external dep: ' + out);
    assert.ok(out.indexOf('src/') !== -1, 'should list source files: ' + out);
    assert.ok(out.indexOf('Auto-generated') !== -1, 'should mention auto-generated: ' + out);
    // Verify no codemap file is persisted
    assert.ok(!fs.existsSync(path.join(demo, 'mydocs', 'codemap')), 'codemap directory should not exist');
  });

  it('init no longer creates codemap directory or projectmap', function() {
    var demo = path.join(tmpBase, 'd5b');
    fs.mkdirSync(demo, { recursive: true });
    var out = run('init ' + demo + ' --mode standard');
    assert.ok(!fs.existsSync(path.join(demo, 'mydocs', 'codemap')), 'codemap directory should not be created');
    assert.ok(!fs.existsSync(path.join(demo, 'mydocs', 'projectmap.md')), 'projectmap.md should not be created');
    assert.ok(out.indexOf('HINT') === -1, 'should not print codemap HINT: ' + out);
  });

  it('prompt commands generate output', function() {
    var demo = path.join(tmpBase, 'd6');
    run('init ' + demo + ' --mode standard');
    assert.ok(run('codemap ' + demo).indexOf('CodeMap') !== -1);
    assert.ok(run('review-execute ' + demo).indexOf('REVIEW EXECUTE PROMPT') !== -1);
    run('discover ' + demo + ' --task-name dbg --spec-version v1.0 --requirement x --mode standard');
    assert.ok(run('debug ' + demo + ' --error e').indexOf('DEBUG PROMPT') !== -1);
  });

  it('next, challenge, and cruise expose autonomous workflow prompts', function() {
    var demo = path.join(tmpBase, 'd6c');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name cruise-task --spec-version v1.0 --requirement x --mode standard');

    var next = run('next ' + demo);
    assert.ok(next.indexOf('NEXT_ACTION: repair_research') !== -1);
    assert.ok(next.indexOf('BACKTRACK_TARGET: Research') !== -1);
    assert.ok(next.indexOf('AUTONOMY_MODE: supervised') !== -1);
    assert.ok(next.indexOf('AUTHORIZATION_STATE: required') !== -1);

    var challenge = run('challenge ' + demo);
    assert.ok(challenge.indexOf('ADVERSARIAL REVIEW PROMPT') !== -1);
    assert.ok(challenge.indexOf('Research Challenge') !== -1);
    assert.ok(challenge.indexOf('Design Challenge') !== -1);
    assert.ok(challenge.indexOf('Acceptance Challenge') !== -1);
    assert.ok(challenge.indexOf('Plan Challenge') !== -1);
    assert.ok(challenge.indexOf('Code Challenge') !== -1);
    assert.ok(challenge.indexOf('FAIL_CODE') !== -1, 'challenge output should list FAIL_CODE verdict');
    assert.ok(challenge.indexOf('CODE_FILES') !== -1 || challenge.indexOf('Execute Log') !== -1, 'challenge should reference code files or execute log');
    assert.ok(challenge.indexOf('Execute Challenge') !== -1);
    assert.ok(challenge.indexOf('Archive Challenge') !== -1);
    assert.ok(challenge.indexOf('FAIL_DESIGN') !== -1);
    assert.ok(challenge.indexOf('subagent:<id>') !== -1, 'challenge should list subagent reviewer type');
    assert.ok(challenge.indexOf('external-agent:<id>') !== -1, 'challenge should list external-agent reviewer type');
    assert.ok(challenge.indexOf('human:<name>') !== -1, 'challenge should list human reviewer type');
    assert.ok(challenge.indexOf('automated reviewer') !== -1, 'challenge should mention automated reviewer authorization');
    assert.ok(challenge.indexOf('explicit current-user authorization') !== -1, 'challenge should require explicit current-user authorization when no fresh scope exists');
    assert.ok(challenge.indexOf('fresh task/plan authorization') !== -1, 'challenge should describe the reusable authorization boundary');
    assert.ok(challenge.indexOf('Codex subagent') === -1, 'challenge prompt should not be Codex-specific');
    assert.match(challenge, /AUTONOMY_MODE_SOURCE:/);
    assert.match(challenge, /AUTHORIZED_ACTORS:/);
    assert.match(challenge, /AUTHORIZED_SCOPE_DIGEST: sha256:/);
    assert.match(challenge, /AUTHORIZED_RISK_SNAPSHOT: sha256:/);
    assert.match(challenge, /ACTIVE_PLAN_DIGEST: sha256:/);
    assert.match(challenge, /NEXT_ACTION:/);

    var cruise = run('cruise ' + demo);
    assert.ok(cruise.indexOf('AUTONOMOUS CRUISE PROMPT') !== -1);
    assert.ok(cruise.indexOf('DRIVER: auto') !== -1);
    assert.ok(cruise.indexOf('REUSE_NATIVE_LOOP: no') !== -1);
    assert.ok(cruise.indexOf('MAX_ITERATIONS: 5') !== -1);
    assert.match(cruise, /AUTONOMY_MODE_SOURCE:/);
    assert.match(cruise, /AUTHORIZED_ACTORS:/);
    assert.match(cruise, /AUTHORIZED_SCOPE_DIGEST: sha256:/);
    assert.match(cruise, /AUTHORIZED_RISK_SNAPSHOT: sha256:/);
    assert.match(cruise, /ACTIVE_PLAN_DIGEST: sha256:/);
    assert.ok(cruise.indexOf('repair loop') !== -1);
    assert.ok(cruise.indexOf('sdd validate') !== -1);
    assert.ok(cruise.indexOf('sdd challenge') !== -1);
  });

  it('next surfaces platform-neutral authorization guidance when challenge is missing', function() {
    var demo = path.join(tmpBase, 'd6c-next-reviewer-auth');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name reviewer-auth --spec-version v1.0 --requirement x --mode standard');
    makeStandardExecutedButUnchallenged(demo, path.join(demo, 'mydocs', 'specs', 'v1.0-reviewer-auth.md'));

    var next = run('next ' + demo);
    assert.ok(next.indexOf('NEXT_ACTION: run_challenge') !== -1, next);
    assert.ok(next.indexOf('subagent:<id>') !== -1, next);
    assert.ok(next.indexOf('external-agent:<id>') !== -1, next);
    assert.ok(next.indexOf('human:<name>') !== -1, next);
    assert.ok(next.indexOf('automated reviewer') !== -1, next);
    assert.ok(next.indexOf('explicit current-user authorization') !== -1, next);
    assert.ok(next.indexOf('fresh task/plan authorization') !== -1, next);
    assert.ok(next.indexOf('Codex subagent') === -1, next);
  });

  it('cruise can target native host loop drivers', function() {
    var demo = path.join(tmpBase, 'd6e');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name native-loop --spec-version v1.0 --requirement x --mode standard');

    var claude = run('cruise ' + demo + ' --driver claude-code');
    assert.ok(claude.indexOf('DRIVER: claude-code') !== -1);
    assert.ok(claude.indexOf('Claude Code Dynamic Workflows') !== -1);
    assert.ok(claude.indexOf('fallback to the prompt loop') !== -1);

    var codex = run('cruise ' + demo + ' --driver codex');
    assert.ok(codex.indexOf('DRIVER: codex') !== -1);
    assert.ok(codex.indexOf('Codex native loop') !== -1);
    assert.ok(codex.indexOf('SDD remains the control protocol') !== -1);

    var opencode = run('cruise ' + demo + ' --driver opencode');
    assert.ok(opencode.indexOf('DRIVER: opencode') !== -1);
    assert.ok(opencode.indexOf('opencode native loop') !== -1);
    assert.ok(opencode.indexOf('SDD remains the control protocol') !== -1);
  });

  it('next preserves explicit challenge PASS even when validation has blockers', function() {
    var demo = path.join(tmpBase, 'd6h');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name stale-pass --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-stale-pass.md');
    var c = fs.readFileSync(sf, 'utf-8')
      .replace(/^Challenge Verdict:$/m, 'Challenge Verdict: PASS')
      .replace(/^Challenge Summary:$/m, 'Challenge Summary: stale prior pass');
    fs.writeFileSync(sf, c, 'utf-8');

    var out = run('next ' + demo);
    // Challenge verdict is independent — explicit PASS stays PASS
    assert.ok(out.indexOf('CHALLENGE_VERDICT: PASS') !== -1);
    // But validation blockers still appear and nextAction is not archive_ready
    assert.ok(out.indexOf('Confirmed Requirement is empty.') !== -1);
    assert.ok(out.indexOf('NEXT_ACTION: repair_research') !== -1);
  });

  it('human mode suppresses native cruise and legacy active config requires migration', function() {
    var disabledDemo = path.join(tmpBase, 'd6i-disabled');
    run('init ' + disabledDemo + ' --mode standard --autonomy-mode human');
    run('discover ' + disabledDemo + ' --task-name cruise-disabled --spec-version v1.0 --requirement x --mode standard --autonomy-mode human');

    var disabled = run('cruise ' + disabledDemo + ' --record-run');
    assert.ok(disabled.indexOf('## HUMAN-GUIDED WORKFLOW') !== -1);
    assert.equal(disabled.indexOf('### Autonomous repair loop'), -1);

    var offDemo = path.join(tmpBase, 'd6i');
    run('init ' + offDemo + ' --mode standard');
    run('discover ' + offDemo + ' --task-name cruise-off --spec-version v1.0 --requirement x --mode standard');
    fs.writeFileSync(path.join(offDemo, '.sdd-config'),
      'DOCS_DIR="mydocs"\nMODE="standard"\nCRUISE_POLICY="off"\n', 'utf-8');

    var off = run('cruise ' + offDemo + ' --record-run');
    var offLedger = path.join(offDemo, 'mydocs', 'runs', 'v1.0-cruise-off.cruise.jsonl');
    assert.ok(off.indexOf('STOP_REASON: migration_required') !== -1);
    assert.ok(off.indexOf('REUSE_NATIVE_LOOP: no') !== -1);
    assert.ok(fs.existsSync(offLedger));
  });

  it('cruise reports local-loop as prompt-loop compensation', function() {
    var demo = path.join(tmpBase, 'd6k');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name local-loop-copy --spec-version v1.0 --requirement x --mode standard');

    var out = run('cruise ' + demo + ' --driver local-loop');
    assert.ok(out.indexOf('prompt-loop compensation') !== -1);
    assert.equal(out.indexOf('local bounded loop wrapper'), -1);
  });

  it('cruise rejects invalid drivers instead of falling back to auto', function() {
    var demo = path.join(tmpBase, 'd6l');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name bad-driver --spec-version v1.0 --requirement x --mode standard');

    var out = run('cruise ' + demo + ' --driver typo-engine');
    assert.ok(out.indexOf('Invalid cruise driver: typo-engine') !== -1);
    assert.ok(out.indexOf('exit:') !== -1);

    var localAlias = run('cruise ' + demo + ' --driver local');
    assert.ok(localAlias.indexOf('Invalid cruise driver: local') !== -1, localAlias);
    assert.ok(localAlias.indexOf('exit:') !== -1, localAlias);

    var claudeAlias = run('cruise ' + demo + ' --driver claude');
    assert.ok(claudeAlias.indexOf('Invalid cruise driver: claude') !== -1, claudeAlias);
    assert.ok(claudeAlias.indexOf('exit:') !== -1, claudeAlias);
  });

  it('cruise rejects legacy engine option', function() {
    var demo = path.join(tmpBase, 'd6l-engine');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name engine-option --spec-version v1.0 --requirement x --mode standard');

    var out = run('cruise ' + demo + ' --engine codex');
    assert.ok(out.indexOf("unknown option '--engine'") !== -1, out);
    assert.ok(out.indexOf('exit:') !== -1, out);
  });

  it('cruise emits Claude ultracode prompt and records run ledger', function() {
    var demo = path.join(tmpBase, 'd6f');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name workflow-run --spec-version v1.0 --requirement x --mode standard');

    var emitted = run('cruise ' + demo + ' --driver claude-code --emit-claude-prompt');
    var workflowFile = path.join(demo, '.claude', 'workflows', 'sdd-cruise.md');
    assert.ok(emitted.indexOf('[CLAUDE_PROMPT]') !== -1);
    assert.ok(emitted.indexOf('ultracode:') !== -1);
    assert.ok(emitted.indexOf('/effort ultracode') !== -1);
    assert.ok(emitted.indexOf('sdd next') !== -1);
    assert.ok(emitted.indexOf('sdd validate') !== -1);
    assert.ok(emitted.indexOf('sdd challenge') !== -1);
    assert.ok(emitted.indexOf('--record-run') !== -1);
    assert.ok(!fs.existsSync(workflowFile));

    var recorded = run('cruise ' + demo + ' --driver local-loop --record-run --iteration 3');
    var ledgerFile = path.join(demo, 'mydocs', 'runs', 'v1.0-workflow-run.cruise.jsonl');
    assert.ok(recorded.indexOf('[RUN_LEDGER]') !== -1);
    assert.ok(fs.existsSync(ledgerFile));
    var lines = fs.readFileSync(ledgerFile, 'utf-8').trim().split(/\r?\n/);
    assert.equal(lines.length, 1);
    var entry = JSON.parse(lines[0]);
    assert.equal(entry.iteration, 3);
    assert.equal(entry.driver, 'local-loop');
    assert.equal(entry.engine, undefined);
    assert.equal(entry.nextAction, 'repair_research');
    assert.equal(entry.backtrackTarget, 'Research');
    assert.equal(entry.challengeVerdict, 'FAIL_SPEC');
    assert.equal(entry.stopReason, 'task_authorization_required');
  });

  it('console spec detail exposes latest cruise run ledger entry', async function() {
    var demo = path.join(tmpBase, 'd6g');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name console-run --spec-version v1.0 --requirement x --mode standard');
    fs.writeFileSync(path.join(demo, 'mydocs', 'runs', 'v1.0-console-run.cruise.jsonl'), 'bad-json\n', 'utf-8');
    run('cruise ' + demo + ' --driver local-loop --record-run --iteration 2');

    var server = require('../src/commands/console').createServer(demo);
    await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
    try {
      var list = await waitForSpecs(server, 1);
      var detail = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id));
      assert.equal(detail.statusCode, 200);
      assert.equal(detail.body.cruiseRun.count, 1);
      assert.equal(detail.body.cruiseRun.malformedCount, 1);
      assert.equal(detail.body.cruiseRun.latest.iteration, 2);
      assert.equal(detail.body.cruiseRun.latest.driver, 'local-loop');
      assert.equal(detail.body.cruiseRun.latest.engine, undefined);
      assert.equal(detail.body.cruiseRun.latest.nextAction, 'repair_research');
    } finally {
      await new Promise(function(resolve) { server.close(resolve); });
    }
  });

  it('next maps missing acceptance metadata to FAIL_ACCEPTANCE backtrack', function() {
    var demo = path.join(tmpBase, 'd6d');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name acceptance-backtrack --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-acceptance-backtrack.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^(### Confirmed Requirement\n)/m, '$1Requirement is confirmed.\n');
    c = replaceSectionStart(c, 'Innovate Options', 'Option A: keep current path.\nOption B: reject.\nSelected: Option A.');
    c = replaceSectionStart(c, 'Acceptance Criteria', '### AC-001: missing verification metadata');
    c = fillAutoApproval(c);
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', standardDesignContent());
    insertSectionContent(logFile, 'Execute Log', completionVerificationLog());

    var out = run('next ' + demo);
    assert.ok(out.indexOf('CHALLENGE_VERDICT: FAIL_ACCEPTANCE') !== -1);
    assert.ok(out.indexOf('BACKTRACK_TARGET: Acceptance') !== -1);
  });

  it('review-execute includes design and acceptance evidence in Axis 1', function() {
    var demo = path.join(tmpBase, 'd6b');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name review-design --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-review-design.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var c = replaceSectionStart(fs.readFileSync(sf, 'utf-8'), 'Acceptance Criteria', '### AC-001: review prompt includes acceptance evidence');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', 'Selected Option / ADR: include design evidence in review.');
    var out = run('review-execute ' + demo);
    assert.ok(out.indexOf('Design / Acceptance / Plan Coverage') !== -1);
    assert.ok(out.indexOf('#### Design Brief') !== -1);
    assert.ok(out.indexOf('Selected Option / ADR: include design evidence in review') !== -1);
    assert.ok(out.indexOf('#### Acceptance Brief') !== -1);
    assert.ok(out.indexOf('AC-001') !== -1);
  });

  function gitInit(dir) {
    execSync('git init', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.email t@example.com', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.name Tester', { cwd: dir, stdio: 'ignore' });
  }

  it('review-execute default diffs the working tree including untracked files (AC-001/002/004)', function() {
    var demo = path.join(tmpBase, 'd6wt');
    run('init ' + demo + ' --mode lite');
    var trackedFile = path.join(demo, 'tracked.txt');
    fs.writeFileSync(trackedFile, 'original line\n', 'utf-8');
    gitInit(demo);
    execSync('git add -A', { cwd: demo, stdio: 'ignore' });
    execSync('git commit -m baseline', { cwd: demo, stdio: 'ignore' });
    fs.writeFileSync(trackedFile, 'changed line ZZTRACKED\n', 'utf-8');           // tracked, uncommitted
    fs.writeFileSync(path.join(demo, 'fresh.txt'), 'brand new ZZUNTRACKED\n', 'utf-8'); // untracked
    var out = run('review-execute ' + demo);
    assert.ok(out.indexOf('> Diff source: working tree') !== -1, 'expected working tree source: ' + out.slice(0, 200));
    assert.ok(out.indexOf('ZZTRACKED') !== -1, 'tracked change missing from Axis 2');
    assert.ok(out.indexOf('ZZUNTRACKED') !== -1, 'untracked file missing from Axis 2');
  });

  it('review-execute --diff-base uses the branch model (AC-003)', function() {
    var demo = path.join(tmpBase, 'd6br');
    run('init ' + demo + ' --mode lite');
    gitInit(demo);
    execSync('git add -A', { cwd: demo, stdio: 'ignore' });
    execSync('git commit -m baseline', { cwd: demo, stdio: 'ignore' });
    var base = execSync('git rev-parse HEAD', { cwd: demo, encoding: 'utf-8' }).trim();
    fs.writeFileSync(path.join(demo, 'committed.txt'), 'committed change ZZCOMMIT\n', 'utf-8');
    execSync('git add -A', { cwd: demo, stdio: 'ignore' });
    execSync('git commit -m second', { cwd: demo, stdio: 'ignore' });
    var out = run('review-execute ' + demo + ' --diff-base ' + base);
    assert.ok(out.indexOf('> Diff source: ' + base + '..HEAD') !== -1, 'expected branch source: ' + out.slice(0, 200));
    assert.ok(out.indexOf('ZZCOMMIT') !== -1, 'committed change missing from branch diff');
  });

  it('review-execute reports no git diff outside a repo (AC-005)', function() {
    var demo = path.join(tmpBase, 'd6ng');
    run('init ' + demo + ' --mode lite');
    var out = run('review-execute ' + demo);
    assert.ok(out.indexOf('REVIEW EXECUTE PROMPT') !== -1);
    assert.ok(out.indexOf('(no git diff)') !== -1, 'expected (no git diff) outside repo: ' + out.slice(0, 200));
  });

  it('discover prints the mode-selection advisory and escalates the nudge for standard', function() {
    var demo = path.join(tmpBase, 'd6mode');
    run('init ' + demo + ' --mode lite');
    var lite = run('discover ' + demo + ' --task-name mode-lite --spec-version v1.0 --mode lite');
    assert.ok(lite.indexOf('[MODE] lite') !== -1, 'expected MODE advisory: ' + lite.slice(0, 300));
    assert.ok(lite.indexOf('protocols/mode-selection.md') !== -1, 'expected rubric pointer');
    assert.ok(lite.indexOf('standard is the heaviest') === -1, 'lite should not get the standard nudge');
    var std = run('discover ' + demo + ' --task-name mode-std --spec-version v1.0 --mode standard');
    assert.ok(std.indexOf('[MODE] standard') !== -1);
    assert.ok(std.indexOf('standard is the heaviest') !== -1, 'standard should get the heavier nudge: ' + std.slice(0, 300));
  });

  it('learnings lists the project index and recalls per spec (AC-003)', function() {
    var demo = path.join(tmpBase, 'd6learn');
    run('init ' + demo + ' --mode lite');
    run('discover ' + demo + ' --task-name pay-retry --spec-version v1.0 --requirement "payment retry idempotency" --mode standard');
    run('new-learning ' + demo + ' pay-retry');
    var lf = path.join(demo, 'mydocs', 'learnings', 'v1.0-pay-retry.learning.md');
    var c = fs.readFileSync(lf, 'utf-8')
      .replace('Applies When:', 'Applies When: payment retry idempotency')
      .replace('Decision Rule:', 'Decision Rule: use idempotency keys');
    fs.writeFileSync(lf, c, 'utf-8');
    var idx = run('learnings ' + demo);
    assert.ok(idx.indexOf('PROJECT LEARNINGS') !== -1, 'expected project index: ' + idx);
    assert.ok(idx.indexOf('pay-retry') !== -1);
    assert.ok(idx.indexOf('payment retry idempotency') !== -1);
    var spec = path.join(demo, 'mydocs', 'specs', 'v1.0-pay-retry.md');
    var recall = run('learnings ' + demo + ' --for ' + spec);
    assert.ok(recall.indexOf('LEARNING RECALL') !== -1, 'expected recall view: ' + recall);
    assert.ok(recall.indexOf('v1.0-pay-retry.learning.md') !== -1);

    // Resume should auto-output relevant learnings
    var resumeOut = run('resume ' + demo);
    assert.ok(resumeOut.indexOf('RELEVANT_LEARNINGS:') !== -1, 'resume should output RELEVANT_LEARNINGS when learnings exist');
    assert.ok(resumeOut.indexOf('pay-retry.learning.md') !== -1, 'resume should include the relevant learning file');
  });

  it('console API exposes spec list, detail, and archive validation', async function() {
    var demo = path.join(tmpBase, 'd7');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name console-task --spec-version v1.0 --requirement x --mode standard');
    run('new-learning ' + demo + ' console-task');
    var openedFiles = [];
    var server = require('../src/commands/console').createServer(demo, {
      openFile: function(filePath, callback) {
        openedFiles.push(filePath);
        callback();
      }
    });
    await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
    try {
      var list = await waitForSpecs(server, 1);
      assert.equal(list.statusCode, 200);
      assert.equal(list.body.specs.length, 1);
      assert.equal(list.body.specs[0].phase, 'research');
      assert.equal(list.body.counts.research, 1);

      var detail = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id));
      assert.equal(detail.statusCode, 200);
      assert.equal(detail.body.taskName, 'console-task');
      assert.equal(detail.body.workflow.autonomyMode, 'supervised');
      assert.equal(detail.body.workflow.authorizationState, 'required');
      assert.match(detail.body.workflow.authorizedScopeDigest, /^sha256:/);
      assert.match(detail.body.workflow.authorizedRiskSnapshot, /^sha256:/);
      assert.match(detail.body.workflow.activePlanDigest, /^sha256:/);
      assert.equal(detail.body.workflow.gatePolicy, undefined);
      assert.equal(detail.body.workflow.cruisePolicy, undefined);
      assert.equal(detail.body.workflow.maxIterations, 5);
      assert.equal(detail.body.workflow.nextAction, 'repair_research');
      assert.equal(detail.body.workflow.backtrackTarget, 'Research');
      assert.equal(detail.body.workflow.challengeVerdict, 'FAIL_SPEC');
      assert.ok(detail.body.artifacts.design.ref.endsWith('v1.0-console-task.design.md'));
      assert.ok(detail.body.artifacts.executeLog.ref.endsWith('v1.0-console-task.execute.md'));
      assert.ok(detail.body.artifacts.learning.ref.endsWith('v1.0-console-task.learning.md'));

      var specPreview = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/artifact?artifact=spec');
      var designPreview = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/artifact?artifact=design');
      var logPreview = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/artifact?artifact=executeLog');
      var learningPreview = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/artifact?artifact=learning');
      assert.equal(specPreview.statusCode, 200);
      assert.equal(specPreview.body.label, 'Spec');
      assert.ok(specPreview.body.content.indexOf('console-task') !== -1);
      assert.equal(designPreview.statusCode, 200);
      assert.equal(designPreview.body.label, 'Design');
      assert.ok(designPreview.body.relativePath.endsWith('v1.0-console-task.design.md'));
      assert.equal(logPreview.statusCode, 200);
      assert.equal(logPreview.body.label, 'Execute Log');
      assert.ok(logPreview.body.relativePath.endsWith('v1.0-console-task.execute.md'));
      assert.equal(learningPreview.statusCode, 200);
      assert.equal(learningPreview.body.label, 'Learning');
      assert.ok(learningPreview.body.relativePath.endsWith('v1.0-console-task.learning.md'));

      var previewPage = await requestText(server, '/preview.html');
      assert.equal(previewPage.statusCode, 200);
      assert.ok(previewPage.body.indexOf('SDD Artifact Preview') !== -1);

      var openSpec = await requestJsonBody(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/open', 'POST', { artifact: 'spec' });
      var openDesign = await requestJsonBody(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/open', 'POST', { artifact: 'design' });
      var openLog = await requestJsonBody(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/open', 'POST', { artifact: 'executeLog' });
      var openLearning = await requestJsonBody(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/open', 'POST', { artifact: 'learning' });
      assert.equal(openSpec.statusCode, 200);
      assert.equal(openDesign.statusCode, 200);
      assert.equal(openLog.statusCode, 200);
      assert.equal(openLearning.statusCode, 200);
      assert.ok(openedFiles.some(function(filePath) { return filePath.endsWith('v1.0-console-task.md'); }));
      assert.ok(openedFiles.some(function(filePath) { return filePath.endsWith('v1.0-console-task.design.md'); }));
      assert.ok(openedFiles.some(function(filePath) { return filePath.endsWith('v1.0-console-task.execute.md'); }));
      assert.ok(openedFiles.some(function(filePath) { return filePath.endsWith('v1.0-console-task.learning.md'); }));

      var validation = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/validate', 'POST');
      assert.equal(validation.statusCode, 200);
      assert.equal(validation.body.ok, false);
      assert.ok(validation.body.issues.some(function(issue) { return issue.indexOf('Plan Approved By is empty') !== -1; }));
    } finally {
      await new Promise(function(resolve) { server.close(resolve); });
    }
  });

  it('console can start without a project and select one through the API', async function() {
    var demo = path.join(tmpBase, 'd7b');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name selectable-task --spec-version v1.0 --requirement x --mode standard');
    var server = require('../src/commands/console').createServer();
    await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
    try {
      var emptyProject = await requestJson(server, '/api/project');
      assert.equal(emptyProject.statusCode, 200);
      assert.equal(emptyProject.body.configured, false);

      var blockedSpecs = await requestJson(server, '/api/specs');
      assert.equal(blockedSpecs.statusCode, 400);
      assert.ok(blockedSpecs.body.error.indexOf('Project not selected') !== -1);

      var selected = await requestJsonBody(server, '/api/project', 'POST', { projectDir: demo });
      assert.equal(selected.statusCode, 200);
      assert.equal(selected.body.configured, true);
      assert.equal(selected.body.projectDir, path.resolve(demo));

      var list = await waitForSpecs(server, 1);
      assert.equal(list.statusCode, 200);
      assert.equal(list.body.specs.length, 1);
      assert.equal(list.body.specs[0].taskName, 'selectable-task');
    } finally {
      await new Promise(function(resolve) { server.close(resolve); });
    }
  });

  it('console browse API can select a project directory', async function() {
    var demo = path.join(tmpBase, 'd7c');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name browsed-task --spec-version v1.0 --requirement x --mode standard');
    var server = require('../src/commands/console').createServer('', {
      browseProjectDir: function() { return demo; }
    });
    await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
    try {
      var selected = await requestJson(server, '/api/project/browse', 'POST');
      assert.equal(selected.statusCode, 200);
      assert.equal(selected.body.configured, true);
      assert.equal(selected.body.projectDir, path.resolve(demo));

      var list = await waitForSpecs(server, 1);
      assert.equal(list.statusCode, 200);
      assert.equal(list.body.specs[0].taskName, 'browsed-task');
    } finally {
      await new Promise(function(resolve) { server.close(resolve); });
    }
  });

  it('console project board API summarizes multiple projects', async function() {
    var demoA = path.join(tmpBase, 'd7d-a');
    var demoB = path.join(tmpBase, 'd7d-b');
    run('init ' + demoA + ' --mode standard');
    run('init ' + demoB + ' --mode lite');
    run('discover ' + demoA + ' --task-name board-a --spec-version v1.0 --requirement x --mode standard');
    run('discover ' + demoB + ' --task-name board-b --spec-version v1.0 --requirement x --mode lite');
    var server = require('../src/commands/console').createServer();
    await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
    try {
      var summary = await waitForProjectSummary(server, 2, demoA, demoB, demoA);
      assert.equal(summary.statusCode, 200);
      assert.equal(summary.body.projects.length, 2);
      assert.equal(summary.body.projects[0].total, 1);
      assert.equal(summary.body.projects[1].total, 1);
      assert.equal(summary.body.projects[0].issueCountLightweight, true);
      assert.equal(summary.body.projects[0].issueCount, 0);
      assert.ok(summary.body.projects.every(function(project) { return project.configured; }));
    } finally {
      await new Promise(function(resolve) { server.close(resolve); });
    }
  });

  it('console hidden utility overrides detail empty-state display', function() {
    var css = fs.readFileSync(path.resolve('src', 'web', 'console.css'), 'utf-8');
    assert.match(css, /\.hidden\s*{\s*display:\s*none\s*!important;\s*}/);
  });

  it('console copy matches gate and cruise control-plane semantics', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    assert.ok(js.indexOf('Configured approval gate') !== -1);
    assert.ok(js.indexOf('agent approval needs Gate Evidence') !== -1);
    assert.equal(js.indexOf('auto-gate'), -1);
    assert.ok(js.indexOf('next: ') !== -1);
    assert.ok(js.indexOf('gate evidence: ') !== -1);
    assert.equal(js.indexOf('Human approval recorded'), -1);
  });

  it('console phase tabs wrap instead of forcing horizontal scroll', function() {
    var css = fs.readFileSync(path.resolve('src', 'web', 'console.css'), 'utf-8');
    var match = css.match(/\.phase-tabs\s*{([^}]*)}/);
    assert.ok(match, 'phase tabs styles are missing');
    assert.match(match[1], /display:\s*grid;/);
    assert.match(match[1], /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(94px,\s*1fr\)\);/);
    assert.doesNotMatch(match[1], /overflow-x:\s*auto;/);
  });

  it('console Windows opener avoids PowerShell command argument parsing', function() {
    var source = fs.readFileSync(path.resolve('src', 'commands', 'console.js'), 'utf-8');
    assert.match(source, /rundll32\.exe/);
    assert.match(source, /url\.dll,FileProtocolHandler/);
    assert.doesNotMatch(source, /Invoke-Item -LiteralPath \$args\[0\]/);
    assert.doesNotMatch(source, /Start-Process -LiteralPath/);
  });

  it('console renders risk flags with per-type color classes (AC-001)', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    var css = fs.readFileSync(path.resolve('src', 'web', 'console.css'), 'utf-8');
    assert.ok(js.indexOf('renderRiskFlags') !== -1, 'renderRiskFlags function exists');
    assert.ok(js.indexOf('risk-security') !== -1, 'security risk tone mapped');
    assert.ok(js.indexOf('risk-billing') !== -1, 'billing risk tone mapped');
    assert.ok(js.indexOf('risk-migration') !== -1, 'migration risk tone mapped');
    assert.ok(js.indexOf('risk-public-api') !== -1, 'public-api risk tone mapped');
    assert.ok(js.indexOf('risk-irreversible') !== -1, 'irreversible risk tone mapped');
    assert.ok(js.indexOf('No risk flags') !== -1, 'empty state text present');
    assert.match(css, /\.risk-security/, 'security CSS class exists');
    assert.match(css, /\.risk-billing/, 'billing CSS class exists');
    assert.match(css, /\.risk-migration/, 'migration CSS class exists');
    assert.match(css, /\.risk-public-api/, 'public-api CSS class exists');
    assert.match(css, /\.risk-irreversible/, 'irreversible CSS class exists');
  });

  it('console renders design method advisory with methods, focusFields, and notes (AC-002)', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    var html = fs.readFileSync(path.resolve('src', 'web', 'index.html'), 'utf-8');
    assert.ok(js.indexOf('renderDesignMethod') !== -1, 'renderDesignMethod function exists');
    assert.ok(js.indexOf('dm-group') !== -1, 'design method group class used');
    assert.ok(js.indexOf('dm-tag') !== -1, 'design method tag class used');
    assert.ok(html.indexOf('design-method') !== -1, 'design method container in HTML');
  });

  it('console renders learning triggers when learning is required (AC-003)', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    var html = fs.readFileSync(path.resolve('src', 'web', 'index.html'), 'utf-8');
    assert.ok(js.indexOf('renderLearningTriggers') !== -1, 'renderLearningTriggers function exists');
    assert.ok(js.indexOf('learningRequired') !== -1, 'reads learningRequired from completion');
    assert.ok(js.indexOf('learning-trigger-item') !== -1, 'learning trigger item class used');
    assert.ok(html.indexOf('learning-triggers') !== -1, 'learning triggers container in HTML');
  });

  it('console renders blockers list from workflow (AC-004)', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    var html = fs.readFileSync(path.resolve('src', 'web', 'index.html'), 'utf-8');
    assert.ok(js.indexOf('renderBlockers') !== -1, 'renderBlockers function exists');
    assert.ok(js.indexOf('blocker-item') !== -1, 'blocker item class used');
    assert.ok(js.indexOf('No blockers') !== -1, 'empty state text present');
    assert.ok(html.indexOf('blockers') !== -1, 'blockers container in HTML');
  });

  it('console renders challenge summary in blocker card (AC-005)', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    assert.ok(js.indexOf('challengeSummary') !== -1, 'reads challengeSummary from workflow');
    assert.ok(js.indexOf('challenge-summary') !== -1, 'challenge summary CSS class used');
  });

  it('console detail page has Status Overview and Methodology sections in HTML', function() {
    var html = fs.readFileSync(path.resolve('src', 'web', 'index.html'), 'utf-8');
    assert.ok(html.indexOf('Status Overview') !== -1, 'Status Overview section exists');
    assert.ok(html.indexOf('Methodology') !== -1, 'Methodology section exists');
    assert.ok(html.indexOf('risk-flags') !== -1, 'risk-flags container exists');
    assert.ok(html.indexOf('blockers') !== -1, 'blockers container exists');
    assert.ok(html.indexOf('design-method') !== -1, 'design-method container exists');
    assert.ok(html.indexOf('learning-triggers') !== -1, 'learning-triggers container exists');
    assert.ok(html.indexOf('ac-coverage') !== -1, 'ac-coverage container exists');
    assert.ok(html.indexOf('AC Coverage') !== -1, 'AC Coverage section title exists');
  });

  it('console renders AC Coverage from the structured DTO', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    var css = fs.readFileSync(path.resolve('src', 'web', 'console.css'), 'utf-8');
    assert.ok(js.indexOf('renderAcCoverage') !== -1, 'renderAcCoverage function exists');
    assert.ok(js.indexOf('ac-coverage-summary') !== -1, 'ac-coverage-summary class used');
    assert.ok(js.indexOf('ac-coverage-item') !== -1, 'ac-coverage-item class used');
    assert.ok(js.indexOf('schemaVersion !== 1') !== -1, 'validates the DTO schema version');
    assert.ok(js.indexOf('coverage.completionState') !== -1, 'reads structured completion state');
    assert.ok(js.indexOf('Coverage records missing') !== -1, 'missing-record state text present');
    assert.ok(js.indexOf('ac-coverage-unavailable') !== -1, 'safe unavailable diagnostic present');
    assert.ok(css.indexOf('.ac-coverage-summary') !== -1, 'ac-coverage-summary CSS exists');
    assert.ok(css.indexOf('.ac-coverage-item') !== -1, 'ac-coverage-item CSS exists');
  });

  it('console renders challenge verdict with color-coded pill (AC-001)', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    var css = fs.readFileSync(path.resolve('src', 'web', 'console.css'), 'utf-8');
    assert.ok(js.indexOf('renderChallengeVerdict') !== -1, 'renderChallengeVerdict function exists');
    assert.ok(js.indexOf('challengeVerdictTone') !== -1, 'verdict tone function exists');
    assert.ok(js.indexOf("'complete'") !== -1, 'PASS maps to complete tone');
    assert.ok(js.indexOf("'waiting'") !== -1, 'PASS_WITH_CONCERNS maps to waiting tone');
    assert.ok(js.indexOf("'bad'") !== -1, 'FAIL_* maps to bad tone');
    assert.match(css, /\.pill\.bad/, 'bad pill CSS class exists');
  });

  it('console renders backtrack target only on FAIL verdict (AC-002)', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    assert.ok(js.indexOf('backtrack-target') !== -1, 'backtrack target CSS class used');
    assert.ok(js.indexOf("verdict.indexOf('FAIL_') === 0") !== -1, 'backtrack only shown for FAIL_*');
  });

  it('console renders cruise run with enabled state, iterations, and latest run (AC-003)', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    var html = fs.readFileSync(path.resolve('src', 'web', 'index.html'), 'utf-8');
    assert.ok(js.indexOf('renderCruiseRun') !== -1, 'renderCruiseRun function exists');
    assert.ok(js.indexOf('autonomyMode') !== -1, 'reads autonomyMode');
    assert.equal(js.indexOf('cruisePolicy'), -1);
    assert.ok(js.indexOf('maxIterations') !== -1, 'reads maxIterations');
    assert.ok(js.indexOf('cruise-latest') !== -1, 'latest run section class');
    assert.ok(html.indexOf('cruise-run') !== -1, 'cruise-run container in HTML');
  });

  it('console renders cruise stop reason with color coding (AC-004)', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    assert.ok(js.indexOf('STOP_REASON_TONES') !== -1, 'stop reason tone map exists');
    assert.ok(js.indexOf("pass: 'complete'") !== -1, 'pass → complete');
    assert.ok(js.indexOf("max_iterations: 'waiting'") !== -1, 'max_iterations → waiting');
    assert.ok(js.indexOf("human_required: 'bad'") !== -1, 'human_required → bad');
    assert.ok(js.indexOf("continue: 'progress'") !== -1, 'continue → progress');
  });

  it('console blocker card no longer contains challenge and backtrack text (AC-005)', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    var blockerMatch = js.match(/function renderBlocker\(spec\)[\s\S]*?\.join\(''\);/);
    assert.ok(blockerMatch, 'renderBlocker function found');
    assert.doesNotMatch(blockerMatch[0], /challenge: /, 'challenge text removed from blocker card');
    assert.doesNotMatch(blockerMatch[0], /backtrack: /, 'backtrack text removed from blocker card');
  });

  it('console detail page has Challenge Verdict and Cruise Run sections in HTML', function() {
    var html = fs.readFileSync(path.resolve('src', 'web', 'index.html'), 'utf-8');
    assert.ok(html.indexOf('challenge-verdict') !== -1, 'challenge-verdict container exists');
    assert.ok(html.indexOf('Cruise Run') !== -1, 'Cruise Run section exists');
    assert.ok(html.indexOf('cruise-run') !== -1, 'cruise-run container exists');
  });

  it('design method router maps mode and risk to advisory hints', function() {
    var workflow = require('../src/core/workflow');
    var micro = workflow.designMethodHint('micro', []);
    assert.equal(micro.applies, false);
    assert.match(workflow.formatDesignMethodLines(micro)[0], /DESIGN_METHOD: n\/a/);
    var lite = workflow.designMethodHint('lite', []);
    assert.equal(lite.applies, true);
    assert.ok(lite.methods.join(' ').indexOf('ADR') !== -1);
    var std = workflow.designMethodHint('standard', []);
    assert.ok(std.methods.join(' ').indexOf('arc42') !== -1);
    assert.ok(std.methods.join(' ').indexOf('C4') !== -1);
    assert.equal(std.focusFields.length, 0);
    var mig = workflow.designMethodHint('standard', ['migration']);
    assert.ok(mig.focusFields.indexOf('Data Migration / Backfill') !== -1);

    var demo = path.join(tmpBase, 'dmr');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name method-route --spec-version v1.0 --requirement x --mode standard');
    var out = run('next ' + demo);
    assert.ok(out.indexOf('DESIGN_METHOD:') !== -1);
    assert.ok(out.indexOf('arc42') !== -1);
  });

  it('skill and generated AI configs require human-confirmed spec creation inputs', function() {
    var skill = fs.readFileSync(path.resolve('SKILL.md'), 'utf-8');
    assert.ok(skill.indexOf('must ask the user to provide or confirm `version` and `task-name`') !== -1);
    assert.ok(skill.indexOf('ask whether reference materials / context exist') !== -1);

    var demo = path.join(tmpBase, 'human-confirmed-ai-config');
    run('init ' + demo + ' --mode standard');
    var agentsText = fs.readFileSync(path.join(demo, 'AGENTS.md'), 'utf-8');
    assert.ok(agentsText.indexOf('Before creating a Spec, ask the user to provide or confirm `version` and `task-name`') !== -1);
    assert.ok(agentsText.indexOf('ask whether reference materials / context exist') !== -1);
  });

  it('Console labels completed active work as awaiting archive authorization', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    assert.match(js, /Awaiting Archive Authorization/);
    assert.doesNotMatch(js, /Ready to archive/);
    assert.doesNotMatch(js, /All archive gates pass\. This spec is ready to archive\./);
  });

  it('archive help and Agent protocols require current explicit user authorization', function() {
    var help = run('archive --help');
    assert.match(help, /--authorized-by <identity>/);
    assert.match(help, /--authorization-evidence <text>/);

    [
      'SKILL.md',
      'protocols/sdd-riper-one.md',
      'protocols/sdd-riper-one-light.md',
      'src/core/ai-config-rules.js'
    ].forEach(function(file) {
      var text = fs.readFileSync(path.resolve(file), 'utf-8');
      assert.match(text, /request explicit archive authorization from the current user/i, file);
      assert.match(text, /must not construct archive authorization/i, file);
      assert.match(text, /audit declaration, not identity authentication/i, file);
    });
  });

  it('generated AI configs include platform-neutral reviewer authorization guidance', function() {
    var demo = path.join(tmpBase, 'reviewer-auth-ai-config');
    run('init ' + demo + ' --mode standard');
    ['AGENTS.md', 'CLAUDE.md', '.cursorrules', path.join('.github', 'copilot-instructions.md')].forEach(function(file) {
      var text = fs.readFileSync(path.join(demo, file), 'utf-8');
      assert.ok(text.indexOf('subagent:<id>') !== -1, file);
      assert.ok(text.indexOf('external-agent:<id>') !== -1, file);
      assert.ok(text.indexOf('human:<name>') !== -1, file);
      assert.match(text, /automated reviewer|自动 reviewer/, file);
      assert.match(text, /explicit current-user authorization|当前用户明确授权/, file);
      assert.ok(text.indexOf('fresh task/plan authorization') !== -1, file);
      assert.ok(text.indexOf('Plan Approval alone is insufficient') !== -1, file);
      assert.ok(text.indexOf('Codex subagent') === -1, file);
    });
  });

  it('agent docs and skill describe platform-neutral reviewer authorization', function() {
    ['AGENTS.md', 'SKILL.md', 'REFERENCE.md', path.join('protocols', 'sdd-riper-one.md'), path.join('protocols', 'sdd-riper-one-light.md')].forEach(function(file) {
      var text = fs.readFileSync(path.resolve(file), 'utf-8');
      assert.ok(text.indexOf('subagent:<id>') !== -1, file);
      assert.ok(text.indexOf('external-agent:<id>') !== -1, file);
      assert.ok(text.indexOf('human:<name>') !== -1, file);
      assert.match(text, /automated reviewer|自动 reviewer/, file);
      assert.match(text, /explicit current-user authorization|当前用户明确授权/, file);
      assert.match(text, /fresh task\/plan authorization|当前 Spec 的新鲜授权/, file);
      assert.ok(text.indexOf('Codex subagent') === -1, file);
    });
  });

  it('README provides a reader-first entry point and links to the detailed guide', function() {
    var readme = fs.readFileSync(path.resolve('README.md'), 'utf-8');
    assert.ok(readme.indexOf('## 三分钟开始') !== -1);
    assert.ok(readme.indexOf('## 日常怎么用') !== -1);
    assert.ok(readme.indexOf('[GUIDE.md](./GUIDE.md)') !== -1);
    assert.ok(readme.indexOf('`SKILL.md`') !== -1);
    assert.ok(readme.indexOf('`protocols/`') !== -1);
    assert.equal(readme.indexOf('Archive authorization rule:'), -1);
  });

  it('README puts AI-guided quick start before direct CLI instructions', function() {
    var readme = fs.readFileSync(path.resolve('README.md'), 'utf-8');
    var firstSectionMatch = /^##\s+(.+)$/m.exec(readme);
    var firstSection = firstSectionMatch && markdownSection(readme, firstSectionMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 2);
    var aiStart = firstSection ? firstSection.search(/(?:告诉|描述).{0,24}(?:AI|目标)|AI.{0,24}(?:带你|开始)/i) : -1;
    var cliStart = firstSection ? firstSection.search(/`sdd\s|^\s*sdd\s/m) : -1;
    assert.ok(firstSectionMatch && /AI|开始|描述目标/.test(firstSectionMatch[1]), 'README first section must be the conversational AI entry');
    assert.ok(aiStart !== -1, 'README must tell readers to start by describing the goal to AI');
    assert.ok(cliStart === -1 || cliStart > aiStart, 'natural-language AI entry must precede the first CLI command');
    assert.doesNotMatch(readme, /^#{2,3}\s+.*(?:直接用命令行|常用命令|CLI\s*命令表).*$/mi,
      'README must not expose a standalone CLI-first section');
    ['版本：', '任务名：', '目标：', '参考资料：'].forEach(function(input) {
      assert.ok(readme.indexOf(input) !== -1, input);
    });
    assert.ok(readme.indexOf('sdd install-skill --target codex') !== -1);
  });

  it('GUIDE is scenario-first while REFERENCE preserves the exact protocol', function() {
    var guide = fs.readFileSync(path.resolve('GUIDE.md'), 'utf-8');
    assert.ok(fs.existsSync(path.resolve('REFERENCE.md')), 'REFERENCE.md');
    var reference = fs.readFileSync(path.resolve('REFERENCE.md'), 'utf-8');
    var packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
    [
      '## 先看你现在要做什么',
      '## 场景一：开始一个新任务',
      '## 场景二：确认方案和计划',
      '## 场景三：执行和验证',
      '## 场景四：任务卡住或检查失败',
      '## 场景五：完成与归档'
    ].forEach(function(heading) {
      assert.ok(guide.indexOf(heading) !== -1, heading);
    });
    assert.doesNotMatch(guide, /^##\s+.*(?:Project Profile|Quality Plan|Verification|Visual|高级能力|能力菜单).*$/gmi,
      'GUIDE must not aggregate routed capabilities into a standalone feature menu');
    assert.doesNotMatch(guide, /^#{2,3}\s+.*(?:直接用命令行|常用命令|CLI\s*命令表).*$/gmi,
      'GUIDE must not expose a standalone CLI command section');
    var scenarios = ['场景一', '场景二', '场景三', '场景四', '场景五'].map(function(name) { return markdownSection(guide, name, 2); }).join('\n');
    ['Profile', 'Quality', 'Verification', 'Visual'].forEach(function(capability) {
      assert.match(scenarios, new RegExp(capability, 'i'), 'GUIDE scenarios must explain ' + capability);
    });
    assert.match(scenarios, /(?:可选|如果你想|想自己)[^\n]{0,60}(?:自查|检查|确认|查看)[\s\S]{0,180}`sdd\s/i,
      'GUIDE must retain an optional self-check command inside a scenario');
    assert.ok(guide.indexOf('[REFERENCE.md](./REFERENCE.md)') !== -1);
    assert.equal(guide.indexOf('Archive authorization rule:'), -1);
    [
      '不得自行构造归档授权参数',
      'Challenge Executed By:',
      'AC Coverage:',
      'Cruise orchestrator',
      'realpath',
      'Provider:'
    ].forEach(function(contract) {
      assert.ok(reference.indexOf(contract) !== -1, contract);
    });
    assert.ok(packageJson.files.indexOf('REFERENCE.md') !== -1);
  });

  it('REFERENCE helps humans navigate without weakening the exact protocol', function() {
    var reference = fs.readFileSync(path.resolve('REFERENCE.md'), 'utf-8');
    var usage = reference.indexOf('## 怎么使用这份参考');
    var archiveRule = reference.indexOf('当 `NEXT_ACTION: request_archive_authorization` 出现时');
    assert.ok(usage !== -1);
    assert.ok(archiveRule > usage);
    assert.ok(reference.indexOf('## 快速索引') !== -1);
    assert.ok(reference.indexOf('## 常见术语') !== -1);
    ['`Spec`', '`Gate`', '`Challenge`', '`Cruise`', '`Provider`', '`realpath`'].forEach(function(term) {
      assert.ok(reference.indexOf(term) !== -1, term);
    });
    assert.ok((reference.match(/^> 本章回答：/gm) || []).length >= 10);
    assert.equal(reference.indexOf('Archive authorization rule:'), -1);
    assert.ok(reference.indexOf('不得自行构造归档授权参数') !== -1);
    assert.ok(reference.indexOf('审计声明，不是身份认证') !== -1);
    assert.ok(reference.indexOf('--authorized-by "human:<name>" --authorization-evidence "<text>"') !== -1);
    [
      'Challenge Executed By:',
      'AC Coverage:',
      'Cruise orchestrator',
      'realpath',
      'Provider:'
    ].forEach(function(contract) {
      assert.ok(reference.indexOf(contract) !== -1, contract);
    });
  });

  it('REFERENCE routes major capabilities from facts through agent action and human gates to CLI', function() {
    var reference = fs.readFileSync(path.resolve('REFERENCE.md'), 'utf-8');
    [
      ['Project Engineering Profile', 2],
      ['Quality Policy Routing', 2],
      ['Verification Provider', 2],
      ['Visual(?: Context Guidance)?', 3],
      ['AUTONOMY_MODE', 3],
      ['Archive \\/ Reopen', 3]
    ].forEach(function(entry) {
      var capability = entry[0];
      var section = markdownSection(reference, capability, entry[1]);
      assert.ok(section, capability + ' must have a searchable section');
      assert.match(section, /(?:Trigger Facts?|触发事实)\s*[:：]/i, capability + ' must name its trigger facts');
      assert.match(section, /(?:Agent Actions?|Agent 动作)\s*[:：]/i, capability + ' must state the agent action');
      assert.match(section, /(?:Human Gates?|人工门禁)\s*[:：]/i, capability + ' must state the non-delegable human gate');
      assert.match(section, /(?:(?:Related\s+)?CLI|相关\s*CLI)\s*[:：]/i, capability + ' must point to CLI details');
    });
  });

  it('REFERENCE lists every public top-level CLI command group', function() {
    var cli = fs.readFileSync(path.resolve('bin/cli.js'), 'utf-8');
    var reference = fs.readFileSync(path.resolve('REFERENCE.md'), 'utf-8');
    var cliSection = markdownSection(reference, 'CLI 命令', 2);
    assert.ok(cliSection, 'REFERENCE must expose a stable ## CLI 命令 section');
    var groups = Array.from(new Set(Array.from(cli.matchAll(/program\s*\.\s*command\s*\(\s*(['"])([a-z][a-z-]*)(?:\s[^'"]*)?\1/g), function(match) {
      return match[2];
    })));
    assert.ok(groups.length >= 20, 'public command extraction must be non-empty and comprehensive');
    ['init', 'discover', 'autonomy', 'visual', 'verify', 'quality', 'profile'].forEach(function(sentinel) {
      assert.ok(groups.includes(sentinel), 'public command extraction missing sentinel: ' + sentinel);
    });
    groups.forEach(function(group) {
      assert.match(cliSection, new RegExp('sdd\\s+' + group + '(?:\\s|`|$)', 'm'), 'REFERENCE CLI section missing public group: ' + group);
    });
  });

  it('GFM anchor helper preserves underscores, punctuation spacing, duplicates, and ignores fences', function() {
    assert.equal(gfmSlug('Archive / Reopen'), 'archive--reopen');
    assert.equal(gfmSlug('Foo_Bar'), 'foo_bar');
    assert.deepEqual(Array.from(markdownAnchors('## Archive / Reopen\n## Foo_Bar\n## Foo_Bar\n```md\n## Hidden\n```')),
      ['archive--reopen', 'foo_bar', 'foo_bar-1']);
    assert.deepEqual(Array.from(markdownAnchors('### Child\nlabel\n## Parent')), ['child', 'parent']);
    assert.equal(markdownSection('### Child\nlabel\n#### Nested\nkeep\n## Parent\nleak', 'Child', 3), '### Child\nlabel\n#### Nested\nkeep\n');
    ['````js\n## Hidden\n````', '~~~\n## Hidden\n~~~', '   ```\n## Hidden\n   ```'].forEach(function(sample) {
      assert.equal(markdownAnchors(sample).size, 0, sample);
    });
  });

  it('REFERENCE internal Markdown links resolve to real headings', function() {
    var reference = fs.readFileSync(path.resolve('REFERENCE.md'), 'utf-8');
    var anchors = markdownAnchors(reference);
    Array.from(stripFencedCode(reference).matchAll(/\[[^\]]+\]\(#([^)]+)\)/g), function(match) { return decodeURIComponent(match[1]).toLowerCase(); }).forEach(function(anchor) {
      assert.ok(anchors.has(anchor), 'REFERENCE has a broken internal anchor: #' + anchor);
    });
  });

  it('TEAM-GUIDE contains only current governance facts', function() {
    var teamGuide = fs.readFileSync(path.resolve('TEAM-GUIDE.md'), 'utf-8');
    assert.doesNotMatch(teamGuide, /ProjectMap/i, 'TEAM-GUIDE must not require a removed ProjectMap');
    assert.doesNotMatch(teamGuide, /(?:维护|更新|编写)[^\n]{0,40}(?:持久|长期)?[^\n]{0,20}CodeMap|CodeMap[^\n]{0,40}(?:维护|更新|持久)/i,
      'TEAM-GUIDE must treat CodeMap as computed on demand, not maintained');
    assert.doesNotMatch(teamGuide, /Completion Verification Pass/i, 'TEAM-GUIDE must not retain the retired pass ledger');
    assert.doesNotMatch(teamGuide, /Mode Recommendation Gate/i, 'TEAM-GUIDE must not invent a mode recommendation gate');
    assert.doesNotMatch(teamGuide, /(?:Senior|初级|低经验|资历|经验)[^\n]{0,80}(?:standard|lite|micro)|(?:standard|lite|micro)[^\n]{0,80}(?:Senior|初级|低经验|资历|经验)/i,
      'TEAM-GUIDE must not bind mode to seniority');
    assert.doesNotMatch(teamGuide, /(?:TL|Team Lead)[^\n]{0,80}(?:负责|必须|固定)[^\n]{0,40}Plan Approved|Plan Approved[^\n]{0,80}(?:TL|Team Lead)/i,
      'TEAM-GUIDE must not assign every Plan approval to a fixed TL');
    assert.doesNotMatch(teamGuide, /Execute[^\n]{0,40}(?:零自由度|自由度[^\n]{0,10}零)/i,
      'TEAM-GUIDE must not describe Execute with the retired zero-freedom rule');
    assert.doesNotMatch(teamGuide, /Cruise[^\n]{0,160}(?:review\s*\/\s*challenge|review[^\n]{0,40}challenge)/i,
      'TEAM-GUIDE must not route Cruise through the retired review path');
    assert.doesNotMatch(teamGuide, /(?:手动|开发者|成员)[^\n]{0,100}(?:追加|填写|编辑)[^\n]{0,60}(?:archive|归档)[^\n]{0,40}(?:summary|摘要)/i,
      'TEAM-GUIDE must not require hand-written archive summaries');
    assert.doesNotMatch(teamGuide, /(?:提升|提高|降低|减少|节省|收益|效率|加速)[^\n]{0,40}\d{1,3}(?:\.\d+)?\s*[%％]|\d{1,3}(?:\.\d+)?\s*[%％][^\n]{0,40}(?:提升|提高|降低|减少|节省|收益|效率|加速)/,
      'TEAM-GUIDE must not promise unsupported percentage gains');
  });

  it('human reference docs explain archive authorization in Chinese', function() {
    ['REFERENCE.md', 'TEAM-GUIDE.md'].forEach(function(file) {
      var text = fs.readFileSync(path.resolve(file), 'utf-8');
      assert.equal(text.indexOf('Archive authorization rule:'), -1, file);
      assert.ok(text.indexOf('当前用户') !== -1, file);
      assert.ok(text.indexOf('不得自行构造') !== -1, file);
      assert.ok(text.indexOf('审计声明') !== -1, file);
      assert.ok(text.indexOf('不是身份认证') !== -1, file);
    });
  });

  it('Cruise is documented as orchestrator while Challenge reviewer remains read-only', function() {
    [
      'AGENTS.md',
      'CLAUDE.md',
      'REFERENCE.md',
      'TEAM-GUIDE.md',
      'SKILL.md',
      path.join('protocols', 'sdd-riper-one.md'),
      path.join('protocols', 'sdd-riper-one-light.md'),
      path.join('src', 'core', 'ai-config-rules.js')
    ].forEach(function(file) {
      var text = fs.readFileSync(path.resolve(file), 'utf-8');
      assert.equal(text.indexOf('Allowed Cruise writes'), -1, file);
      assert.equal(text.indexOf('Forbidden Cruise writes'), -1, file);
      assert.ok(text.indexOf('Cruise orchestrator') !== -1, file);
      assert.ok(text.indexOf('main agent') !== -1 || text.indexOf('主 Agent') !== -1, file);
      assert.ok(text.indexOf('Challenge reviewer') !== -1, file);
      assert.ok(text.indexOf('read-only') !== -1 || text.indexOf('只读') !== -1, file);
    });
  });

  it('ADR method doc exists and is wired into SKILL.md', function() {
    assert.ok(fs.existsSync(path.resolve('protocols', 'adr.md')));
    var adr = fs.readFileSync(path.resolve('protocols', 'adr.md'), 'utf-8');
    assert.ok(adr.indexOf('Selected Option / ADR') !== -1);
    assert.ok(adr.indexOf('Alternatives') !== -1);
    var skill = fs.readFileSync(path.resolve('SKILL.md'), 'utf-8');
    assert.ok(skill.indexOf('protocols/adr.md') !== -1);
  });

  it('SDD integration overrides upstream executing-plans handoffs', function() {
    var writingPlans = fs.readFileSync(path.resolve('vendored', 'superpowers', 'writing-plans', 'SKILL.md'), 'utf-8');
    var subagentDevelopment = fs.readFileSync(path.resolve('vendored', 'superpowers', 'subagent-driven-development', 'SKILL.md'), 'utf-8');
    assert.ok(writingPlans.indexOf('executing-plans') !== -1, 'upstream writing-plans reference should remain byte-identical');
    assert.ok(subagentDevelopment.indexOf('executing-plans') !== -1, 'upstream subagent reference should remain byte-identical');

    var skill = fs.readFileSync(path.resolve('SKILL.md'), 'utf-8');
    assert.ok(skill.indexOf('Do not copy the upstream Plan Document Header or Execution Handoff') !== -1);
    assert.ok(skill.indexOf('SDD Execute Phase') !== -1);
    assert.ok(skill.indexOf('host-native continuous execution') !== -1);
    assert.ok(skill.indexOf('The upstream `executing-plans` route does not apply inside SDD-RIPER') !== -1);

    var integrations = fs.readFileSync(path.resolve('INTEGRATIONS.md'), 'utf-8');
    assert.ok(integrations.indexOf('SDD adaptation takes precedence') !== -1);
    assert.ok(integrations.indexOf('executing-plans') !== -1);

    var sync = fs.readFileSync(path.resolve('vendored', 'superpowers', 'SYNC.md'), 'utf-8');
    assert.ok(sync.indexOf('Known Upstream-Only References') !== -1);
    assert.ok(sync.indexOf('Do not vendor `executing-plans`') !== -1);
    assert.ok(sync.indexOf('SDD integration overrides upstream executing-plans handoffs') !== -1);
  });

  it('doctor passes on the real repo and fails on dangling references', function() {
    var ok = run('doctor');
    assert.ok(ok.indexOf('RESULT: OK') !== -1, 'doctor should pass on the real repo: ' + ok);

    var broken = path.join(tmpBase, 'doctor-broken');
    fs.mkdirSync(broken, { recursive: true });
    fs.writeFileSync(path.join(broken, 'SKILL.md'), 'see vendored/superpowers/ghost/SKILL.md and protocols/missing.md', 'utf-8');
    fs.writeFileSync(path.join(broken, 'INTEGRATIONS.md'), '', 'utf-8');
    var bad = run('doctor ' + broken);
    assert.ok(bad.indexOf('FAIL') !== -1, 'doctor should report FAIL: ' + bad);
    assert.ok(bad.indexOf('exit:') !== -1, 'doctor should exit nonzero: ' + bad);
  });

  it('help and version', function() {
    assert.ok(run('--help').indexOf('init') !== -1);
    assert.ok(run('--help').indexOf('install-skill') !== -1);
    var installHelp = run('install-skill --help');
    assert.ok(installHelp.indexOf('cc-switch') !== -1);
    assert.ok(installHelp.indexOf('--check') !== -1);
    var challengeHelp = run('challenge --help');
    assert.ok(challengeHelp.indexOf('subagent:<id>|external-agent:<id>|human:<name>|inline') !== -1);
    assert.strictEqual(challengeHelp.indexOf('subagent|inline'), -1);
    assert.ok(run('--version').indexOf('2.0.0') !== -1);
  });

  // --- AC Coverage cross-validation tests ---

  it('validate reports AC without execution evidence (AC-001: coverage format)', function() {
    var demo = path.join(tmpBase, 'ac-cov-1');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-cov-test --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-ac-cov-test.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^(### Confirmed Requirement\n)/m, '$1AC coverage test.\n');
    c = replaceSectionStart(c, 'Innovate Options', 'Option A: with coverage. Pros: traceable. Cons: more structure.\nOption B: without coverage. Pros: flexible. Cons: weaker gates.\nSelected: Option A.');
    // Create a real test file in the project for L3 check
    var testDir = path.join(demo, 'tests');
    fs.mkdirSync(testDir, {recursive: true});
    fs.writeFileSync(path.join(testDir, 'ac-cov.test.js'), 'test("ac-cov", () => {});', 'utf-8');
    c = replaceSectionStart(c, 'Acceptance Criteria', '### AC-001: unit test passes\nRequirement: ac-cov\nType: functional\nVerification: unit\nAutomated: yes\nTest: tests/ac-cov.test.js\n\nScenario: Unit test runs\n  Given a test file\n  When npm test runs\n  Then all tests pass');
    c = fillApproval(c);
    c = fillChallenge(c, 'PASS');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', standardDesignContent());
    // Write Execute Log with AC Coverage for AC-001 (must include ## Execute Log heading)
    insertSectionContent(logFile, 'Execute Log', withCompletionContract('Step 1: implement feature\nStatus: DONE\nAC Coverage:\n  - AC-001: PASS\n    Test: tests/ac-cov.test.js\n    Method: tdd\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z'));

    var result = run('validate ' + demo + ' --archive-ready');
    assert.ok(result.indexOf('AC Coverage') === -1, 'AC-001 has coverage, should not report issue: ' + result);
  });

  it('validate blocks archive when AC has no coverage record (AC-002: L1)', function() {
    var demo = path.join(tmpBase, 'ac-cov-2');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-no-cov --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-ac-no-cov.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^(### Confirmed Requirement\n)/m, '$1AC no-coverage test.\n');
    c = replaceSectionStart(c, 'Innovate Options', 'Option A: test. Pros: ok. Cons: ok.\nSelected: Option A.');
    c = replaceSectionStart(c, 'Acceptance Criteria', '### AC-001: must have evidence\nRequirement: ac-cov-l1\nType: functional\nVerification: unit\nAutomated: yes\nTest: tests/commands.test.js');
    c = fillApproval(c);
    c = fillChallenge(c, 'PASS');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', standardDesignContent());
    // Write Execute Log with coverage for a different AC (not AC-001)
    insertSectionContent(logFile, 'Execute Log', withCompletionContract('Step 1: implement\nStatus: DONE\nAC Coverage:\n  - AC-999: PASS\n    Test: tests/commands.test.js\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z'));

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('AC-001 has no execution evidence') !== -1, 'should report missing AC-001 coverage: ' + blocked);
  });

  it('validate blocks archive when AC coverage result is FAIL (AC-002: L2)', function() {
    var demo = path.join(tmpBase, 'ac-cov-3');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-fail-cov --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-ac-fail-cov.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^(### Confirmed Requirement\n)/m, '$1AC fail coverage test.\n');
    c = replaceSectionStart(c, 'Innovate Options', 'Option A: test. Pros: ok. Cons: ok.\nSelected: Option A.');
    c = replaceSectionStart(c, 'Acceptance Criteria', '### AC-001: must pass\nRequirement: ac-cov-l2\nType: functional\nVerification: unit\nAutomated: yes\nTest: tests/commands.test.js');
    c = fillApproval(c);
    c = fillChallenge(c, 'PASS');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', standardDesignContent());
    insertSectionContent(logFile, 'Execute Log', withCompletionContract('Step 1: implement\nStatus: DONE\nAC Coverage:\n  - AC-001: FAIL\n    Test: tests/commands.test.js\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z'));

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('AC-001 verification failed') !== -1, 'should report AC-001 FAIL: ' + blocked);
  });

  it('validate blocks archive when AC test file not found (AC-002: L3)', function() {
    var demo = path.join(tmpBase, 'ac-cov-4');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-no-test-file --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-ac-no-test-file.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^(### Confirmed Requirement\n)/m, '$1AC no test file test.\n');
    c = replaceSectionStart(c, 'Innovate Options', 'Option A: test. Pros: ok. Cons: ok.\nSelected: Option A.');
    c = replaceSectionStart(c, 'Acceptance Criteria', '### AC-001: must have real test\nRequirement: ac-cov-l3\nType: functional\nVerification: unit\nAutomated: yes\nTest: tests/fake-test.js');
    c = fillApproval(c);
    c = fillChallenge(c, 'PASS');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', standardDesignContent());
    insertSectionContent(logFile, 'Execute Log', withCompletionContract('Step 1: implement\nStatus: DONE\nAC Coverage:\n  - AC-001: PASS\n    Test: tests/fake-test.js\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z'));

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Test file not found') !== -1, 'should report test file not found: ' + blocked);
  });

  it('validate blocks archive when SKIPPED AC lacks approval (AC-003)', function() {
    var demo = path.join(tmpBase, 'ac-cov-5');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-skipped --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-ac-skipped.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^(### Confirmed Requirement\n)/m, '$1AC skipped test.\n');
    c = replaceSectionStart(c, 'Innovate Options', 'Option A: test. Pros: ok. Cons: ok.\nSelected: Option A.');
    c = replaceSectionStart(c, 'Acceptance Criteria', '### AC-001: e2e coverage\nRequirement: ac-skipped\nType: functional\nVerification: e2e\nAutomated: yes\nTest: tests/e2e/login.spec.ts');
    c = fillApproval(c);
    c = fillChallenge(c, 'PASS');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', standardDesignContent());
    // SKIPPED without approval
    insertSectionContent(logFile, 'Execute Log', withCompletionContract('Step 1: implement\nStatus: DONE\nAC Coverage:\n  - AC-001: SKIPPED\n    Reason: E2E environment unavailable\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z'));

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('SKIPPED but missing Approved By') !== -1, 'should report missing Approved By: ' + blocked);
  });

  it('validate blocks archive when SKIPPED AC has agent approval (AC-003)', function() {
    var demo = path.join(tmpBase, 'ac-cov-6');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-skipped-agent --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-ac-skipped-agent.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^(### Confirmed Requirement\n)/m, '$1AC skipped agent approval test.\n');
    c = replaceSectionStart(c, 'Innovate Options', 'Option A: test. Pros: ok. Cons: ok.\nSelected: Option A.');
    c = replaceSectionStart(c, 'Acceptance Criteria', '### AC-001: e2e coverage\nRequirement: ac-skipped-agent\nType: functional\nVerification: e2e\nAutomated: yes\nTest: tests/e2e/login.spec.ts');
    c = fillApproval(c);
    c = fillChallenge(c, 'PASS');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', standardDesignContent());
    insertSectionContent(logFile, 'Execute Log', withCompletionContract('Step 1: implement\nStatus: DONE\nAC Coverage:\n  - AC-001: SKIPPED\n    Reason: E2E environment unavailable\n    Approved By: agent:codex\n    Approved At: 2026-01-01T00:00:00Z\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z'));

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Approved By must be human:<name>') !== -1, 'should reject agent approval for SKIPPED: ' + blocked);
  });

  it('validate accepts SKIPPED AC with proper human approval (AC-003)', function() {
    var demo = path.join(tmpBase, 'ac-cov-7');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-skipped-ok --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-ac-skipped-ok.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^(### Confirmed Requirement\n)/m, '$1AC skipped OK test.\n');
    c = replaceSectionStart(c, 'Innovate Options', 'Option A: test. Pros: ok. Cons: ok.\nSelected: Option A.');
    c = replaceSectionStart(c, 'Acceptance Criteria', '### AC-001: e2e coverage\nRequirement: ac-skipped-ok\nType: functional\nVerification: e2e\nAutomated: yes\nTest: tests/e2e/login.spec.ts');
    c = fillApproval(c);
    c = fillChallenge(c, 'PASS');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', standardDesignContent());
    insertSectionContent(logFile, 'Execute Log', withCompletionContract('Step 1: implement\nStatus: DONE\nAC Coverage:\n  - AC-001: SKIPPED\n    Reason: E2E environment unavailable\n    Approved By: human:reviewer\n    Approved At: 2026-01-01T00:00:00Z\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z'));

    var result = run('validate ' + demo + ' --archive-ready');
    assert.ok(result.indexOf('SKIPPED') === -1 || result.indexOf('RESULT: OK') !== -1, 'SKIPPED with approval should not block: ' + result);
  });

  it('new spec templates do not contain Review Verdict or Review Summary (AC-004)', function() {
    var demo = path.join(tmpBase, 'ac-review-merge');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name review-merge --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-review-merge.md');
    var c = fs.readFileSync(sf, 'utf-8');
    assert.ok(c.indexOf('## Review Verdict') === -1, 'standard spec should not have Review Verdict section');
    assert.ok(c.indexOf('## Review Summary') === -1, 'standard spec should not have Review Summary section');
    assert.ok(c.indexOf('Gate Policy:') === -1, 'standard spec should not have legacy Gate Policy field');
    assert.ok(c.indexOf('## Completion Verification') !== -1, 'standard spec should have Completion Verification section');

    // lite
    run('discover ' + demo + ' --task-name review-merge-lite --spec-version v1.0 --requirement x --mode lite');
    var sfLite = path.join(demo, 'mydocs', 'specs', 'v1.0-review-merge-lite.md');
    c = fs.readFileSync(sfLite, 'utf-8');
    assert.ok(c.indexOf('## Review Verdict') === -1, 'lite spec should not have Review Verdict');
    assert.ok(c.indexOf('## Review Summary') === -1, 'lite spec should not have Review Summary');
    assert.ok(c.indexOf('Gate Policy:') === -1, 'lite spec should not have legacy Gate Policy field');
    assert.ok(c.indexOf('## Completion Verification') !== -1, 'lite spec should have Completion Verification');

    // micro
    run('discover ' + demo + ' --task-name review-merge-micro --spec-version v1.0 --requirement x --mode micro');
    var sfMicro = path.join(demo, 'mydocs', 'specs', 'v1.0-review-merge-micro.md');
    c = fs.readFileSync(sfMicro, 'utf-8');
    assert.ok(c.indexOf('## Review Verdict') === -1, 'micro spec should not have Review Verdict');
    assert.ok(c.indexOf('## Review Summary') === -1, 'micro spec should not have Review Summary');
    assert.ok(c.indexOf('Gate Policy:') === -1, 'micro spec should not have legacy Gate Policy field');
    assert.ok(c.indexOf('## Completion Verification') !== -1, 'micro spec should have Completion Verification');
  });

  it('validate does not require Review Verdict for new specs (AC-004)', function() {
    var demo = path.join(tmpBase, 'ac-no-review');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name no-review --spec-version v1.0 --requirement x --mode standard');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-no-review.md');
    makeStandardArchiveReady(demo, sf);

    var result = run('validate ' + demo + ' --archive-ready');
    // Should not complain about missing Review Verdict
    assert.ok(result.indexOf('Review Verdict is empty') === -1, 'should not require Review Verdict');
    assert.ok(result.indexOf('Review Summary is empty') === -1, 'should not require Review Summary');
  });

  it('PASS_WITH_CONCERNS backtrack target is Learning Check (AC-005)', function() {
    var workflow = require(path.resolve('src/core/workflow'));
    assert.strictEqual(workflow.VERDICT_TO_TARGET.PASS_WITH_CONCERNS, 'Learning Check');
  });

  it('FAIL_CODE backtrack target is Execute / Debug', function() {
    var workflow = require(path.resolve('src/core/workflow'));
    assert.strictEqual(workflow.VERDICT_TO_TARGET.FAIL_CODE, 'Execute / Debug');
  });

  it('classifyIssue maps code quality issues to FAIL_CODE', function() {
    var workflow = require(path.resolve('src/core/workflow'));
    var issues = ['Code Challenge: hardcoded secret found in config.js'];
    assert.strictEqual(workflow.challengeVerdictFromIssues(issues), 'FAIL_CODE');
  });

  it('classifyIssue maps challenge-not-executed to FAIL_LOG not FAIL_CODE', function() {
    var workflow = require(path.resolve('src/core/workflow'));
    var issues = ['Challenge has not been executed: Challenge Executed By is empty.'];
    assert.strictEqual(workflow.challengeVerdictFromIssues(issues), 'FAIL_LOG');
  });

  it('Console phases do not include review (AC-004)', function() {
    var consoleSrc = fs.readFileSync(path.resolve('src/web/console.js'), 'utf-8');
    // phases array should not contain review
    var phasesMatch = consoleSrc.match(/var phases = \[([\s\S]*?)\];/);
    assert.ok(phasesMatch, 'should find phases array');
    assert.ok(phasesMatch[1].indexOf("'review'") === -1, 'phases should not include review');
  });

  it('templates document Provider for e2e AC without exposing transport or command', function() {
    ['spec-standard.md', 'spec-lite.md', 'spec-micro.md'].forEach(function(file) {
      var content = fs.readFileSync(path.resolve('templates', file), 'utf-8');
      assert.ok(content.indexOf('Provider: <required for e2e') !== -1, file);
      assert.ok(content.indexOf('Provider: <transport') === -1, file);
      assert.ok(content.indexOf('Provider: <command') === -1, file);
    });
  });

  it('Console exposes read-only Provider readiness and no execution button', function() {
    var html = fs.readFileSync(path.resolve('src/web/index.html'), 'utf-8');
    var consoleSrc = fs.readFileSync(path.resolve('src/web/console.js'), 'utf-8');
    assert.ok(html.indexOf('id="provider-readiness"') !== -1);
    assert.ok(consoleSrc.indexOf('function renderProviderReadiness') !== -1);
    assert.ok(consoleSrc.indexOf('verify-run-button') === -1);
  });

  it('Console spec detail adds a versioned read-only Verification projection', async function() {
    var demo = path.join(tmpBase, 'console-verification-detail');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name verification-detail --spec-version v1.0 --requirement x --mode standard');
    var specFile = path.join(demo, 'mydocs', 'specs', 'v1.0-verification-detail.md');
    insertSectionContent(specFile, 'Acceptance Criteria', [
      '### AC-003: Console works',
      'Requirement: console evidence',
      'Type: functional',
      'Verification: e2e',
      'Provider: console-e2e',
      'Automated: yes',
      'Test: tests/console.spec.js'
    ].join('\n'));
    fs.writeFileSync(path.join(demo, '.sdd-verification.json'), JSON.stringify({
      schemaVersion: 1,
      providers: {
        'console-e2e': {
          adapter: 'playwright-test', workspaceRoot: '.', packageRoot: 'apps/web',
          config: 'apps/web/playwright.config.js', projects: ['chromium']
        }
      }
    }), 'utf-8');

    var server = require('../src/commands/console').createServer(demo);
    await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
    try {
      var list = await waitForSpecs(server, 1);
      assert.equal(Object.prototype.hasOwnProperty.call(list.body.specs[0], 'verification'), false);
      var detail = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id));
      assert.equal(detail.statusCode, 200);
      assert.equal(detail.body.verification.schemaVersion, 1);
      assert.equal(detail.body.verification.providers[0].id, 'console-e2e');
      var cached = require('../src/core/spec-index').getSpec(demo, list.body.specs[0].id);
      assert.equal(Object.prototype.hasOwnProperty.call(cached, 'verification'), false, 'detail response must not mutate cached spec facts');
      var html = fs.readFileSync(path.resolve('src/web/index.html'), 'utf-8');
      assert.doesNotMatch(html, /verify-run-button|verify-init-button/);
    } finally {
      await new Promise(function(resolve) { server.close(resolve); });
    }
  });

  it('Console renders Verification runs, freshness, matrix, diagnostics, attachments, and responsive empty states', function() {
    var html = fs.readFileSync(path.resolve('src/web/index.html'), 'utf-8');
    var js = fs.readFileSync(path.resolve('src/web/console.js'), 'utf-8');
    var css = fs.readFileSync(path.resolve('src/web/console.css'), 'utf-8');
    ['verification-summary', 'verification-runs', 'verification-matrix', 'verification-details'].forEach(function(id) {
      assert.ok(html.indexOf('id="' + id + '"') !== -1, id + ' section is required');
    });
    assert.ok(js.indexOf('function renderVerificationEvidence') !== -1);
    assert.ok(js.indexOf('configured-no-runs') !== -1);
    assert.ok(js.indexOf('freshnessReasons') !== -1);
    assert.ok(js.indexOf('attachment.path') !== -1);
    assert.ok(css.indexOf('.verification-scroll') !== -1);
    assert.match(css, /\.verification-scroll\s*\{[^}]*overflow-x:\s*auto/s);
    assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*\.verification-provider-grid/s);
    assert.doesNotMatch(html + js, /verify-run-button|verify-init-button/);
  });

  it('docs state the v3.0 adapter scope and deferred boundaries', function() {
    var docs = ['README.md', 'GUIDE.md', 'REFERENCE.md', 'TEAM-GUIDE.md'].map(function(file) {
      return fs.readFileSync(path.resolve(file), 'utf-8');
    }).join('\n');
    assert.ok(docs.indexOf('playwright-test') !== -1);
    assert.ok(docs.indexOf('playwright-mcp') !== -1);
    assert.ok(docs.indexOf('不自动降级') !== -1);
    assert.ok(docs.indexOf('Yarn PnP') !== -1);
  });
});
