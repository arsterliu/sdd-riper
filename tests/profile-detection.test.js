'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('path');
var fixtures = require('./helpers/profile-fixtures');

function pkg(root, relative, value) {
  fixtures.write(path.join(root, relative, 'package.json'), JSON.stringify(value, null, 2) + '\n');
}

test('detects deterministic frontend backend contract units and internal relations', function(t) {
  var candidate = require('../src/profile/candidate');
  var root = fixtures.createProject('monorepo');
  t.after(function() { fixtures.cleanup(root); });
  pkg(root, '.', { name: 'workspace', private: true, workspaces: ['apps/*', 'services/*', 'packages/*'] });
  pkg(root, 'apps/web', { name: '@demo/web', dependencies: { react: '^19.0.0', '@demo/contracts': 'workspace:*' }, scripts: { test: 'vitest', build: 'vite build' } });
  pkg(root, 'services/api', { name: '@demo/api', dependencies: { express: '^5.0.0', '@demo/contracts': 'workspace:*' }, scripts: { test: 'node --test' } });
  pkg(root, 'packages/contracts', { name: '@demo/contracts', sddProfile: { roles: ['contract'] }, types: 'index.d.ts' });
  fixtures.write(path.join(root, 'apps/web/src/main.tsx'), 'export {};\n');

  var first = candidate.detectProfile(root);
  var second = candidate.detectProfile(root);
  assert.deepEqual(first, second);
  assert.equal(first.profileState, 'detected');
  assert.deepEqual(first.candidate.profile.units.map(function(unit) { return unit.id; }), ['api', 'contracts', 'web', 'workspace']);
  assert.deepEqual(first.candidate.profile.units.find(function(unit) { return unit.id === 'web'; }).roles, ['frontend']);
  assert.deepEqual(first.candidate.profile.units.find(function(unit) { return unit.id === 'api'; }).roles, ['backend']);
  assert.deepEqual(first.candidate.profile.units.find(function(unit) { return unit.id === 'contracts'; }).roles, ['contract']);
  assert.ok(first.candidate.profile.relations.some(function(relation) { return relation.from === 'web' && relation.to === 'contracts'; }));
  assert.ok(first.candidate.profile.relations.some(function(relation) { return relation.from === 'api' && relation.to === 'contracts'; }));
  assert.ok(!JSON.stringify(first).includes('vite build'));
});

test('models one package with frontend and backend roles instead of a fullstack label', function(t) {
  var candidate = require('../src/profile/candidate');
  var root = fixtures.createProject('multi-role');
  t.after(function() { fixtures.cleanup(root); });
  pkg(root, '.', { name: 'next-app', dependencies: { react: '^19.0.0', express: '^5.0.0' } });
  var unit = candidate.detectProfile(root).candidate.profile.units[0];
  assert.deepEqual(unit.roles, ['backend', 'frontend']);
  assert.ok(!unit.roles.includes('fullstack'));
});

test('detects mixed-language manifest roots without executing build tools', function(t) {
  var candidate = require('../src/profile/candidate');
  var root = fixtures.createProject('mixed');
  t.after(function() { fixtures.cleanup(root); });
  fixtures.write(path.join(root, 'java/pom.xml'), '<project><artifactId>api</artifactId></project>');
  fixtures.write(path.join(root, 'python/pyproject.toml'), '[project]\nname="worker"\n');
  fixtures.write(path.join(root, 'go/go.mod'), 'module example.test/service\n');
  fixtures.write(path.join(root, 'rust/Cargo.toml'), '[package]\nname="core"\n');
  fixtures.write(path.join(root, 'dotnet/App.csproj'), '<Project Sdk="Microsoft.NET.Sdk" />');
  var units = candidate.detectProfile(root).candidate.profile.units;
  assert.deepEqual(units.map(function(unit) { return unit.languages[0]; }).sort(), ['csharp', 'go', 'java', 'python', 'rust']);
  units.forEach(function(unit) { assert.deepEqual(unit.roles, ['unknown']); });
});

test('returns an empty successful candidate without writing project files', function(t) {
  var candidate = require('../src/profile/candidate');
  var root = fixtures.createProject('empty');
  t.after(function() { fixtures.cleanup(root); });
  var before = fixtures.snapshotTree(root);
  var result = candidate.detectProfile(root);
  assert.equal(result.profileState, 'empty');
  assert.deepEqual(result.candidate.profile.units, []);
  assert.deepEqual(fixtures.snapshotTree(root), before);
});

test('never executes or persists package script bodies and keeps unsupported roles unknown', function(t) {
  var candidate = require('../src/profile/candidate');
  var root = fixtures.createProject('malicious');
  t.after(function() { fixtures.cleanup(root); });
  var marker = path.join(root, 'owned.txt');
  pkg(root, '.', { name: 'mystery', scripts: { postinstall: 'echo owned > "' + marker + '"', test: 'token=super-secret' } });
  var serialized = JSON.stringify(candidate.detectProfile(root));
  assert.equal(require('fs').existsSync(marker), false);
  assert.doesNotMatch(serialized, /echo owned|super-secret|postinstall/);
  assert.deepEqual(JSON.parse(serialized).candidate.profile.units[0].roles, ['unknown']);
});
