'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var fixtures = require('./helpers/profile-fixtures');
var candidateService = require('../src/profile/candidate');
var canonical = require('../src/profile/canonical');
var store = require('../src/profile/store');

function addMonorepo(root) {
  fixtures.write(path.join(root, 'package.json'), JSON.stringify({ name: 'root', private: true, workspaces: ['apps/*'] }, null, 2) + '\n');
  fixtures.write(path.join(root, 'apps/web/package.json'), JSON.stringify({ name: 'web', dependencies: { react: '^19.0.0' } }, null, 2) + '\n');
  fixtures.write(path.join(root, 'apps/api/package.json'), JSON.stringify({ name: 'api', dependencies: { express: '^5.0.0' } }, null, 2) + '\n');
}

function confirmDetected(root) {
  var detected = candidateService.detectProfile(root);
  fixtures.write(path.join(root, 'candidate.json'), JSON.stringify(detected.candidate, null, 2));
  return store.confirmProfile(root, {
    candidate: 'candidate.json', expectedDigest: detected.candidateDigest,
    confirmedBy: 'human:fixture', confirmationEvidence: 'approved exact digest'
  });
}

function discover(root, name, units) {
  var args = ['discover', root, '--task-name', name, '--spec-version', 'v9.1', '--mode', 'standard', '--requirement', '验证 profile 继承'];
  if (units) args = args.concat(['--unit']).concat(units);
  return fixtures.runCli(args, root);
}

test('discover binds exact immutable profile revision and normalized affected units', function(t) {
  var root = fixtures.createProject('discover-bind');
  t.after(function() { fixtures.cleanup(root); });
  addMonorepo(root);
  var saved = confirmDetected(root);
  var result = discover(root, 'bound-task', ['web', 'api']);
  assert.equal(result.status, 0, result.output);
  var spec = fs.readFileSync(path.join(root, 'mydocs/specs/v9.1-bound-task.md'), 'utf8');
  assert.match(spec, new RegExp('^project-profile-revision: "' + saved.revision.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"$', 'm'));
  assert.match(spec, new RegExp('^project-profile-digest: "' + saved.profileDigest + '"$', 'm'));
  assert.match(spec, /^affected-units: "api,web"$/m);
});

test('discover with confirmed profile rejects missing or unknown units before any artifact write', function(t) {
  var root = fixtures.createProject('discover-gate');
  t.after(function() { fixtures.cleanup(root); });
  addMonorepo(root);
  confirmDetected(root);
  var before = fixtures.snapshotTree(root);
  var missing = discover(root, 'missing-units');
  assert.equal(missing.status, 3, missing.output);
  assert.match(missing.output, /SDD_PROFILE_AFFECTED_UNITS_REQUIRED/);
  assert.deepEqual(fixtures.snapshotTree(root), before);
  var unknown = discover(root, 'unknown-units', ['ghost']);
  assert.equal(unknown.status, 3, unknown.output);
  assert.match(unknown.output, /SDD_PROFILE_UNIT_UNKNOWN/);
  assert.deepEqual(fixtures.snapshotTree(root), before);
});

test('discover preserves legacy behavior without current profile and accepts project scope with one', function(t) {
  var legacy = fixtures.createProject('discover-legacy');
  t.after(function() { fixtures.cleanup(legacy); });
  var old = discover(legacy, 'legacy-task');
  assert.equal(old.status, 0, old.output);
  var oldSpec = fs.readFileSync(path.join(legacy, 'mydocs/specs/v9.1-legacy-task.md'), 'utf8');
  assert.match(oldSpec, /^project-profile-revision: ""$/m);
  var root = fixtures.createProject('discover-project');
  t.after(function() { fixtures.cleanup(root); });
  addMonorepo(root);
  confirmDetected(root);
  var scoped = discover(root, 'project-task', ['project']);
  assert.equal(scoped.status, 0, scoped.output);
  assert.match(fs.readFileSync(path.join(root, 'mydocs/specs/v9.1-project-task.md'), 'utf8'), /^affected-units: "project"$/m);
});

test('later current changes do not alter or remove historical Spec revision', function(t) {
  var root = fixtures.createProject('discover-history');
  t.after(function() { fixtures.cleanup(root); });
  addMonorepo(root);
  var first = confirmDetected(root);
  assert.equal(discover(root, 'history-task', ['web']).status, 0);
  var specFile = path.join(root, 'mydocs/specs/v9.1-history-task.md');
  var before = fs.readFileSync(specFile, 'utf8');
  var apiFile = path.join(root, 'apps/api/package.json');
  fixtures.write(apiFile, JSON.stringify({ name: 'api', dependencies: { fastify: '^5.0.0' } }, null, 2) + '\n');
  var second = confirmDetected(root);
  assert.notEqual(second.profileDigest, first.profileDigest);
  assert.equal(fs.readFileSync(specFile, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(root, 'mydocs', first.revision)), true);
});

test('validate checks declared immutable profile references without consulting current', function(t) {
  var root = fixtures.createProject('discover-validate');
  t.after(function() { fixtures.cleanup(root); });
  addMonorepo(root);
  confirmDetected(root);
  assert.equal(discover(root, 'validate-task', ['web']).status, 0);
  var specFile = path.join(root, 'mydocs/specs/v9.1-validate-task.md');
  var validate = require('../src/commands/validate');
  var valid = validate.validateSpec(specFile, { projectDir: root });
  assert.equal(valid.issues.some(function(issue) { return /Project Profile/.test(issue); }), false, valid.issues.join('\n'));
  var content = fs.readFileSync(specFile, 'utf8').replace(/^affected-units: "web"$/m, 'affected-units: "ghost"');
  fs.writeFileSync(specFile, content, 'utf8');
  var invalid = validate.validateSpec(specFile, { projectDir: root });
  assert.ok(invalid.issues.some(function(issue) { return /Project Profile.*unknown affected unit.*ghost/.test(issue); }), invalid.issues.join('\n'));
});
