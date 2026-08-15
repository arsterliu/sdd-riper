'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;
var runCli = require('./helpers/sdd-fixtures').runCli;
var fixtures = require('./helpers/quality-fixtures');

function runWithUnavailableReadiness(root, specPath) {
  var command = path.resolve(__dirname, '..', 'src', 'commands', 'quality.js');
  var script = [
    'var quality = require(' + JSON.stringify(command) + ');',
    'quality.plan(process.argv[1], { spec: process.argv[2], format: "json" }, {',
    '  readinessReader: function() {',
    '    var error = new Error("fixture Git state unavailable");',
    '    error.code = "GIT_STATE_UNAVAILABLE";',
    '    throw error;',
    '  }',
    '});'
  ].join('\n');
  try {
    return {
      status: 0,
      output: execFileSync(process.execPath, ['-e', script, root, specPath], {
        cwd: root,
        encoding: 'utf8'
      })
    };
  } catch (error) {
    return {
      status: error.status,
      output: String(error.stdout || '') + String(error.stderr || '')
    };
  }
}

function runWithReadinessSnapshot(root, specPath, snapshot) {
  var command = path.resolve(__dirname, '..', 'src', 'commands', 'quality.js');
  var script = [
    'var quality = require(' + JSON.stringify(command) + ');',
    'quality.plan(process.argv[1], { spec: process.argv[2], format: "json" }, {',
    '  readinessReader: function() { return JSON.parse(process.argv[3]); }',
    '});'
  ].join('\n');
  try {
    return {
      status: 0,
      output: execFileSync(process.execPath, ['-e', script, root, specPath, JSON.stringify(snapshot)], {
        cwd: root,
        encoding: 'utf8'
      })
    };
  } catch (error) {
    return {
      status: error.status,
      output: String(error.stdout || '') + String(error.stderr || '')
    };
  }
}

function runQualityPlanInProcess(root, options) {
  var quality = require('../src/commands/quality');
  var originalWrite = process.stdout.write;
  var originalExitCode = process.exitCode;
  var output = '';
  process.stdout.write = function(chunk) {
    output += String(chunk);
    return true;
  };
  process.exitCode = undefined;
  try {
    quality.plan(root, options);
    return { status: process.exitCode || 0, output: output };
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = originalExitCode;
  }
}

function providerConfig(providerId) {
  var providers = {};
  providers[providerId] = {
    adapter: 'playwright-test',
    workspaceRoot: '.',
    packageRoot: '.',
    config: 'playwright.config.js',
    projects: ['chromium']
  };
  return { schemaVersion: 1, providers: providers };
}

test('quality plan returns structured profile-required diagnostics without mutating the project', function(t) {
  var root = fixtures.createProject('profile-required');
  t.after(function() { fixtures.cleanup(root); });
  var specPath = fixtures.writeSpec(root, 'profile-required', {
    affectedUnits: '',
    acs: [fixtures.acceptanceBlock('AC-001', 'unit')]
  });
  var before = fixtures.snapshotTree(root);

  var result = runCli([
    'quality',
    'plan',
    root,
    '--spec',
    path.relative(root, specPath),
    '--format',
    'json'
  ], root);

  assert.equal(result.status, 2, result.output);
  var projection = JSON.parse(result.output);
  assert.equal(projection.schemaVersion, 1);
  assert.deepEqual(projection.acFacts, [
    { acId: 'AC-001', verification: 'unit', provider: '', manualEvidence: '' }
  ]);
  assert.ok(projection.diagnostics.some(function(item) { return item.code === 'profile-required'; }));
  assert.deepEqual(fixtures.snapshotTree(root), before);

  var textResult = runCli([
    'quality',
    'plan',
    root,
    '--spec',
    path.relative(root, specPath)
  ], root);
  assert.equal(textResult.status, 2, textResult.output);
  assert.match(textResult.output, /AC_FACTS:\r?\n- AC-001: unit/);
  assert.doesNotMatch(textResult.output, /PHASE_HINT|NEXT_ACTION|ARCHIVE_ELIGIBILITY/);
});

test('quality plan projects the existing required readiness only for provider-bound e2e ACs', function(t) {
  var root = fixtures.createProject('e2e-required');
  t.after(function() { fixtures.cleanup(root); });
  var revision = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), true);
  var specPath = fixtures.writeSpec(root, 'e2e-required', {
    revision: revision.relative,
    digest: revision.digest,
    affectedUnits: 'web',
    acs: [fixtures.acceptanceBlock('AC-001', 'e2e', { provider: 'web-e2e' })]
  });

  var result = runCli([
    'quality',
    'plan',
    root,
    '--spec',
    path.relative(root, specPath),
    '--format',
    'json'
  ], root);

  assert.equal(result.status, 0, result.output);
  var projection = JSON.parse(result.output);
  assert.deepEqual(projection.e2eReadiness, {
    state: 'required',
    requiredProviders: ['web-e2e'],
    missingProviders: ['web-e2e'],
    issues: ['Verification Provider is not configured: web-e2e.']
  });

  var text = runCli([
    'quality',
    'plan',
    root,
    '--spec',
    path.relative(root, specPath)
  ], root);
  assert.equal(text.status, 0, text.output);
  assert.ok(text.output.indexOf('PROFILE_REVISION: ' + revision.relative) !== -1, text.output);
  assert.ok(text.output.indexOf('PROFILE_DIGEST: ' + revision.digest) !== -1, text.output);
  assert.match(text.output, /REASONS:\r?\n  - \{"kind":"role","unitId":"web","role":"frontend"\}/);
  assert.match(text.output, /E2E_ISSUES:\r?\n- Verification Provider is not configured: web-e2e\./);
});

test('quality plan preserves configured, blocked, and ready readiness snapshots without executing verification', function(t) {
  var root = fixtures.createProject('e2e-readiness-states');
  t.after(function() { fixtures.cleanup(root); });
  var revision = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), true);
  var specPath = fixtures.writeSpec(root, 'e2e-readiness-states', {
    revision: revision.relative,
    digest: revision.digest,
    affectedUnits: 'web',
    acs: [fixtures.acceptanceBlock('AC-001', 'e2e', { provider: 'web-e2e' })]
  });

  fixtures.write(path.join(root, '.sdd-verification.json'), JSON.stringify(providerConfig('web-e2e'), null, 2));
  var configured = runCli([
    'quality', 'plan', root, '--spec', path.relative(root, specPath), '--format', 'json'
  ], root);
  assert.equal(configured.status, 0, configured.output);
  assert.equal(JSON.parse(configured.output).e2eReadiness.state, 'configured');

  fixtures.write(path.join(root, '.sdd-verification.json'), '{invalid json');
  var blocked = runCli([
    'quality', 'plan', root, '--spec', path.relative(root, specPath), '--format', 'json'
  ], root);
  assert.equal(blocked.status, 0, blocked.output);
  assert.equal(JSON.parse(blocked.output).e2eReadiness.state, 'blocked');

  var readySnapshot = {
    state: 'ready',
    requiredProviders: ['web-e2e'],
    missingProviders: [],
    issues: []
  };
  var ready = runWithReadinessSnapshot(root, specPath, readySnapshot);
  assert.equal(ready.status, 0, ready.output);
  assert.deepEqual(JSON.parse(ready.output).e2eReadiness, readySnapshot);
});

test('quality plan returns readiness-unavailable when existing e2e freshness cannot be inspected', function(t) {
  var root = fixtures.createProject('readiness-unavailable');
  t.after(function() { fixtures.cleanup(root); });
  var revision = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), true);
  var specPath = fixtures.writeSpec(root, 'readiness-unavailable', {
    revision: revision.relative,
    digest: revision.digest,
    affectedUnits: 'web',
    acs: [fixtures.acceptanceBlock('AC-001', 'e2e', { provider: 'web-e2e' })]
  });

  var result = runWithUnavailableReadiness(root, specPath);
  assert.equal(result.status, 2, result.output);
  var projection = JSON.parse(result.output);
  assert.equal(projection.e2eReadiness, null);
  assert.ok(projection.diagnostics.some(function(item) { return item.code === 'readiness-unavailable'; }));
});

test('quality plan uses the Spec-bound historical Profile and fail-closes incomplete exact references', function(t) {
  var root = fixtures.createProject('exact-profile-cli');
  t.after(function() { fixtures.cleanup(root); });
  var bound = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), false);
  fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('api', ['backend'])
  ]), true);
  var specPath = fixtures.writeSpec(root, 'exact-profile-cli', {
    revision: bound.relative,
    digest: bound.digest,
    affectedUnits: 'web',
    acs: [fixtures.acceptanceBlock('AC-001', 'unit')]
  });

  var result = runCli([
    'quality', 'plan', root, '--spec', path.relative(root, specPath), '--format', 'json'
  ], root);
  assert.equal(result.status, 0, result.output);
  var projection = JSON.parse(result.output);
  assert.deepEqual(projection.source.profile, { revision: bound.relative, digest: bound.digest });
  assert.deepEqual(projection.source.effectiveAffectedUnits, ['web']);
  assert.deepEqual(projection.policyFocus.map(function(item) { return item.id; }), ['frontend-behavior']);
  assert.equal(projection.policyFocus.some(function(item) { return item.id === 'backend-behavior'; }), false);

  var incomplete = fixtures.writeSpec(root, 'incomplete-profile-cli', {
    revision: bound.relative,
    digest: '',
    affectedUnits: 'web',
    acs: [fixtures.acceptanceBlock('AC-002', 'unit')]
  });
  var blocked = runCli([
    'quality', 'plan', root, '--spec', path.relative(root, incomplete), '--format', 'json'
  ], root);
  assert.equal(blocked.status, 2, blocked.output);
  var blockedProjection = JSON.parse(blocked.output);
  assert.ok(blockedProjection.diagnostics.some(function(item) {
    return item.code === 'profile-reference-invalid';
  }));
  assert.equal(blockedProjection.diagnostics.some(function(item) {
    return item.code === 'profile-required';
  }), false);
  assert.deepEqual(blockedProjection.policyFocus, []);
});

test('quality plan follows existing Spec selectors and rejects ambiguous selector usage', function(t) {
  var root = fixtures.createProject('selectors');
  t.after(function() { fixtures.cleanup(root); });
  var web = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), false);
  var api = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('api', ['backend'])
  ]), true);
  var selected = fixtures.writeSpec(root, 'v1.0-selected', {
    revision: web.relative,
    digest: web.digest,
    affectedUnits: 'web',
    acs: [fixtures.acceptanceBlock('AC-001', 'unit')]
  });
  fixtures.writeSpec(root, 'v2.0-other', {
    revision: api.relative,
    digest: api.digest,
    affectedUnits: 'api',
    acs: [fixtures.acceptanceBlock('AC-001', 'unit')]
  });

  var byName = runCli(['quality', 'plan', root, '--name', 'selected', '--format', 'json'], root);
  assert.equal(byName.status, 0, byName.output);
  assert.equal(JSON.parse(byName.output).source.profile.digest, web.digest);

  var byAbsoluteSpec = runCli([
    'quality', 'plan', root, '--spec', selected, '--format', 'json'
  ], root);
  assert.equal(byAbsoluteSpec.status, 0, byAbsoluteSpec.output);
  assert.equal(JSON.parse(byAbsoluteSpec.output).source.profile.digest, web.digest);

  var defaultSelection = runCli(['quality', 'plan', root, '--format', 'json'], root);
  assert.equal(defaultSelection.status, 0, defaultSelection.output);
  assert.equal(JSON.parse(defaultSelection.output).source.profile.digest, api.digest);

  var invalid = runCli([
    'quality', 'plan', root, '--name', 'selected', '--spec', path.relative(root, selected)
  ], root);
  assert.equal(invalid.status, 3, invalid.output);
  assert.match(invalid.output, /\[SDD_QUALITY_USAGE\]/);
});

test('quality plan rejects traversal and absolute Spec paths outside the project specs directory', function(t) {
  var root = fixtures.createProject('spec-boundary');
  var outside = path.join(path.dirname(root), 'sdd-quality-external-' + path.basename(root) + '.md');
  t.after(function() {
    fixtures.cleanup(root);
    if (fs.existsSync(outside)) fs.rmSync(outside, { force: true });
  });
  var revision = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), true);
  var internal = fixtures.writeSpec(root, 'spec-boundary', {
    revision: revision.relative,
    digest: revision.digest,
    affectedUnits: 'web',
    acs: [fixtures.acceptanceBlock('AC-001', 'unit')]
  });
  fixtures.write(outside, fs.readFileSync(internal, 'utf8'));

  [path.relative(root, outside), outside].forEach(function(externalSpec) {
    var result = runCli([
      'quality', 'plan', root, '--spec', externalSpec, '--format', 'json'
    ], root);
    assert.equal(result.status, 2, result.output);
    var projection = JSON.parse(result.output);
    assert.ok(projection.diagnostics.some(function(item) {
      return item.code === 'spec_path_escape';
    }), result.output);
    assert.equal(projection.source.specPath, '');
  });
});

test('quality plan rejects a Spec link whose real path escapes the specs directory', function(t) {
  var root = fixtures.createProject('spec-link-boundary');
  var outside = path.join(path.dirname(root), 'sdd-quality-external-' + path.basename(root) + '.md');
  var link = path.join(root, 'mydocs', 'specs', 'linked.md');
  t.after(function() {
    fixtures.cleanup(root);
    if (fs.existsSync(outside)) fs.rmSync(outside, { force: true });
  });
  var revision = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), true);
  var internal = fixtures.writeSpec(root, 'spec-link-boundary', {
    revision: revision.relative,
    digest: revision.digest,
    affectedUnits: 'web',
    acs: [fixtures.acceptanceBlock('AC-001', 'unit')]
  });
  fixtures.write(outside, fs.readFileSync(internal, 'utf8'));
  try {
    fs.symlinkSync(outside, link, 'file');
  } catch (error) {
    t.skip('当前 Windows 未授予文件 symlink 权限');
    return;
  }

  var result = runCli([
    'quality', 'plan', root, '--spec', path.relative(root, link), '--format', 'json'
  ], root);
  assert.equal(result.status, 2, result.output);
  assert.ok(JSON.parse(result.output).diagnostics.some(function(item) {
    return item.code === 'spec_path_escape';
  }), result.output);
});

test('quality plan default selection rejects an escaping Spec link before reading external content', function(t) {
  var root = fixtures.createProject('default-spec-link-boundary');
  var outsideSpecs = path.join(path.dirname(root), 'sdd-quality-external-specs-' + path.basename(root));
  var outside = path.join(outsideSpecs, 'v9.9-escaped.md');
  var specsRoot = path.join(root, 'mydocs', 'specs');
  t.after(function() {
    fixtures.cleanup(root);
    if (fs.existsSync(outsideSpecs)) fs.rmSync(outsideSpecs, { recursive: true, force: true });
  });
  var revision = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), true);
  var internal = fixtures.writeSpec(root, 'v1.0-safe', {
    revision: revision.relative,
    digest: revision.digest,
    affectedUnits: 'web',
    acs: [fixtures.acceptanceBlock('AC-001', 'unit')]
  });
  fs.mkdirSync(outsideSpecs, { recursive: true });
  fixtures.write(outside, fs.readFileSync(internal, 'utf8'));
  try {
    fs.rmSync(specsRoot, { recursive: true, force: true });
    fs.symlinkSync(outsideSpecs, specsRoot, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    t.skip('当前环境未授予目录链接权限');
    return;
  }

  var originalRead = fs.readFileSync;
  var outsideReal = fs.realpathSync(outside);
  var externalReads = 0;
  fs.readFileSync = function(file) {
    var resolved = '';
    if (typeof file === 'string') {
      try { resolved = fs.realpathSync(file); } catch (error) {}
    }
    if (resolved === outsideReal) {
      externalReads++;
      throw new Error('external Spec content must not be read');
    }
    return originalRead.apply(this, arguments);
  };
  var result;
  try {
    result = runQualityPlanInProcess(root, { format: 'json' });
  } finally {
    fs.readFileSync = originalRead;
  }

  assert.equal(externalReads, 0, result.output);
  assert.equal(result.status, 2, result.output);
  assert.ok(JSON.parse(result.output).diagnostics.some(function(item) {
    return item.code === 'spec_path_escape';
  }), result.output);
});

test('quality plan accepts a docs-root link whose resolved target remains inside the project', function(t) {
  var root = fixtures.createProject('internal-docs-link');
  t.after(function() { fixtures.cleanup(root); });
  var docsRoot = path.join(root, 'mydocs');
  var internalDocs = path.join(root, 'internal-docs');
  fs.renameSync(docsRoot, internalDocs);
  try {
    fs.symlinkSync(internalDocs, docsRoot, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    t.skip('当前环境未授予目录链接权限');
    return;
  }
  var revision = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), true);
  var specPath = fixtures.writeSpec(root, 'internal-docs-link', {
    revision: revision.relative,
    digest: revision.digest,
    affectedUnits: 'web',
    acs: [fixtures.acceptanceBlock('AC-001', 'unit')]
  });

  var result = runCli([
    'quality', 'plan', root, '--spec', path.relative(root, specPath), '--format', 'json'
  ], root);
  assert.equal(result.status, 0, result.output);
  assert.equal(JSON.parse(result.output).source.profile.digest, revision.digest);
});

test('manual and unbound e2e facts never call or report Provider readiness', function(t) {
  var quality = require('../src/commands/quality');
  var input = require('../src/quality/input');
  var root = fixtures.createProject('unbound-e2e');
  t.after(function() { fixtures.cleanup(root); });
  var revision = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), true);
  var specPath = fixtures.writeSpec(root, 'unbound-e2e', {
    revision: revision.relative,
    digest: revision.digest,
    affectedUnits: 'web',
    acs: [
      fixtures.acceptanceBlock('AC-001', 'manual', { manualEvidence: 'review transcript' }),
      fixtures.acceptanceBlock('AC-002', 'e2e')
    ]
  });
  var loaded = input.loadQualityInput(root, specPath);
  var calls = 0;
  quality._private.attachReadiness(loaded, root, function() {
    calls++;
    return { state: 'ready', requiredProviders: [], missingProviders: [], issues: [] };
  });
  assert.equal(calls, 0);
  assert.equal(loaded.e2eReadiness, undefined);
  assert.ok(loaded.diagnostics.some(function(item) { return item.code === 'e2e-provider-unbound'; }));

  var result = runCli([
    'quality',
    'plan',
    root,
    '--spec',
    path.relative(root, specPath),
    '--format',
    'json'
  ], root);
  assert.equal(result.status, 0, result.output);
  var projection = JSON.parse(result.output);
  assert.equal(projection.e2eReadiness, null);
  assert.deepEqual(projection.acMappings, [
    { acId: 'AC-001', verification: 'manual', verificationCapability: 'manual-evidence' },
    { acId: 'AC-002', verification: 'e2e', verificationCapability: 'e2e-evidence' }
  ]);
  assert.ok(projection.diagnostics.some(function(item) { return item.code === 'e2e-provider-unbound'; }));

  var text = runCli([
    'quality',
    'plan',
    root,
    '--spec',
    path.relative(root, specPath)
  ], root);
  assert.equal(text.status, 0, text.output);
  assert.match(text.output, /\[attention\] e2e-provider-unbound:/);
  assert.doesNotMatch(text.output, /E2E_READINESS:/);
});

test('Quality composition short-circuits unbound E2E before readiness inspection', function(t) {
  var composition = require('../src/quality/composition');
  var root = fixtures.createProject('quality-composition-unbound');
  t.after(function() { fixtures.cleanup(root); });
  var revision = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), true);
  var specPath = fixtures.writeSpec(root, 'quality-composition-unbound', {
    revision: revision.relative,
    digest: revision.digest,
    affectedUnits: 'web',
    acs: [fixtures.acceptanceBlock('AC-001', 'e2e')]
  });
  var inspectionCalls = 0;

  var plan = composition.composeQualityPlan(root, specPath, {
    loadQualityInput: require('../src/quality/input').loadQualityInput,
    inspectReadiness: function() {
      inspectionCalls += 1;
      throw new Error('unbound E2E must not inspect readiness');
    },
    buildQualityPlan: require('../src/quality/planner').buildQualityPlan
  });

  assert.equal(inspectionCalls, 0);
  assert.equal(plan.blocking, false);
  assert.equal(plan.e2eReadiness, null);
  assert.ok(plan.diagnostics.some(function(item) { return item.code === 'e2e-provider-unbound'; }));
});

test('quality plan maps every existing Verification form while keeping AC facts separate from policy focus', function(t) {
  var root = fixtures.createProject('ac-mapping-contract');
  t.after(function() { fixtures.cleanup(root); });
  var revision = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), true);
  var specPath = fixtures.writeSpec(root, 'ac-mapping-contract', {
    revision: revision.relative,
    digest: revision.digest,
    affectedUnits: 'web',
    acs: [
      fixtures.acceptanceBlock('AC-001', 'unit'),
      fixtures.acceptanceBlock('AC-002', 'integration'),
      fixtures.acceptanceBlock('AC-003', 'e2e', { provider: 'web-e2e' }),
      fixtures.acceptanceBlock('AC-004', 'manual', { manualEvidence: 'review transcript' })
    ]
  });

  var json = runCli([
    'quality', 'plan', root, '--spec', path.relative(root, specPath), '--format', 'json'
  ], root);
  assert.equal(json.status, 0, json.output);
  var projection = JSON.parse(json.output);
  assert.deepEqual(projection.acMappings, [
    { acId: 'AC-001', verification: 'unit', verificationCapability: 'unit-evidence' },
    { acId: 'AC-002', verification: 'integration', verificationCapability: 'integration-evidence' },
    { acId: 'AC-003', verification: 'e2e', verificationCapability: 'e2e-evidence' },
    { acId: 'AC-004', verification: 'manual', verificationCapability: 'manual-evidence' }
  ]);
  assert.equal(projection.acFacts[3].manualEvidence, 'review transcript');
  assert.equal(Object.prototype.hasOwnProperty.call(projection.policyFocus[0], 'coverage'), false);
  assert.doesNotMatch(json.output, /"approval"|"pass"|"fail"/i);

  var text = runCli([
    'quality', 'plan', root, '--spec', path.relative(root, specPath)
  ], root);
  assert.equal(text.status, 0, text.output);
  assert.match(text.output, /AC_MAPPINGS:\r?\n- AC-001: unit -> unit-evidence/);
  assert.doesNotMatch(text.output, /PHASE_HINT|NEXT_ACTION|ARCHIVE_ELIGIBILITY/);
});

test('quality plan is deterministic and Quality modules do not add execution primitives', function(t) {
  var root = fixtures.createProject('deterministic');
  t.after(function() { fixtures.cleanup(root); });
  var revision = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), true);
  var specPath = fixtures.writeSpec(root, 'deterministic', {
    revision: revision.relative,
    digest: revision.digest,
    affectedUnits: 'web',
    acs: [fixtures.acceptanceBlock('AC-001', 'unit')]
  });
  var args = [
    'quality',
    'plan',
    root,
    '--spec',
    path.relative(root, specPath),
    '--format',
    'json'
  ];
  var before = fixtures.snapshotTree(root);
  var first = runCli(args, root);
  var second = runCli(args, root);
  assert.equal(first.status, 0, first.output);
  assert.equal(second.status, 0, second.output);
  assert.equal(first.output, second.output);
  assert.deepEqual(fixtures.snapshotTree(root), before);
  ['catalog.js', 'input.js', 'planner.js'].forEach(function(file) {
    var source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'quality', file), 'utf8');
    assert.doesNotMatch(source, /child_process|execFile|spawn|verify init|verify run|npm install/i);
  });
  var command = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'commands', 'quality.js'), 'utf8');
  assert.doesNotMatch(command, /child_process|execFile|spawn|verify init|verify run|npm install/i);
});

test('README and GUIDE describe quality plan according to their document roles', function() {
  var readme = fs.readFileSync(path.resolve(__dirname, '..', 'README.md'), 'utf8');
  assert.match(readme, /只读[^。\n]{0,30}Quality Plan|Quality Plan[^。\n]{0,30}只读/);
  assert.match(readme, /不改变 AC/);

  var guide = fs.readFileSync(path.resolve(__dirname, '..', 'GUIDE.md'), 'utf8');
  assert.match(guide, /只读[^。\n]{0,30}Quality Plan|Quality Plan[^。\n]{0,30}只读/);
  assert.match(guide, /AC 是唯一验收真相/);
  assert.match(guide, /不会改变[^。\n]{0,20}验收|这个建议不会改变它/);
  assert.match(guide, /sdd quality plan/);
});

test('quality plan rejects invalid format as a stable quality usage error', function(t) {
  var root = fixtures.createProject('usage');
  t.after(function() { fixtures.cleanup(root); });
  var result = runCli(['quality', 'plan', root, '--format', 'yaml'], root);
  assert.equal(result.status, 3, result.output);
  assert.match(result.output, /\[SDD_QUALITY_USAGE\]/);
  assert.doesNotMatch(result.output, /QualityError|Unhandled/);
});
