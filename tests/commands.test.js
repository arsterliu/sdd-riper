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

function insertSectionContent(file, heading, body) {
  var content = fs.readFileSync(file, 'utf-8');
  var marker = '## ' + heading + '\n';
  assert.ok(content.indexOf(marker) !== -1, file + ' missing section ' + heading);
  fs.writeFileSync(file, content.replace(marker, marker + body + '\n'), 'utf-8');
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
    .replace('### Confirmed Requirement\n', '### Confirmed Requirement\nShip a test archive flow with validated gates.\n')
    .replace('## Innovate Options\n', '## Innovate Options\nOption A: keep validated archive flow. Pros: simple. Cons: test-only.\nOption B: skip archive. Pros: none. Cons: no coverage.\nSelected: Option A.\n')
    .replace('## Acceptance Criteria\n', '## Acceptance Criteria\n### AC-001: archive accepts a complete standard spec\nRequirement: archive-flow\nType: functional\nAutomated: yes\nTest: tests/commands.test.js\n\nScenario: Valid standard spec\n  Given a standard spec with design, AC, approval, execute log, and PASS review\n  When archive runs\n  Then the spec is moved to archive\n')
    .replace(/^Plan Approved By:$/m, 'Plan Approved By: Tester')
    .replace(/^Approved At:$/m, 'Approved At: 2026-01-01T00:00:00Z');
  fs.writeFileSync(specFile, content, 'utf-8');
  insertSectionContent(designFile, 'Technical Design', 'Selected Option: Option A.\nRequirement Traceability: archive-ready validation covers this test.\nTest Strategy: node:test command suite.');
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
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'specs', '.gitkeep')));
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'design', '.gitkeep')));
    assert.ok(fs.existsSync(path.join(tmpBase, 'demo', 'mydocs', 'logs', '.gitkeep')));
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

  it('validate enforces lite design note and acceptance criteria', function() {
    var demo = path.join(tmpBase, 'd4c');
    run('init ' + demo + ' --mode lite');
    run('discover ' + demo + ' --task-name lite-task --spec-version v1.0 --requirement x --mode lite');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-lite-task.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c
      .replace('## Confirmed Requirement\n', '## Confirmed Requirement\nLite task must enforce design and acceptance before archive.\n')
      .replace('## Innovate Options\n', '## Innovate Options\nInnovate: Skipped, Reason: reuses existing validate/archive pattern.\n')
      .replace(/^Plan Approved By:$/m, 'Plan Approved By: Tester')
      .replace(/^Approved At:$/m, 'Approved At: 2026-01-01T00:00:00Z');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(sf, 'Review Summary', 'Review Pass 1 - 2026-01-01T00:00:00Z - PASS');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Design Note is empty') !== -1);
    assert.ok(blocked.indexOf('Acceptance Criteria is empty') !== -1);
    assert.ok(blocked.indexOf('Execute Log is empty') !== -1);

    c = fs.readFileSync(sf, 'utf-8')
      .replace('## Acceptance Criteria\n', '## Acceptance Criteria\n- AC-001: validate --archive-ready passes only when lite design and acceptance are present; verification: node tests.\n');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Design Note', 'Approach: reuse the standard validate path.\nImpact Scope: CLI validation only.\nCompatibility: no format break.\nRisks: missing AC would block archive.\nTest Strategy: node test validates this behavior.');
    insertSectionContent(logFile, 'Execute Log', 'Step 1: test\nStatus: DONE\nDeviation: none\nTimestamp: 2026-01-01T00:00:00Z');
    var ok = run('validate ' + demo + ' --archive-ready');
    assert.ok(ok.indexOf('RESULT: OK') !== -1);
  });

  it('validate enforces micro plan acceptance and verification labels', function() {
    var demo = path.join(tmpBase, 'd4d');
    run('init ' + demo + ' --mode micro');
    run('discover ' + demo + ' --task-name micro-task --spec-version v1.0 --requirement x --mode micro');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-micro-task.md');
    var logFile = artifactPath(demo, sf, 'execute-log-file');
    var c = fs.readFileSync(sf, 'utf-8');
    c = c
      .replace(/^Plan Approved By:$/m, 'Plan Approved By: Tester')
      .replace(/^Approved At:$/m, 'Approved At: 2026-01-01T00:00:00Z');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(sf, 'Review Summary', 'Review Pass 1 - 2026-01-01T00:00:00Z - PASS');

    var blocked = run('validate ' + demo + ' --archive-ready');
    assert.ok(blocked.indexOf('Micro Plan must include Acceptance') !== -1);
    assert.ok(blocked.indexOf('Micro Plan must include Verification') !== -1);
    assert.ok(blocked.indexOf('Execute Log is empty') !== -1);

    c = fs.readFileSync(sf, 'utf-8')
      .replace(/^Approved At: 2026-01-01T00:00:00Z$/m, 'Approved At: 2026-01-01T00:00:00Z\n\nScope: single-file test fixture\nTouched Files: none\nChange: validate micro gates\nAcceptance: validate reports OK\nVerification: node --test tests/*.test.js\nBlast Radius: micro only');
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
    var stale = path.join(targets[0].dir, 'stale.txt');
    fs.mkdirSync(targets[0].dir, { recursive: true });
    fs.writeFileSync(stale, 'old', 'utf-8');

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

  it('review-execute includes design and acceptance evidence in Axis 1', function() {
    var demo = path.join(tmpBase, 'd6b');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name review-design --spec-version v1.0 --requirement x');
    var sf = path.join(demo, 'mydocs', 'specs', 'v1.0-review-design.md');
    var designFile = artifactPath(demo, sf, 'design-file');
    var c = fs.readFileSync(sf, 'utf-8')
      .replace('## Acceptance Criteria\n', '## Acceptance Criteria\n### AC-001: review prompt includes acceptance evidence\n');
    fs.writeFileSync(sf, c, 'utf-8');
    insertSectionContent(designFile, 'Technical Design', 'Selected Option: include design evidence in review.');
    var out = run('review-execute ' + demo);
    assert.ok(out.indexOf('Design / Acceptance / Plan Coverage') !== -1);
    assert.ok(out.indexOf('#### Design Brief') !== -1);
    assert.ok(out.indexOf('Selected Option: include design evidence in review') !== -1);
    assert.ok(out.indexOf('#### Acceptance Brief') !== -1);
    assert.ok(out.indexOf('AC-001') !== -1);
  });

  it('console API exposes spec list, detail, and archive validation', async function() {
    var demo = path.join(tmpBase, 'd7');
    run('init ' + demo + ' --mode standard');
    run('discover ' + demo + ' --task-name console-task --spec-version v1.0 --requirement x');
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
      assert.ok(detail.body.artifacts.design.ref.endsWith('v1.0-console-task.design.md'));
      assert.ok(detail.body.artifacts.executeLog.ref.endsWith('v1.0-console-task.execute.md'));

      var specPreview = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/artifact?artifact=spec');
      var designPreview = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/artifact?artifact=design');
      var logPreview = await requestJson(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/artifact?artifact=executeLog');
      assert.equal(specPreview.statusCode, 200);
      assert.equal(specPreview.body.label, 'Spec');
      assert.ok(specPreview.body.content.indexOf('console-task') !== -1);
      assert.equal(designPreview.statusCode, 200);
      assert.equal(designPreview.body.label, 'Design');
      assert.ok(designPreview.body.relativePath.endsWith('v1.0-console-task.design.md'));
      assert.equal(logPreview.statusCode, 200);
      assert.equal(logPreview.body.label, 'Execute Log');
      assert.ok(logPreview.body.relativePath.endsWith('v1.0-console-task.execute.md'));

      var previewPage = await requestText(server, '/preview.html');
      assert.equal(previewPage.statusCode, 200);
      assert.ok(previewPage.body.indexOf('SDD Artifact Preview') !== -1);

      var openSpec = await requestJsonBody(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/open', 'POST', { artifact: 'spec' });
      var openDesign = await requestJsonBody(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/open', 'POST', { artifact: 'design' });
      var openLog = await requestJsonBody(server, '/api/specs/' + encodeURIComponent(list.body.specs[0].id) + '/open', 'POST', { artifact: 'executeLog' });
      assert.equal(openSpec.statusCode, 200);
      assert.equal(openDesign.statusCode, 200);
      assert.equal(openLog.statusCode, 200);
      assert.ok(openedFiles.some(function(filePath) { return filePath.endsWith('v1.0-console-task.md'); }));
      assert.ok(openedFiles.some(function(filePath) { return filePath.endsWith('v1.0-console-task.design.md'); }));
      assert.ok(openedFiles.some(function(filePath) { return filePath.endsWith('v1.0-console-task.execute.md'); }));

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
    assert.ok(run('--version').indexOf('2.0.0') !== -1);
  });
});
