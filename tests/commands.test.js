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
  fs.writeFileSync(specFile, content, 'utf-8');
  insertSectionContent(designFile, 'Technical Design', standardDesignContent());
  insertSectionContent(logFile, 'Execute Log', 'Step 1: test\nStatus: DONE\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');
  insertSectionContent(specFile, 'Review Verdict', 'Review Pass 1 - 2026-01-01T00:00:00Z - PASS');
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

  it('discover accepts --version alias and fills structured invocation fields', function() {
    var demo = path.join(tmpBase, 'd2b');
    run('init ' + demo + ' --mode standard');
    var out = run('discover ' + demo + ' --task-name my-login --version v1.0 --requirement login --goal auth --constraints none');
    assert.ok(out.indexOf('SPEC CREATION PROMPT') !== -1);
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-my-login.md');
    var c = fs.readFileSync(sf, 'utf-8');
    assert.match(c, /^date: \d{4}-\d{2}-\d{2}$/m);
    assert.match(c, /^diff-base:/m);
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
    insertSectionContent(sf, 'Review Verdict', 'Challenge Verdict: FAIL_DESIGN\nChallenge Summary: design contract missed interface impact.');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Adversarial Challenge failed: FAIL_DESIGN') !== -1);
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
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(sf, 'Review Summary', 'Review Pass 1 - 2026-01-01T00:00:00Z - PASS');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Design Note is empty') !== -1);
    assert.ok(blocked.indexOf('Acceptance Criteria is empty') !== -1);
    assert.ok(blocked.indexOf('Execute Log is empty') !== -1);

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
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', standardDesignContent());
    insertSectionContent(logFile, 'Execute Log', 'Step 1: test\nStatus: DONE\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');
    insertSectionContent(sf, 'Review Verdict', 'Review Pass 1 - 2026-01-01T00:00:00Z - PASS');

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
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(sf, 'Review Summary', 'Review Pass 1 - 2026-01-01T00:00:00Z - PASS');

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
    assert.ok(!fs.existsSync(stale));
  });

  it('new-codemap and new-projectmap work', function() {
    var demo = path.join(tmpBase, 'd5');
    run('init ' + demo + ' --mode standard');
    assert.ok(run('new-codemap ' + demo + ' auth').indexOf('[CREATE]') !== -1);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'codemap', 'auth.md')));
    assert.ok(run('new-projectmap ' + demo).indexOf('[CREATE]') !== -1);
    assert.ok(fs.existsSync(path.join(demo, 'mydocs', 'projectmap.md')));
  });

  it('prompt commands generate output', function() {
    var demo = path.join(tmpBase, 'd6');
    run('init ' + demo + ' --mode standard');
    assert.ok(run('create-codemap ' + demo + ' --module x').indexOf('CREATE CODEMAP PROMPT') !== -1);
    assert.ok(run('create-projectmap ' + demo).indexOf('CREATE PROJECTMAP PROMPT') !== -1);
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

  it('next does not let stale PASS challenge verdict override validation blockers', function() {
    var demo = path.join(tmpBase, 'd6h');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name stale-pass --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-stale-pass.md');
    var c = fs.readFileSync(sf, 'utf-8')
      .replace(/^Challenge Verdict:$/m, 'Challenge Verdict: PASS')
      .replace(/^Challenge Summary:$/m, 'Challenge Summary: stale prior pass');
    fs.writeFileSync(sf, c, 'utf-8');

    var out = run('next ' + demo);
    assert.ok(out.indexOf('CHALLENGE_VERDICT: FAIL_SPEC') !== -1);
    assert.ok(out.indexOf('BACKTRACK_TARGET: Research') !== -1);
    assert.ok(out.indexOf('NEXT_ACTION: repair_research') !== -1);
    assert.ok(out.indexOf('Confirmed Requirement is empty.') !== -1);
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

  it('help and version', function() {
    assert.ok(run('--help').indexOf('init') !== -1);
    assert.ok(run('--help').indexOf('install-skill') !== -1);
    assert.ok(run('install-skill --help').indexOf('cc-switch') !== -1);
    assert.ok(run('--version').indexOf('2.0.0') !== -1);
  });
});
