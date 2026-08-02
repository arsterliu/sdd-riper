'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var fixtures = require('./helpers/quality-fixtures');

test('Catalog v1 exposes only the approved role, relation, and verification mappings', function() {
  var catalog = require('../src/quality/catalog');
  assert.equal(catalog.POLICY_VERSION, '1');
  assert.deepEqual(catalog.roleRule('frontend'), {
    focus: 'frontend-behavior',
    capabilities: ['unit-evidence', 'e2e-evidence']
  });
  assert.deepEqual(catalog.roleRule('backend'), {
    focus: 'backend-behavior',
    capabilities: ['unit-evidence', 'integration-evidence']
  });
  assert.deepEqual(catalog.relationRule('depends-on'), {
    focus: 'cross-unit-boundary',
    capabilities: ['integration-evidence']
  });
  assert.equal(catalog.roleRule('unknown'), null);
  assert.equal(catalog.capabilityForVerification('manual'), 'manual-evidence');
  assert.equal(catalog.capabilityForVerification('unsupported'), null);
});

test('Catalog rules cannot be mutated by a planner caller', function() {
  var catalog = require('../src/quality/catalog');
  var first = catalog.roleRule('frontend');
  first.capabilities.push('unexpected-evidence');
  assert.deepEqual(catalog.roleRule('frontend'), {
    focus: 'frontend-behavior',
    capabilities: ['unit-evidence', 'e2e-evidence']
  });
});

test('Planner expands project scope, preserves reasons, and never claims AC coverage', function() {
  var planner = require('../src/quality/planner');
  var profile = fixtures.profile([
    fixtures.unit('web', ['frontend', 'unknown']),
    fixtures.unit('api', ['backend'])
  ], [{
    from: 'web',
    to: 'api',
    kind: 'depends-on',
    evidenceIds: [],
    confidence: 'high'
  }]);
  var result = planner.buildQualityPlan({
    source: {
      specPath: 'mydocs/specs/fixture.md',
      taskName: 'fixture',
      profile: { revision: 'profiles/revisions/sha256-fixture.json', digest: 'sha256:fixture' },
      declaredAffectedUnits: ['project']
    },
    profile: profile,
    acFacts: [
      { acId: 'AC-001', verification: 'unit', provider: '', manualEvidence: '' },
      { acId: 'AC-002', verification: 'manual', provider: '', manualEvidence: 'review transcript' }
    ]
  });

  assert.deepEqual(result.source.effectiveAffectedUnits, ['api', 'web']);
  assert.deepEqual(result.policyFocus.map(function(item) { return item.id; }), [
    'frontend-behavior',
    'backend-behavior',
    'cross-unit-boundary'
  ]);
  assert.deepEqual(result.acMappings, [
    { acId: 'AC-001', verification: 'unit', verificationCapability: 'unit-evidence' },
    { acId: 'AC-002', verification: 'manual', verificationCapability: 'manual-evidence' }
  ]);
  assert.ok(result.diagnostics.some(function(item) { return item.code === 'role-unknown'; }));
  assert.equal(Object.prototype.hasOwnProperty.call(result.policyFocus[0], 'coverage'), false);
});

test('Planner routes every catalog role and only maps relations whose two endpoints are in scope', function() {
  var planner = require('../src/quality/planner');
  var profile = fixtures.profile([
    fixtures.unit('web', ['frontend', 'unknown']),
    fixtures.unit('api', ['backend']),
    fixtures.unit('contracts', ['contract']),
    fixtures.unit('library', ['library']),
    fixtures.unit('tooling', ['tool'])
  ], [{
    from: 'web',
    to: 'api',
    kind: 'depends-on',
    evidenceIds: [],
    confidence: 'high'
  }, {
    from: 'api',
    to: 'contracts',
    kind: 'publishes',
    evidenceIds: [],
    confidence: 'high'
  }]);
  var result = planner.buildQualityPlan({
    source: {
      specPath: 'mydocs/specs/all-roles.md',
      taskName: 'all-roles',
      profile: { revision: 'profiles/revisions/sha256-fixture.json', digest: 'sha256:fixture' },
      declaredAffectedUnits: ['project']
    },
    profile: profile,
    acFacts: []
  });

  assert.equal(result.blocking, false);
  assert.deepEqual(result.source.effectiveAffectedUnits, ['api', 'contracts', 'library', 'tooling', 'web']);
  assert.deepEqual(result.policyFocus.map(function(item) { return item.id; }), [
    'frontend-behavior',
    'backend-behavior',
    'contract-compatibility',
    'consumer-compatibility',
    'tool-behavior',
    'cross-unit-boundary'
  ]);
  assert.deepEqual(result.policyFocus[0].reasons, [
    { kind: 'role', unitId: 'web', role: 'frontend' }
  ]);
  assert.deepEqual(result.policyFocus[5].reasons, [
    { kind: 'relation', from: 'web', to: 'api', relationKind: 'depends-on' }
  ]);
  assert.deepEqual(result.diagnostics.map(function(item) { return item.code; }), [
    'relation-kind-unmapped',
    'role-unknown'
  ]);
});

test('Quality input resolves the Spec-bound immutable Profile and ignores commented AC scaffolding', function(t) {
  var input = require('../src/quality/input');
  var root = fixtures.createProject('exact-input');
  t.after(function() { fixtures.cleanup(root); });
  var bound = fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('web', ['frontend'])
  ]), false);
  fixtures.writeRevision(root, fixtures.profile([
    fixtures.unit('api', ['backend'])
  ]), true);
  var specPath = fixtures.writeSpec(root, 'exact-input', {
    revision: bound.relative,
    digest: bound.digest,
    affectedUnits: 'web',
    acs: [
      '<!--\n### AC-999: ignored template\nVerification: e2e\nProvider: ignored-provider\n-->',
      fixtures.acceptanceBlock('AC-001', 'unit')
    ]
  });

  var result = input.loadQualityInput(root, specPath);
  assert.equal(result.blocking, false);
  assert.equal(result.specPath, fs.realpathSync(specPath));
  assert.match(result.specContent, /AC-001/);
  assert.equal(result.source.profile.digest, bound.digest);
  assert.deepEqual(result.profile.units.map(function(unit) { return unit.id; }), ['web']);
  assert.deepEqual(result.acFacts, [
    { acId: 'AC-001', verification: 'unit', provider: '', manualEvidence: '' }
  ]);
});

test('Planner preserves a corrupted Profile reference diagnostic without inventing profile-required', function() {
  var planner = require('../src/quality/planner');
  var result = planner.buildQualityPlan({
    source: {
      specPath: 'mydocs/specs/broken.md',
      taskName: 'broken',
      profile: null,
      declaredAffectedUnits: []
    },
    acFacts: [{ acId: 'AC-001', verification: 'unit', provider: '', manualEvidence: '' }],
    diagnostics: [{
      code: 'profile-reference-invalid',
      severity: 'blocking',
      message: 'exact revision is unreadable'
    }],
    blocking: true
  });

  assert.equal(result.blocking, true);
  assert.deepEqual(result.policyFocus, []);
  assert.deepEqual(result.acMappings, []);
  assert.deepEqual(result.diagnostics.map(function(item) { return item.code; }), ['profile-reference-invalid']);
});

test('Planner blocks mixed project scope and keeps single-ended relations outside explicit scope', function() {
  var planner = require('../src/quality/planner');
  var profile = fixtures.profile([
    fixtures.unit('web', ['frontend']),
    fixtures.unit('api', ['backend'])
  ], [{
    from: 'web',
    to: 'api',
    kind: 'depends-on',
    evidenceIds: [],
    confidence: 'high'
  }]);
  var mixed = planner.buildQualityPlan({
    source: {
      specPath: 'mydocs/specs/mixed.md',
      taskName: 'mixed',
      profile: { revision: 'profiles/revisions/sha256-fixture.json', digest: 'sha256:fixture' },
      declaredAffectedUnits: ['project', 'web']
    },
    profile: profile,
    acFacts: []
  });
  assert.equal(mixed.blocking, true);
  assert.deepEqual(mixed.source.effectiveAffectedUnits, []);
  assert.deepEqual(mixed.diagnostics.map(function(item) { return item.code; }), ['scope-ambiguous']);

  var explicit = planner.buildQualityPlan({
    source: {
      specPath: 'mydocs/specs/explicit.md',
      taskName: 'explicit',
      profile: { revision: 'profiles/revisions/sha256-fixture.json', digest: 'sha256:fixture' },
      declaredAffectedUnits: ['web', 'web']
    },
    profile: profile,
    acFacts: []
  });
  assert.equal(explicit.blocking, false);
  assert.deepEqual(explicit.source.effectiveAffectedUnits, ['web']);
  assert.deepEqual(explicit.policyFocus.map(function(item) { return item.id; }), ['frontend-behavior']);
  assert.ok(explicit.diagnostics.some(function(item) { return item.code === 'related-unit-out-of-scope'; }));
  assert.equal(explicit.policyFocus.some(function(item) { return item.id === 'cross-unit-boundary'; }), false);
});

test('Planner fail-closes an unknown affected unit without expanding scope from relation facts', function() {
  var planner = require('../src/quality/planner');
  var result = planner.buildQualityPlan({
    source: {
      specPath: 'mydocs/specs/unknown-unit.md',
      taskName: 'unknown-unit',
      profile: { revision: 'profiles/revisions/sha256-fixture.json', digest: 'sha256:fixture' },
      declaredAffectedUnits: ['missing-unit']
    },
    profile: fixtures.profile([
      fixtures.unit('web', ['frontend'])
    ], [{
      from: 'web',
      to: 'missing-unit',
      kind: 'depends-on',
      evidenceIds: [],
      confidence: 'low'
    }]),
    acFacts: [{ acId: 'AC-001', verification: 'unit', provider: '', manualEvidence: '' }]
  });

  assert.equal(result.blocking, true);
  assert.deepEqual(result.source.effectiveAffectedUnits, []);
  assert.deepEqual(result.policyFocus, []);
  assert.deepEqual(result.acMappings, []);
  assert.equal(result.diagnostics[0].code, 'affected-unit-unknown');
});
