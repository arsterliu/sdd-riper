'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var fixtures = require('./helpers/profile-fixtures');

function addPackage(root, value) {
  fixtures.write(path.join(root, 'package.json'), JSON.stringify(value, null, 2) + '\n');
}

test('profile detect emits clean JSON and remains read-only', function(t) {
  var root = fixtures.createProject('cli-detect');
  t.after(function() { fixtures.cleanup(root); });
  addPackage(root, { name: 'web', dependencies: { react: '^19.0.0' } });
  var before = fixtures.snapshotTree(root);
  var result = fixtures.runCli(['profile', 'detect', root, '--format', 'json'], root);
  assert.equal(result.status, 0, result.output);
  assert.equal(result.stderr, '');
  var body = JSON.parse(result.stdout);
  assert.equal(body.profileState, 'detected');
  assert.match(body.candidateDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(body.candidate.profile.units[0].id, 'web');
  assert.deepEqual(fixtures.snapshotTree(root), before);
});

test('profile detect returns actionable empty state without creating a profile', function(t) {
  var root = fixtures.createProject('cli-empty');
  t.after(function() { fixtures.cleanup(root); });
  var result = fixtures.runCli(['profile', 'detect', root], root);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /PROFILE_STATE: empty/);
  assert.match(result.output, /NEXT_ACTION: create_bootstrap_spec/);
  assert.equal(fs.existsSync(path.join(root, 'mydocs/profiles/current.json')), false);
});

test('profile review validates a saved and human-corrected candidate without writes', function(t) {
  var root = fixtures.createProject('cli-review');
  t.after(function() { fixtures.cleanup(root); });
  addPackage(root, { name: 'mystery' });
  var detected = fixtures.runCli(['profile', 'detect', root, '--format', 'json'], root);
  var envelope = JSON.parse(detected.stdout);
  var unit = envelope.candidate.profile.units[0];
  unit.roles = ['frontend'];
  unit.evidence.push({ id: 'ev-human-role', path: 'package.json', kind: 'human-classification', claim: 'browser application', confidence: 'human' });
  var candidateFile = path.join(root, 'candidate.json');
  fixtures.write(candidateFile, JSON.stringify(envelope, null, 2));
  var before = fixtures.snapshotTree(root);
  var reviewed = fixtures.runCli(['profile', 'review', root, '--candidate', 'candidate.json', '--format', 'json'], root);
  assert.equal(reviewed.status, 0, reviewed.output);
  var body = JSON.parse(reviewed.stdout);
  assert.equal(body.profileState, 'reviewable');
  assert.match(body.candidateDigest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(body.candidate.profile.units[0].roles, ['frontend']);
  assert.deepEqual(fixtures.snapshotTree(root), before);
});

test('profile review rejects stale sources and candidate path escape', function(t) {
  var root = fixtures.createProject('cli-stale');
  t.after(function() { fixtures.cleanup(root); });
  addPackage(root, { name: 'api', dependencies: { express: '^5.0.0' } });
  var detected = fixtures.runCli(['profile', 'detect', root, '--format', 'json'], root);
  fixtures.write(path.join(root, 'candidate.json'), detected.stdout);
  addPackage(root, { name: 'api', dependencies: { express: '^5.1.0' } });
  var stale = fixtures.runCli(['profile', 'review', root, '--candidate', 'candidate.json'], root);
  assert.equal(stale.status, 2, stale.output);
  assert.match(stale.output, /SDD_PROFILE_CANDIDATE_STALE/);
  var escaped = fixtures.runCli(['profile', 'review', root, '--candidate', '../outside.json'], root);
  assert.equal(escaped.status, 2, escaped.output);
  assert.match(escaped.output, /SDD_PROFILE_PATH_ESCAPE/);
});

test('profile confirm requires explicit authorization and emits a confirmed digest', function(t) {
  var root = fixtures.createProject('cli-confirm');
  t.after(function() { fixtures.cleanup(root); });
  addPackage(root, { name: 'web', dependencies: { react: '^19.0.0' } });
  var detected = fixtures.runCli(['profile', 'detect', root, '--format', 'json'], root);
  var envelope = JSON.parse(detected.stdout);
  fixtures.write(path.join(root, 'candidate.json'), detected.stdout);
  var denied = fixtures.runCli(['profile', 'confirm', root, '--candidate', 'candidate.json', '--expected-digest', envelope.candidateDigest], root);
  assert.equal(denied.status, 2, denied.output);
  assert.match(denied.output, /SDD_PROFILE_CONFIRM_AUTH_REQUIRED/);
  assert.equal(fs.existsSync(path.join(root, 'mydocs/profiles/current.json')), false);
  var confirmed = fixtures.runCli([
    'profile', 'confirm', root, '--candidate', 'candidate.json', '--expected-digest', envelope.candidateDigest,
    '--confirmed-by', 'human:fixture', '--confirmation-evidence', 'approved exact digest', '--format', 'json'
  ], root);
  assert.equal(confirmed.status, 0, confirmed.output);
  var body = JSON.parse(confirmed.stdout);
  assert.equal(body.profileState, 'confirmed');
  assert.equal(body.profileDigest, envelope.candidateDigest);
});
