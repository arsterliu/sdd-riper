const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execSync } = require('child_process');

const CLI = 'node ' + path.resolve('bin/cli.js');
const tmpBase = path.join(os.tmpdir(), 'sdd-cmd-test-' + Date.now());

function run(args) {
  try {
    return execSync(CLI + ' ' + args, { encoding: 'utf-8', cwd: tmpBase });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '') + ' exit:' + (e.status || 1);
  }
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
  var marker = headingNames(heading).map(function(name) { return '## ' + name + '\n'; })
    .find(function(candidate) { return content.indexOf(candidate) !== -1; });
  assert.ok(marker, file + ' missing section ' + heading);
  fs.writeFileSync(file, content.replace(marker, marker + body + '\n'), 'utf-8');
}

function replaceSectionStart(content, heading, body) {
  var marker = headingNames(heading).map(function(name) { return '## ' + name + '\n'; })
    .find(function(candidate) { return content.indexOf(candidate) !== -1; });
  assert.ok(marker, 'missing section ' + heading);
  return content.replace(marker, marker + body + '\n');
}

function fillApproval(content) {
  return content
    .replace(/^Plan Approved By:$/m, 'Plan Approved By: Tester')
    .replace(/^Approved At:$/m, 'Approved At: 2026-01-01T00:00:00Z');
}

function fillChallenge(content, verdict, opts) {
  opts = opts || {};
  return content
    .replace(/^Challenge Verdict:$/m, 'Challenge Verdict: ' + verdict)
    .replace(/^Backtrack Target:$/m, 'Backtrack Target: ' + (opts.backtrack || 'Ready'))
    .replace(/^Challenge Summary:$/m, 'Challenge Summary: ' + (opts.summary || 'ok.'))
    .replace(/^Challenge Executed By:$/m, 'Challenge Executed By: ' + (opts.executedBy || 'subagent'))
    .replace(/^Challenge Executed At:$/m, 'Challenge Executed At: ' + (opts.executedAt || '2026-01-01T00:01:00Z'))
    .replace(/^Challenge Evidence:$/m, 'Challenge Evidence: ' + (opts.evidence || 'PASS - independent review'));
}

function fillAutoApproval(content) {
  return content
    .replace(/^Plan Approved By:$/m, 'Plan Approved By: auto-gate')
    .replace(/^Approved At:$/m, 'Approved At: 2026-01-01T00:00:00Z\nGate Evidence: validate-ready evidence recorded by auto gate.');
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
  var content = fs.readFileSync(specFile, 'utf-8');
  content = content
    .replace(/^(### Confirmed Requirement\n)/m, '$1交付一个通过门禁校验的归档流程。\n');
  content = replaceSectionStart(content, 'Innovate Options', 'Option A: 保留校验后的归档流程。Pros: 简单。Cons: 仅测试覆盖。\nOption B: 跳过归档。Pros: 无。Cons: 无法覆盖。\nSelected: 方案 A。');
  content = replaceSectionStart(content, 'Acceptance Criteria', '### AC-001: 完整 standard spec 可以归档\nRequirement: archive-flow\nType: functional\nVerification: unit\nAutomated: yes\nTest: tests/commands.test.js\n\nScenario: 有效 standard spec\n  Given standard spec 包含设计、AC、审批、执行日志和 PASS 评审\n  When archive 执行\n  Then spec 被移动到 archive');
  content = fillApproval(content);
  // Fill Challenge fields (Completion Verification section replaces old Review Verdict)
  content = content
    .replace(/^Challenge Verdict:$/m, 'Challenge Verdict: PASS')
    .replace(/^Backtrack Target:$/m, 'Backtrack Target: Ready')
    .replace(/^Challenge Summary:$/m, 'Challenge Summary: all gates pass.')
    .replace(/^Challenge Executed By:$/m, 'Challenge Executed By: subagent')
    .replace(/^Challenge Executed At:$/m, 'Challenge Executed At: 2026-01-01T00:01:00Z')
    .replace(/^Challenge Evidence:$/m, 'Challenge Evidence: PASS - independent review');
  fs.writeFileSync(specFile, content, 'utf-8');
  insertSectionContent(designFile, 'Technical Design', standardDesignContent());
  insertSectionContent(logFile, 'Execute Log', 'Step 1: test\nStatus: DONE\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');
  return { designFile: designFile, logFile: logFile };
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
    assert.match(configText, /^GATE_POLICY="auto"$/m);
    assert.match(configText, /^CRUISE_POLICY="autonomous"$/m);
    assert.match(configText, /^CRUISE_MAX_ITERATIONS="5"$/m);
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'specs', '.gitkeep')));
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'design', '.gitkeep')));
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'logs', '.gitkeep')));
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'learnings', '.gitkeep')));
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'runs', '.gitkeep')));
    var agentsText = fs.readFileSync(path.join(tmpBase, 'demo', 'AGENTS.md'), 'utf-8');
    var claudeText = fs.readFileSync(path.join(tmpBase, 'demo', 'CLAUDE.md'), 'utf-8');
    assert.ok(agentsText.indexOf('Chinese Artifact Content') !== -1);
    assert.ok(agentsText.indexOf('Plan Approved By') !== -1);
    assert.ok(claudeText.indexOf('filled artifact content in Chinese') !== -1);
  });

  it('discover creates spec, design, and execute log artifacts', function() {
    var demo = path.join(tmpBase, 'd2');
    run('init ' + demo + ' --mode standard');
    var out = run('discover ' + demo + ' --task-name my-login --spec-version v1.0 --requirement login');
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

  it('discover accepts --version alias and fills structured intake fields', function() {
    var demo = path.join(tmpBase, 'd2b');
    run('init ' + demo + ' --mode standard');
    var out = run('discover ' + demo + ' --task-name my-login --version v1.0 --requirement login --goal auth --constraints none');
    assert.ok(out.indexOf('SPEC CREATION PROMPT') !== -1);
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-my-login.md');
    var c = fs.readFileSync(sf, 'utf-8');
    assert.match(c, /^date: \d{4}-\d{2}-\d{2}$/m);
    assert.match(c, /^diff-base:/m);
    assert.ok(c.indexOf('## Intake') !== -1);
    assert.ok(c.indexOf('## ' + 'Invoc' + 'ation') === -1);
    assert.ok(c.indexOf('### Requirement\nrequirement: login\ngoal: auth') !== -1);
    assert.ok(c.indexOf('### Constraints\nconstraints: none') !== -1);
  });

  it('resume and status work', function() {
    var demo = path.join(tmpBase, 'd3');
    run('init ' + demo + ' --mode standard');
    assert.ok(run('resume ' + demo).indexOf('PHASE_HINT: new_task') !== -1);
    assert.ok(run('status ' + demo).indexOf('Structure:    OK') !== -1);
  });

  it('archive and reopen flow moves referenced artifacts', function() {
    var demo = path.join(tmpBase, 'd4');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name arch --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-arch.md');
    var artifacts = makeStandardArchiveReady(demo, sf);
    var out = run('archive ' + demo + ' arch');
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

  it('archive requires and moves learning records when execution produced reusable lessons', function() {
    var demo = path.join(tmpBase, 'd4l');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name lessoned --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-lessoned.md');
    var artifacts = makeStandardArchiveReady(demo, sf);
    var logContent = fs.readFileSync(artifacts.logFile, 'utf-8')
      .replace('Status: DONE', 'Status: DEVIATED_MINOR');
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

    var archived = run('archive ' + demo + ' lessoned');
    assert.ok(archived.indexOf('[LEARNING]') !== -1);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'archive', 'v1.0-lessoned.learning.md')));
    var archivedSpec = fs.readFileSync(path.join(demo, 'mydocs', 'archive', 'v1.0-lessoned.md'), 'utf-8');
    assert.ok(archivedSpec.indexOf('learning-file: "mydocs/archive/v1.0-lessoned.learning.md"') !== -1);
  });

  it('validate blocks archive when required gates are missing', function() {
    var demo = path.join(tmpBase, 'd4b');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name blocked --spec-version v1.0 --requirement x');
    var out = run('archive ' + demo + ' blocked');
    assert.ok(out.indexOf('Spec is not archive-ready') !== -1);
    assert.ok(out.indexOf('Plan Approved By is empty') !== -1);
    assert.ok(out.indexOf('Technical Design is empty') !== -1);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'specs', 'v1.0-blocked.md')));
  });

  it('validate enforces standard technical design contract fields', function() {
    var demo = path.join(tmpBase, 'd4s');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name strict-design --spec-version v1.0 --requirement x');
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

  it('validate supports auto gate approval only with gate evidence', function() {
    var demo = path.join(tmpBase, 'd4g');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name auto-gate --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-auto-gate.md');
    makeStandardArchiveReady(demo, sf);
    var content = fs.readFileSync(sf, 'utf-8')
      .replace('Plan Approved By: Tester', 'Plan Approved By: auto-gate');
    fs.writeFileSync(sf, content, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Gate Evidence is required for auto-gate approval') !== -1);

    fs.writeFileSync(sf, content.replace('Approved At: 2026-01-01T00:00:00Z', 'Approved At: 2026-01-01T00:00:00Z\nGate Evidence: validate-ready evidence recorded by auto gate.'), 'utf-8');
    var ok = run('validate ' + demo + ' --archive-ready');
    assert.ok(ok.indexOf('RESULT: OK') !== -1);
  });

  it('validate blocks archive when adversarial challenge failed', function() {
    var demo = path.join(tmpBase, 'd4h');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-fail --spec-version v1.0 --requirement x');
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
    run('discover ' + demo + ' --task-name challenge-evidence --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-evidence.md');
    makeStandardArchiveReady(demo, sf);
    // Remove challenge evidence to test that validate catches the missing fields
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/Challenge Executed By:.*\n/, 'Challenge Executed By:\n');
    c = c.replace(/Challenge Executed At:.*\n/, 'Challenge Executed At:\n');
    c = c.replace(/Challenge Evidence:.*\n/, 'Challenge Evidence:\n');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Challenge Executed By is empty') !== -1, 'missing Executed By');
  });

  it('validate requires Challenge Executed At when Executed By is present', function() {
    var demo = path.join(tmpBase, 'd4i2');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-at --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-at.md');
    makeStandardArchiveReady(demo, sf);
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/Challenge Executed At:.*\n/, 'Challenge Executed At:\n');
    c = c.replace(/Challenge Evidence:.*\n/, 'Challenge Evidence:\n');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Challenge Executed At is empty') !== -1, 'missing Executed At');
  });

  it('validate requires Challenge Evidence when Executed By and At are present', function() {
    var demo = path.join(tmpBase, 'd4i3');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-ev --spec-version v1.0 --requirement x');
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
    insertSectionContent(logFile, 'Execute Log', 'Step 1: DONE\n');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Standard and lite modes require subagent Challenge execution') !== -1);
  });

  it('validate passes when challenge evidence is complete (AC-002)', function() {
    var demo = path.join(tmpBase, 'd4j');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-ok --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-ok.md');
    makeStandardArchiveReady(demo, sf);

    var result = run('validate ' + demo + ' --archive-ready');
    assert.ok(result.indexOf('Challenge Executed By') === -1, 'no challenge evidence issues');
  });

  it('validate rejects auto-gate challenge under manual policy (AC-003)', function() {
    var demo = path.join(tmpBase, 'd4k');
    run('init ' + demo + ' --mode standard');
    fs.writeFileSync(path.join(demo, '.sdd-config'), 'GATE_POLICY=manual\n');
    run('discover ' + demo + ' --task-name challenge-manual --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-manual.md');
    makeStandardArchiveReady(demo, sf);
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^Challenge Executed By:.*$/m, 'Challenge Executed By: auto-gate');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Manual gate policy requires human Challenge Executed By') !== -1);
  });

  it('validate rejects inline challenge for standard/lite modes (AC-004)', function() {
    var demo = path.join(tmpBase, 'd4l');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name challenge-inline-std --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-inline-std.md');
    makeStandardArchiveReady(demo, sf);
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^Challenge Executed By:.*$/m, 'Challenge Executed By: inline');
    fs.writeFileSync(sf, c, 'utf-8');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Standard and lite modes require subagent Challenge execution') !== -1);
  });

  it('validate allows inline challenge for micro mode (AC-005)', function() {
    var demo = path.join(tmpBase, 'd4m');
    run('init ' + demo + ' --mode micro');
    run('discover ' + demo + ' --task-name challenge-inline-micro --spec-version v1.0 --requirement x --mode micro');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-challenge-inline-micro.md');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/## Plan/, '## Plan\n\nImpact Scope: single file\nData Impact: none\nInterface Impact: none\nAcceptance: behavior preserved\nVerification: unit test\n\nPlan Approved By: auto-gate\nApproved At: 2026-06-30T00:00:00Z\nGate Policy: auto\nGate Evidence: micro plan complete');
    c = fillChallenge(c, 'PASS', { executedBy: 'inline', evidence: 'PASS - inline review for micro' });
    fs.writeFileSync(sf, c);
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    fs.writeFileSync(logFile, 'Step 1: DONE\n');

    var result = run('validate ' + demo + ' --archive-ready');
    assert.ok(result.indexOf('Challenge Executed By') === -1 || result.indexOf('inline') === -1, 'micro allows inline');
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
    insertSectionContent(logFile, 'Execute Log', 'Step 1: test\nStatus: DONE\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');
    var ok = run('validate ' + demo + ' --archive-ready');
    assert.ok(ok.indexOf('RESULT: OK') !== -1);
  });

  it('validate requires acceptance verification metadata', function() {
    var demo = path.join(tmpBase, 'd4v');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-verification --spec-version v1.0 --requirement x');
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
    insertSectionContent(logFile, 'Execute Log', 'Step 1: test\nStatus: DONE\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');

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

  it('generated artifacts keep English labels and request Chinese content', function() {
    var demo = path.join(tmpBase, 'd4e');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name english-labels --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-english-labels.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var specText = fs.readFileSync(sf, 'utf-8');
    var designText = fs.readFileSync(designFile, 'utf-8');
    var logText = fs.readFileSync(logFile, 'utf-8');
    assert.ok(specText.indexOf('## Acceptance Criteria') !== -1);
    assert.ok(specText.indexOf('Plan Approved By:') !== -1);
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
    insertSectionContent(logFile, 'Execute Log', 'Step 1: test\nStatus: DONE\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');
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
    assert.ok(run('build-context-bundle ' + demo + ' --spec-version v1.0 --out b').indexOf('BUILD CONTEXT BUNDLE PROMPT') !== -1);
    assert.ok(run('review-execute ' + demo).indexOf('REVIEW EXECUTE PROMPT') !== -1);
    run('discover ' + demo + ' --task-name dbg --spec-version v1.0 --requirement x');
    assert.ok(run('debug ' + demo + ' --error e').indexOf('DEBUG PROMPT') !== -1);
  });

  it('next, challenge, and cruise expose autonomous workflow prompts', function() {
    var demo = path.join(tmpBase, 'd6c');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name cruise-task --spec-version v1.0 --requirement x');

    var next = run('next ' + demo);
    assert.ok(next.indexOf('NEXT_ACTION: repair_research') !== -1);
    assert.ok(next.indexOf('BACKTRACK_TARGET: Research') !== -1);
    assert.ok(next.indexOf('GATE_POLICY: auto') !== -1);
    assert.ok(next.indexOf('CRUISE_POLICY: autonomous') !== -1);

    var challenge = run('challenge ' + demo);
    assert.ok(challenge.indexOf('ADVERSARIAL REVIEW PROMPT') !== -1);
    assert.ok(challenge.indexOf('Research Challenge') !== -1);
    assert.ok(challenge.indexOf('Design Challenge') !== -1);
    assert.ok(challenge.indexOf('Acceptance Challenge') !== -1);
    assert.ok(challenge.indexOf('Plan Challenge') !== -1);
    assert.ok(challenge.indexOf('Execute Challenge') !== -1);
    assert.ok(challenge.indexOf('Archive Challenge') !== -1);
    assert.ok(challenge.indexOf('FAIL_DESIGN') !== -1);

    var cruise = run('cruise ' + demo);
    assert.ok(cruise.indexOf('AUTONOMOUS CRUISE PROMPT') !== -1);
    assert.ok(cruise.indexOf('ENGINE: auto') !== -1);
    assert.ok(cruise.indexOf('REUSE_NATIVE_LOOP: yes-when-available') !== -1);
    assert.ok(cruise.indexOf('MAX_ITERATIONS: 5') !== -1);
    assert.ok(cruise.indexOf('repair loop') !== -1);
    assert.ok(cruise.indexOf('sdd validate') !== -1);
    assert.ok(cruise.indexOf('sdd challenge') !== -1);
  });

  it('cruise can target native host loop engines', function() {
    var demo = path.join(tmpBase, 'd6e');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name native-loop --spec-version v1.0 --requirement x');

    var claude = run('cruise ' + demo + ' --engine claude-code');
    assert.ok(claude.indexOf('ENGINE: claude-code') !== -1);
    assert.ok(claude.indexOf('Claude Code Dynamic Workflows') !== -1);
    assert.ok(claude.indexOf('fallback to the prompt loop') !== -1);

    var codex = run('cruise ' + demo + ' --engine codex');
    assert.ok(codex.indexOf('ENGINE: codex') !== -1);
    assert.ok(codex.indexOf('Codex native loop') !== -1);
    assert.ok(codex.indexOf('SDD remains the control protocol') !== -1);

    var opencode = run('cruise ' + demo + ' --engine opencode');
    assert.ok(opencode.indexOf('ENGINE: opencode') !== -1);
    assert.ok(opencode.indexOf('opencode native loop') !== -1);
    assert.ok(opencode.indexOf('SDD remains the control protocol') !== -1);
  });

  it('next preserves explicit challenge PASS even when validation has blockers', function() {
    var demo = path.join(tmpBase, 'd6h');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name stale-pass --spec-version v1.0 --requirement x');
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

  it('cruise respects off and assisted cruise policies', function() {
    var offDemo = path.join(tmpBase, 'd6i');
    run('init ' + offDemo + ' --mode standard');
    run('discover ' + offDemo + ' --task-name cruise-off --spec-version v1.0 --requirement x');
    fs.writeFileSync(path.join(offDemo, '.sdd-config'),
      'DOCS_DIR="mydocs"\nMODE="standard"\nCRUISE_POLICY="off"\n', 'utf-8');

    var off = run('cruise ' + offDemo + ' --record-run');
    var offLedger = path.join(offDemo, 'mydocs', 'runs', 'v1.0-cruise-off.cruise.jsonl');
    assert.ok(off.indexOf('CRUISE_DISABLED: true') !== -1);
    assert.equal(off.indexOf('### Autonomous repair loop'), -1);
    assert.ok(!fs.existsSync(offLedger));

    var assistedDemo = path.join(tmpBase, 'd6j');
    run('init ' + assistedDemo + ' --mode standard');
    run('discover ' + assistedDemo + ' --task-name cruise-assisted --spec-version v1.0 --requirement x');
    fs.writeFileSync(path.join(assistedDemo, '.sdd-config'),
      'DOCS_DIR="mydocs"\nMODE="standard"\nCRUISE_POLICY="assisted"\n', 'utf-8');

    var assisted = run('cruise ' + assistedDemo + ' --engine auto');
    assert.ok(assisted.indexOf('## ASSISTED CRUISE PROMPT') !== -1);
    assert.ok(assisted.indexOf('ASSISTED_REVIEW_REQUIRED: true') !== -1);
    assert.ok(assisted.indexOf('REUSE_NATIVE_LOOP: no') !== -1);
  });

  it('cruise reports local-loop as prompt-loop compensation', function() {
    var demo = path.join(tmpBase, 'd6k');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name local-loop-copy --spec-version v1.0 --requirement x');

    var out = run('cruise ' + demo + ' --engine local-loop');
    assert.ok(out.indexOf('prompt-loop compensation') !== -1);
    assert.equal(out.indexOf('local bounded loop wrapper'), -1);
  });

  it('cruise rejects invalid engines instead of falling back to auto', function() {
    var demo = path.join(tmpBase, 'd6l');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name bad-engine --spec-version v1.0 --requirement x');

    var out = run('cruise ' + demo + ' --engine typo-engine');
    assert.ok(out.indexOf('Invalid cruise engine: typo-engine') !== -1);
    assert.ok(out.indexOf('exit:') !== -1);
  });

  it('cruise emits Claude ultracode prompt and records run ledger', function() {
    var demo = path.join(tmpBase, 'd6f');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name workflow-run --spec-version v1.0 --requirement x');

    var emitted = run('cruise ' + demo + ' --engine claude-code --emit-claude-prompt');
    var workflowFile = path.join(demo, '.claude', 'workflows', 'sdd-cruise.md');
    assert.ok(emitted.indexOf('[CLAUDE_PROMPT]') !== -1);
    assert.ok(emitted.indexOf('ultracode:') !== -1);
    assert.ok(emitted.indexOf('/effort ultracode') !== -1);
    assert.ok(emitted.indexOf('sdd next') !== -1);
    assert.ok(emitted.indexOf('sdd validate') !== -1);
    assert.ok(emitted.indexOf('sdd challenge') !== -1);
    assert.ok(emitted.indexOf('--record-run') !== -1);
    assert.ok(!fs.existsSync(workflowFile));

    var recorded = run('cruise ' + demo + ' --engine local-loop --record-run --iteration 3');
    var ledgerFile = path.join(demo, 'mydocs', 'runs', 'v1.0-workflow-run.cruise.jsonl');
    assert.ok(recorded.indexOf('[RUN_LEDGER]') !== -1);
    assert.ok(fs.existsSync(ledgerFile));
    var lines = fs.readFileSync(ledgerFile, 'utf-8').trim().split(/\r?\n/);
    assert.equal(lines.length, 1);
    var entry = JSON.parse(lines[0]);
    assert.equal(entry.iteration, 3);
    assert.equal(entry.engine, 'local-loop');
    assert.equal(entry.nextAction, 'repair_research');
    assert.equal(entry.backtrackTarget, 'Research');
    assert.equal(entry.challengeVerdict, 'FAIL_SPEC');
    assert.equal(entry.stopReason, 'continue');
  });

  it('console spec detail exposes latest cruise run ledger entry', async function() {
    var demo = path.join(tmpBase, 'd6g');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name console-run --spec-version v1.0 --requirement x');
    fs.writeFileSync(path.join(demo, 'mydocs', 'runs', 'v1.0-console-run.cruise.jsonl'), 'bad-json\n', 'utf-8');
    run('cruise ' + demo + ' --engine local-loop --record-run --iteration 2');

    var server = require('../src/commands/console').createServer(demo);
    await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
    try {
      var list = await waitForSpecs(server, 1);
      var detail = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id));
      assert.equal(detail.statusCode, 200);
      assert.equal(detail.body.cruiseRun.count, 1);
      assert.equal(detail.body.cruiseRun.malformedCount, 1);
      assert.equal(detail.body.cruiseRun.latest.iteration, 2);
      assert.equal(detail.body.cruiseRun.latest.engine, 'local-loop');
      assert.equal(detail.body.cruiseRun.latest.nextAction, 'repair_research');
    } finally {
      await new Promise(function(resolve) { server.close(resolve); });
    }
  });

  it('next maps missing acceptance metadata to FAIL_ACCEPTANCE backtrack', function() {
    var demo = path.join(tmpBase, 'd6d');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name acceptance-backtrack --spec-version v1.0 --requirement x');
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
    insertSectionContent(logFile, 'Execute Log', 'Step 1: test\nStatus: DONE\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');

    var out = run('next ' + demo);
    assert.ok(out.indexOf('CHALLENGE_VERDICT: FAIL_ACCEPTANCE') !== -1);
    assert.ok(out.indexOf('BACKTRACK_TARGET: Acceptance') !== -1);
  });

  it('review-execute includes design and acceptance evidence in Axis 1', function() {
    var demo = path.join(tmpBase, 'd6b');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name review-design --spec-version v1.0 --requirement x');
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
    run('discover ' + demo + ' --task-name pay-retry --spec-version v1.0 --requirement "payment retry idempotency"');
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
  });

  it('console API exposes spec list, detail, and archive validation', async function() {
    var demo = path.join(tmpBase, 'd7');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name console-task --spec-version v1.0 --requirement x');
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
      assert.equal(detail.body.workflow.gatePolicy, 'auto');
      assert.equal(detail.body.workflow.cruisePolicy, 'autonomous');
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
    run('discover ' + demo + ' --task-name selectable-task --spec-version v1.0 --requirement x');
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
    run('discover ' + demo + ' --task-name browsed-task --spec-version v1.0 --requirement x');
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
    run('discover ' + demoA + ' --task-name board-a --spec-version v1.0 --requirement x');
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
    assert.ok(js.indexOf('auto-gate also needs Gate Evidence') !== -1);
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

  it('console renders AC Coverage with completion verification and coverage issues', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    var css = fs.readFileSync(path.resolve('src', 'web', 'console.css'), 'utf-8');
    assert.ok(js.indexOf('renderAcCoverage') !== -1, 'renderAcCoverage function exists');
    assert.ok(js.indexOf('ac-coverage-summary') !== -1, 'ac-coverage-summary class used');
    assert.ok(js.indexOf('ac-coverage-item') !== -1, 'ac-coverage-item class used');
    assert.ok(js.indexOf('completionVerification') !== -1, 'reads completionVerification from completion');
    assert.ok(js.indexOf('No AC Coverage data') !== -1, 'empty state text present');
    assert.ok(js.indexOf('All ACs covered') !== -1, 'all-pass state text present');
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

  it('console renders cruise run with policy, iterations, and latest run (AC-003)', function() {
    var js = fs.readFileSync(path.resolve('src', 'web', 'console.js'), 'utf-8');
    var html = fs.readFileSync(path.resolve('src', 'web', 'index.html'), 'utf-8');
    assert.ok(js.indexOf('renderCruiseRun') !== -1, 'renderCruiseRun function exists');
    assert.ok(js.indexOf('cruisePolicy') !== -1, 'reads cruisePolicy');
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
    run('discover ' + demo + ' --task-name method-route --spec-version v1.0 --requirement x');
    var out = run('next ' + demo);
    assert.ok(out.indexOf('DESIGN_METHOD:') !== -1);
    assert.ok(out.indexOf('arc42') !== -1);
  });

  it('ADR method doc exists and is wired into SKILL.md', function() {
    assert.ok(fs.existsSync(path.resolve('protocols', 'adr.md')));
    var adr = fs.readFileSync(path.resolve('protocols', 'adr.md'), 'utf-8');
    assert.ok(adr.indexOf('Selected Option / ADR') !== -1);
    assert.ok(adr.indexOf('Alternatives') !== -1);
    var skill = fs.readFileSync(path.resolve('SKILL.md'), 'utf-8');
    assert.ok(skill.indexOf('protocols/adr.md') !== -1);
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
    assert.ok(run('install-skill --help').indexOf('cc-switch') !== -1);
    assert.ok(run('--version').indexOf('2.0.0') !== -1);
  });

  // --- AC Coverage cross-validation tests ---

  it('validate reports AC without execution evidence (AC-001: coverage format)', function() {
    var demo = path.join(tmpBase, 'ac-cov-1');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-cov-test --spec-version v1.0 --requirement x');
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
    insertSectionContent(logFile, 'Execute Log', 'Step 1: implement feature\nStatus: DONE\nAC Coverage:\n  - AC-001: PASS\n    Test: tests/ac-cov.test.js\n    Method: tdd\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');

    var result = run('validate ' + demo + ' --archive-ready');
    assert.ok(result.indexOf('AC Coverage') === -1, 'AC-001 has coverage, should not report issue: ' + result);
  });

  it('validate blocks archive when AC has no coverage record (AC-002: L1)', function() {
    var demo = path.join(tmpBase, 'ac-cov-2');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-no-cov --spec-version v1.0 --requirement x');
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
    insertSectionContent(logFile, 'Execute Log', 'Step 1: implement\nStatus: DONE\nAC Coverage:\n  - AC-999: PASS\n    Test: tests/commands.test.js\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('AC-001 has no execution evidence') !== -1, 'should report missing AC-001 coverage: ' + blocked);
  });

  it('validate blocks archive when AC coverage result is FAIL (AC-002: L2)', function() {
    var demo = path.join(tmpBase, 'ac-cov-3');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-fail-cov --spec-version v1.0 --requirement x');
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
    insertSectionContent(logFile, 'Execute Log', 'Step 1: implement\nStatus: DONE\nAC Coverage:\n  - AC-001: FAIL\n    Test: tests/commands.test.js\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('AC-001 verification failed') !== -1, 'should report AC-001 FAIL: ' + blocked);
  });

  it('validate blocks archive when AC test file not found (AC-002: L3)', function() {
    var demo = path.join(tmpBase, 'ac-cov-4');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-no-test-file --spec-version v1.0 --requirement x');
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
    insertSectionContent(logFile, 'Execute Log', 'Step 1: implement\nStatus: DONE\nAC Coverage:\n  - AC-001: PASS\n    Test: tests/fake-test.js\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Test file not found') !== -1, 'should report test file not found: ' + blocked);
  });

  it('validate blocks archive when SKIPPED AC lacks approval (AC-003)', function() {
    var demo = path.join(tmpBase, 'ac-cov-5');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-skipped --spec-version v1.0 --requirement x');
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
    insertSectionContent(logFile, 'Execute Log', 'Step 1: implement\nStatus: DONE\nAC Coverage:\n  - AC-001: SKIPPED\n    Reason: E2E environment unavailable\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('SKIPPED but missing Approved By') !== -1, 'should report missing Approved By: ' + blocked);
  });

  it('validate blocks archive when SKIPPED AC has auto-gate approval (AC-003)', function() {
    var demo = path.join(tmpBase, 'ac-cov-6');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-skipped-auto --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-ac-skipped-auto.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c.replace(/^(### Confirmed Requirement\n)/m, '$1AC skipped auto-gate test.\n');
    c = replaceSectionStart(c, 'Innovate Options', 'Option A: test. Pros: ok. Cons: ok.\nSelected: Option A.');
    c = replaceSectionStart(c, 'Acceptance Criteria', '### AC-001: e2e coverage\nRequirement: ac-skipped-auto\nType: functional\nVerification: e2e\nAutomated: yes\nTest: tests/e2e/login.spec.ts');
    c = fillApproval(c);
    c = fillChallenge(c, 'PASS');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', standardDesignContent());
    insertSectionContent(logFile, 'Execute Log', 'Step 1: implement\nStatus: DONE\nAC Coverage:\n  - AC-001: SKIPPED\n    Reason: E2E environment unavailable\n    Approved By: auto-gate\n    Approved At: 2026-01-01T00:00:00Z\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Approved By cannot be auto-gate') !== -1, 'should reject auto-gate for SKIPPED: ' + blocked);
  });

  it('validate accepts SKIPPED AC with proper human approval (AC-003)', function() {
    var demo = path.join(tmpBase, 'ac-cov-7');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name ac-skipped-ok --spec-version v1.0 --requirement x');
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
    insertSectionContent(logFile, 'Execute Log', 'Step 1: implement\nStatus: DONE\nAC Coverage:\n  - AC-001: SKIPPED\n    Reason: E2E environment unavailable\n    Approved By: human-reviewer\n    Approved At: 2026-01-01T00:00:00Z\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');

    var result = run('validate ' + demo + ' --archive-ready');
    assert.ok(result.indexOf('SKIPPED') === -1 || result.indexOf('RESULT: OK') !== -1, 'SKIPPED with approval should not block: ' + result);
  });

  it('new spec templates do not contain Review Verdict or Review Summary (AC-004)', function() {
    var demo = path.join(tmpBase, 'ac-review-merge');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name review-merge --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-review-merge.md');
    var c = fs.readFileSync(sf, 'utf-8');
    assert.ok(c.indexOf('## Review Verdict') === -1, 'standard spec should not have Review Verdict section');
    assert.ok(c.indexOf('## Review Summary') === -1, 'standard spec should not have Review Summary section');
    assert.ok(c.indexOf('## Completion Verification') !== -1, 'standard spec should have Completion Verification section');

    // lite
    run('discover ' + demo + ' --task-name review-merge-lite --spec-version v1.0 --requirement x --mode lite');
    var sfLite = path.join(demo, 'mydocs', 'specs', 'v1.0-review-merge-lite.md');
    c = fs.readFileSync(sfLite, 'utf-8');
    assert.ok(c.indexOf('## Review Verdict') === -1, 'lite spec should not have Review Verdict');
    assert.ok(c.indexOf('## Review Summary') === -1, 'lite spec should not have Review Summary');
    assert.ok(c.indexOf('## Completion Verification') !== -1, 'lite spec should have Completion Verification');

    // micro
    run('discover ' + demo + ' --task-name review-merge-micro --spec-version v1.0 --requirement x --mode micro');
    var sfMicro = path.join(demo, 'mydocs', 'specs', 'v1.0-review-merge-micro.md');
    c = fs.readFileSync(sfMicro, 'utf-8');
    assert.ok(c.indexOf('## Review Verdict') === -1, 'micro spec should not have Review Verdict');
    assert.ok(c.indexOf('## Review Summary') === -1, 'micro spec should not have Review Summary');
    assert.ok(c.indexOf('## Completion Verification') !== -1, 'micro spec should have Completion Verification');
  });

  it('validate does not require Review Verdict for new specs (AC-004)', function() {
    var demo = path.join(tmpBase, 'ac-no-review');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name no-review --spec-version v1.0 --requirement x');
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

  it('Console phases do not include review (AC-004)', function() {
    var consoleSrc = fs.readFileSync(path.resolve('src/web/console.js'), 'utf-8');
    // phases array should not contain review
    var phasesMatch = consoleSrc.match(/var phases = \[([\s\S]*?)\];/);
    assert.ok(phasesMatch, 'should find phases array');
    assert.ok(phasesMatch[1].indexOf("'review'") === -1, 'phases should not include review');
  });
});
