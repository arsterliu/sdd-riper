const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a temp directory for tests
const tmpBase = path.join(os.tmpdir(), 'sdd-test-' + Date.now());
const projectDir = path.join(tmpBase, 'test-project');
const docsDir = path.join(projectDir, 'mydocs');

function setupProject(mode) {
  // Clean and recreate
  if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(docsDir, 'specs'), { recursive: true });
  fs.mkdirSync(path.join(docsDir, 'context'), { recursive: true });
  fs.mkdirSync(path.join(docsDir, 'archive'), { recursive: true });
  
  var modeStr = mode || 'standard';
  fs.writeFileSync(path.join(projectDir, '.sdd-config'),
    'DOCS_DIR="mydocs"\nMODE="' + modeStr + '"\nSDD_VERSION="1.0"\nAUTONOMY_MODE="supervised"\n', 'utf-8');
}

describe('common.js utilities', function() {
  var common;

  beforeEach(function() {
    // Reload module each test to avoid cached state
    delete require.cache[require.resolve('../lib/common')];
    common = require('../lib/common');
    setupProject('standard');
  });

  afterEach(function() {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it('getConfigFile returns correct path', function() {
    assert.equal(common.getConfigFile(projectDir), path.join(projectDir, '.sdd-config'));
  });

  it('isValidDocsDirName accepts valid names', function() {
    assert.ok(common.isValidDocsDirName('mydocs'));
    assert.ok(common.isValidDocsDirName('docs-v2'));
    assert.ok(common.isValidDocsDirName('docs.v1'));
  });

  it('isValidDocsDirName rejects invalid names', function() {
    assert.ok(!common.isValidDocsDirName('.'));
    assert.ok(!common.isValidDocsDirName('..'));
    assert.ok(!common.isValidDocsDirName('path/with/slash'));
  });

  it('getDocsDir reads from config', function() {
    assert.equal(common.getDocsDir(projectDir), 'mydocs');
  });

  it('getDocsDir defaults to mydocs when no config', function() {
    var emptyDir = path.join(tmpBase, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    assert.equal(common.getDocsDir(emptyDir), 'mydocs');
  });

  it('getDocsRoot returns joined path', function() {
    assert.equal(common.getDocsRoot(projectDir), docsDir);
  });

  it('getMode ignores project config and defaults to micro', function() {
    assert.equal(common.getMode(projectDir), 'micro');
    fs.writeFileSync(path.join(projectDir, '.sdd-config'),
      'DOCS_DIR="mydocs"\nMODE="lite"\n', 'utf-8');
    assert.equal(common.getMode(projectDir), 'micro');
  });

  it('getMode defaults to micro', function() {
    var emptyDir = path.join(tmpBase, 'empty2');
    fs.mkdirSync(emptyDir, { recursive: true });
    assert.equal(common.getMode(emptyDir), 'micro');
  });

  it('reads strict autonomy mode and the independent cruise budget', function() {
    assert.deepEqual(common.readProjectAutonomy(projectDir), {
      ok: true,
      mode: 'supervised',
      issue: '',
      legacyFields: []
    });
    assert.equal(common.getCruiseMaxIterations(projectDir), 5);

    fs.writeFileSync(path.join(projectDir, '.sdd-config'),
      'DOCS_DIR="mydocs"\nAUTONOMY_MODE="auto"\nCRUISE_MAX_ITERATIONS="9"\n', 'utf-8');
    assert.equal(common.readProjectAutonomy(projectDir).mode, 'auto');
    assert.equal(common.getCruiseMaxIterations(projectDir), 9);

    fs.writeFileSync(path.join(projectDir, '.sdd-config'),
      'DOCS_DIR="mydocs"\nAUTONOMY_MODE="human"\nCRUISE_ENABLED="false"\nCRUISE_MAX_ITERATIONS="0"\n', 'utf-8');
    assert.equal(common.readProjectAutonomy(projectDir).issue, 'legacy');
    assert.equal(common.getCruiseMaxIterations(projectDir), 5);
  });

  it('versionExists detects existing spec', function() {
    var specsDir = path.join(docsDir, 'specs');
    assert.ok(!common.versionExists(specsDir, 'my-task', 'v1.0'));
    fs.writeFileSync(path.join(specsDir, 'v1.0-my-task.md'), 'test', 'utf-8');
    assert.ok(common.versionExists(specsDir, 'my-task', 'v1.0'));
  });

  it('validates two-part and three-part spec versions', function() {
    assert.ok(common.isValidSpecVersion('v1.0'));
    assert.ok(common.isValidSpecVersion('v1.3.6'));
    assert.ok(!common.isValidSpecVersion('1.3.6'));
    assert.ok(!common.isValidSpecVersion('v1'));
    assert.ok(!common.isValidSpecVersion('v1.2.3.4'));
  });

  it('parses two-part and three-part spec filenames', function() {
    assert.deepStrictEqual(common.parseSpecFileName('v1.0-login.md'), {
      version: 'v1.0',
      slug: 'login',
      major: 1,
      minor: 0,
      patch: 0
    });
    assert.deepStrictEqual(common.parseSpecFileName('v1.3.6-sdk-adapter.md'), {
      version: 'v1.3.6',
      slug: 'sdk-adapter',
      major: 1,
      minor: 3,
      patch: 6
    });
  });

  it('normalizeSlug handles various inputs', function() {
    assert.equal(common.normalizeSlug('checkout retry'), 'checkout-retry');
    assert.equal(common.normalizeSlug('v1.0-checkout-retry'), 'checkout-retry');
    assert.equal(common.normalizeSlug('checkout-retry'), 'checkout-retry');
  });

  it('findLatestSpec returns empty for empty dir', function() {
    assert.equal(common.findLatestSpec(path.join(docsDir, 'specs')), '');
  });

  it('findLatestSpec finds the latest spec', function() {
    var specsDir = path.join(docsDir, 'specs');
    fs.writeFileSync(path.join(specsDir, 'v1.0-test-task.md'), 'test', 'utf-8');
    fs.writeFileSync(path.join(specsDir, 'v1.1-test-task.md'), 'test', 'utf-8');
    var result = common.findLatestSpec(specsDir);
    assert.ok(result.endsWith('v1.1-test-task.md'), 'Expected v1.1, got: ' + result);
  });

  it('findLatestSpec prefers non-archived over a newer-mtime archived spec (AC-001)', function() {
    var specsDir = path.join(docsDir, 'specs');
    var draft = path.join(specsDir, 'v1.0-alpha.md');
    var arch = path.join(specsDir, 'v2.0-beta.md');
    fs.writeFileSync(draft, '---\nstatus: draft\ndate: 2026-06-01\n---\n', 'utf-8');
    fs.writeFileSync(arch, '---\nstatus: archived\ndate: 2026-06-20\n---\n', 'utf-8');
    var oldT = new Date(Date.now() - 100000), newT = new Date();
    fs.utimesSync(draft, oldT, oldT); // non-archived has the older mtime
    fs.utimesSync(arch, newT, newT);  // archived has the newer mtime
    assert.equal(common.findLatestSpec(specsDir), draft);
  });

  it('findLatestSpec orders non-archived by date, not mtime (AC-002)', function() {
    var specsDir = path.join(docsDir, 'specs');
    var older = path.join(specsDir, 'v1.0-older.md');
    var newer = path.join(specsDir, 'v1.0-newer.md');
    fs.writeFileSync(older, '---\nstatus: draft\ndate: 2026-06-01\n---\n', 'utf-8');
    fs.writeFileSync(newer, '---\nstatus: draft\ndate: 2026-06-25\n---\n', 'utf-8');
    var oldT = new Date(Date.now() - 100000), newT = new Date();
    fs.utimesSync(newer, oldT, oldT); // newer date but older mtime (simulates git checkout)
    fs.utimesSync(older, newT, newT);
    assert.equal(common.findLatestSpec(specsDir), newer);
  });

  it('findLatestSpec breaks date ties by version (AC-003)', function() {
    var specsDir = path.join(docsDir, 'specs');
    fs.writeFileSync(path.join(specsDir, 'v1.0-x.md'), '---\nstatus: draft\ndate: 2026-06-10\n---\n', 'utf-8');
    var hi = path.join(specsDir, 'v1.2-x.md');
    fs.writeFileSync(hi, '---\nstatus: draft\ndate: 2026-06-10\n---\n', 'utf-8');
    assert.equal(common.findLatestSpec(specsDir), hi);
  });

  it('findLatestSpec sorts three-part versions by patch when dates tie', function() {
    var specsDir = path.join(docsDir, 'specs');
    fs.writeFileSync(path.join(specsDir, 'v1.3.5-x.md'), '---\nstatus: draft\ndate: 2026-06-10\n---\n', 'utf-8');
    var hi = path.join(specsDir, 'v1.3.6-x.md');
    fs.writeFileSync(hi, '---\nstatus: draft\ndate: 2026-06-10\n---\n', 'utf-8');
    assert.equal(common.findLatestSpec(specsDir), hi);
  });

  it('getFrontmatterField reads YAML frontmatter', function() {
    var specFile = path.join(docsDir, 'specs', 'v1.0-test.md');
    fs.writeFileSync(specFile, '---\ndate: 2026-06-11\ntask-name: "my-task"\nmode: standard\nstatus: draft\n---\n\n# Spec\n', 'utf-8');
    assert.equal(common.getFrontmatterField(specFile, 'task-name'), 'my-task');
    assert.equal(common.getFrontmatterField(specFile, 'mode'), 'standard');
    assert.equal(common.getFrontmatterField(specFile, 'status'), 'draft');
    assert.equal(common.getFrontmatterField(specFile, 'nonexistent'), '');
  });

  it('sectionIsEmpty detects empty sections', function() {
    var specFile = path.join(docsDir, 'specs', 'v1.0-test.md');
    fs.writeFileSync(specFile, '## Intake\n<!-- comment -->\n\n## Other\ncontent here\n', 'utf-8');
    assert.ok(common.sectionIsEmpty(specFile, 'Intake'));
    assert.ok(!common.sectionIsEmpty(specFile, 'Other'));
  });

  it('findSourceSpec finds by slug', function() {
    var specsDir = path.join(docsDir, 'specs');
    fs.writeFileSync(path.join(specsDir, 'v1.0-login.md'), '---\nstatus: archived\n---\n', 'utf-8');
    fs.writeFileSync(path.join(specsDir, 'v1.1-login.md'), '---\nstatus: archived\n---\n', 'utf-8');
    var result = common.findSourceSpec(specsDir, 'login', true);
    assert.ok(result.endsWith('v1.1-login.md'), 'Expected v1.1, got: ' + result);
  });

  it('findSourceSpec finds three-part versions by slug', function() {
    var specsDir = path.join(docsDir, 'specs');
    fs.writeFileSync(path.join(specsDir, 'v1.3.5-login.md'), '---\nstatus: archived\n---\n', 'utf-8');
    fs.writeFileSync(path.join(specsDir, 'v1.3.6-login.md'), '---\nstatus: archived\n---\n', 'utf-8');
    var result = common.findSourceSpec(specsDir, 'login', true);
    assert.ok(result.endsWith('v1.3.6-login.md'), 'Expected v1.3.6, got: ' + result);
  });

  it('extractSection extracts content between headings', function() {
    var specFile = path.join(docsDir, 'specs', 'v1.0-test.md');
    fs.writeFileSync(specFile,
      '## Intake\nintake content line 1\nintake content line 2\n\n## Next Section\nother\n', 'utf-8');
    var result = common.extractSection(specFile, 'Intake', 50);
    assert.ok(result.indexOf('intake content line 1') !== -1);
    assert.ok(result.indexOf('other') === -1, 'Should not include next section');
  });
});

describe('auxiliary spec name filtering (v4.13 AC-003)', function() {
  var common;

  beforeEach(function() {
    delete require.cache[require.resolve('../lib/common')];
    common = require('../lib/common');
    setupProject('standard');
  });

  afterEach(function() {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it('isAuxiliarySpecName detects design/execute/learning artifacts only', function() {
    assert.equal(common.isAuxiliarySpecName('v1.0-task.design.md'), true);
    assert.equal(common.isAuxiliarySpecName('v1.0-task.execute.md'), true);
    assert.equal(common.isAuxiliarySpecName('v1.2.3-task.learning.md'), true);
    assert.equal(common.isAuxiliarySpecName('v1.0-task.md'), false);
    assert.equal(common.isAuxiliarySpecName('README.md'), false);
    assert.equal(common.isAuxiliarySpecName(''), false);
  });

  it('findLatestSpec ignores auxiliary artifacts in specs dir', function() {
    var specsDir = path.join(docsDir, 'specs');
    fs.writeFileSync(path.join(specsDir, 'v1.0-real-spec.md'),
      '---\ndate: 2026-08-23\nstatus: draft\n---\n\n## Summary\nreal spec\n', 'utf-8');
    fs.writeFileSync(path.join(specsDir, 'v1.0-real-spec.design.md'),
      '---\ndate: 2026-08-24\nstatus: draft\n---\n\n# Design Note\n', 'utf-8');
    fs.writeFileSync(path.join(specsDir, 'v1.0-real-spec.execute.md'),
      '---\ndate: 2026-08-25\nstatus: active\n---\n\n# Execute Log\n', 'utf-8');
    var latest = common.findLatestSpec(specsDir);
    assert.ok(latest.endsWith('v1.0-real-spec.md'), 'latest must be the real spec, got: ' + latest);
  });

  it('findLatestSpec returns empty when only auxiliary artifacts exist', function() {
    var specsDir = path.join(docsDir, 'specs');
    fs.writeFileSync(path.join(specsDir, 'v9.9-ghost.design.md'), 'x\n', 'utf-8');
    assert.equal(common.findLatestSpec(specsDir), '');
  });
});
