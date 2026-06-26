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
  fs.mkdirSync(path.join(docsDir, 'codemap'), { recursive: true });
  fs.mkdirSync(path.join(docsDir, 'context'), { recursive: true });
  fs.mkdirSync(path.join(docsDir, 'archive'), { recursive: true });
  
  var modeStr = mode || 'standard';
  fs.writeFileSync(path.join(projectDir, '.sdd-config'),
    'DOCS_DIR="mydocs"\nMODE="' + modeStr + '"\nSDD_VERSION="1.0"\n', 'utf-8');
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

  it('getMode reads from config', function() {
    assert.equal(common.getMode(projectDir), 'standard');
    fs.writeFileSync(path.join(projectDir, '.sdd-config'),
      'DOCS_DIR="mydocs"\nMODE="lite"\n', 'utf-8');
    assert.equal(common.getMode(projectDir), 'lite');
  });

  it('getMode defaults to standard', function() {
    var emptyDir = path.join(tmpBase, 'empty2');
    fs.mkdirSync(emptyDir, { recursive: true });
    assert.equal(common.getMode(emptyDir), 'standard');
  });

  it('reads gate and cruise policy defaults and configured values', function() {
    assert.equal(common.getGatePolicy(projectDir), 'auto');
    assert.equal(common.getCruisePolicy(projectDir), 'autonomous');
    assert.equal(common.getCruiseMaxIterations(projectDir), 5);

    fs.writeFileSync(path.join(projectDir, '.sdd-config'),
      'DOCS_DIR="mydocs"\nMODE="standard"\nGATE_POLICY="manual"\nCRUISE_POLICY="assisted"\nCRUISE_MAX_ITERATIONS="9"\n', 'utf-8');
    assert.equal(common.getGatePolicy(projectDir), 'manual');
    assert.equal(common.getCruisePolicy(projectDir), 'assisted');
    assert.equal(common.getCruiseMaxIterations(projectDir), 9);

    fs.writeFileSync(path.join(projectDir, '.sdd-config'),
      'DOCS_DIR="mydocs"\nMODE="standard"\nGATE_POLICY="bad"\nCRUISE_POLICY="bad"\nCRUISE_MAX_ITERATIONS="0"\n', 'utf-8');
    assert.equal(common.getGatePolicy(projectDir), 'auto');
    assert.equal(common.getCruisePolicy(projectDir), 'autonomous');
    assert.equal(common.getCruiseMaxIterations(projectDir), 5);
  });

  it('versionExists detects existing spec', function() {
    var specsDir = path.join(docsDir, 'specs');
    assert.ok(!common.versionExists(specsDir, 'my-task', 'v1.0'));
    fs.writeFileSync(path.join(specsDir, 'v1.0-my-task.md'), 'test', 'utf-8');
    assert.ok(common.versionExists(specsDir, 'my-task', 'v1.0'));
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

  it('extractSection extracts content between headings', function() {
    var specFile = path.join(docsDir, 'specs', 'v1.0-test.md');
    fs.writeFileSync(specFile,
      '## Intake\nintake content line 1\nintake content line 2\n\n## Next Section\nother\n', 'utf-8');
    var result = common.extractSection(specFile, 'Intake', 50);
    assert.ok(result.indexOf('intake content line 1') !== -1);
    assert.ok(result.indexOf('other') === -1, 'Should not include next section');
  });
});
