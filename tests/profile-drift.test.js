'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var fixtures = require('./helpers/profile-fixtures');
var candidateService = require('../src/profile/candidate');
var canonical = require('../src/profile/canonical');
var store = require('../src/profile/store');

function addPackage(root, value) {
  fixtures.write(path.join(root, 'package.json'), JSON.stringify(value, null, 2) + '\n');
}

function confirm(root, edit) {
  var envelope = candidateService.detectProfile(root);
  if (edit) edit(envelope.candidate);
  fixtures.write(path.join(root, 'candidate.json'), JSON.stringify(envelope.candidate, null, 2));
  var digest = canonical.digestProfile(envelope.candidate.profile);
  return store.confirmProfile(root, {
    candidate: 'candidate.json', expectedDigest: digest, confirmedBy: 'human:fixture', confirmationEvidence: 'approved exact digest'
  });
}

test('profile show resolves and validates current immutable revision', function(t) {
  var root = fixtures.createProject('show');
  t.after(function() { fixtures.cleanup(root); });
  addPackage(root, { name: 'web', dependencies: { react: '^19.0.0' } });
  var saved = confirm(root);
  var result = fixtures.runCli(['profile', 'show', root, '--format', 'json'], root);
  assert.equal(result.status, 0, result.output);
  var body = JSON.parse(result.stdout);
  assert.equal(body.profileState, 'confirmed');
  assert.equal(body.profileDigest, saved.profileDigest);
  assert.equal(body.revision.profile.units[0].roles[0], 'frontend');
});

test('profile check reports clean without writes when detected facts are unchanged', function(t) {
  var root = fixtures.createProject('check-clean');
  t.after(function() { fixtures.cleanup(root); });
  addPackage(root, { name: 'api', dependencies: { express: '^5.0.0' } });
  confirm(root);
  var before = fixtures.snapshotTree(root);
  var result = fixtures.runCli(['profile', 'check', root, '--format', 'json'], root);
  assert.equal(result.status, 0, result.output);
  assert.equal(JSON.parse(result.stdout).profileState, 'clean');
  assert.deepEqual(fixtures.snapshotTree(root), before);
});

test('profile check reports bounded drift and never overwrites current', function(t) {
  var root = fixtures.createProject('check-drift');
  t.after(function() { fixtures.cleanup(root); });
  addPackage(root, { name: 'api', dependencies: { express: '^5.0.0' } });
  var saved = confirm(root);
  var currentFile = path.join(root, 'mydocs/profiles/current.json');
  var before = fs.readFileSync(currentFile, 'utf8');
  addPackage(root, { name: 'api', dependencies: { fastify: '^5.0.0' } });
  var result = fixtures.runCli(['profile', 'check', root, '--format', 'json'], root);
  assert.equal(result.status, 2, result.output);
  var body = JSON.parse(result.stdout);
  assert.equal(body.profileState, 'drifted');
  assert.equal(body.currentDigest, saved.profileDigest);
  assert.ok(body.differences.changed.length + body.differences.sourceStale.length > 0);
  assert.equal(fs.readFileSync(currentFile, 'utf8'), before);
});

test('human classification stays pinned but conflicting static evidence requires review', function(t) {
  var root = fixtures.createProject('check-human');
  t.after(function() { fixtures.cleanup(root); });
  addPackage(root, { name: 'mystery' });
  confirm(root, function(candidate) {
    var unit = candidate.profile.units[0];
    unit.roles = ['frontend'];
    unit.evidence.push({ id: 'ev-human-role', path: 'package.json', kind: 'human-classification', claim: 'browser application', confidence: 'human' });
  });
  var clean = fixtures.runCli(['profile', 'check', root, '--format', 'json'], root);
  assert.equal(clean.status, 0, clean.output);
  assert.equal(JSON.parse(clean.stdout).profileState, 'clean');
  addPackage(root, { name: 'mystery', dependencies: { express: '^5.0.0' } });
  var conflict = fixtures.runCli(['profile', 'check', root, '--format', 'json'], root);
  assert.equal(conflict.status, 2, conflict.output);
  assert.ok(JSON.parse(conflict.stdout).differences.reviewRequired.length > 0);
});

test('human roles are not pinned by unrelated human evidence or missing classification evidence', function(t) {
  var unrelated = fixtures.createProject('check-human-unrelated');
  t.after(function() { fixtures.cleanup(unrelated); });
  addPackage(unrelated, { name: 'mystery' });
  confirm(unrelated, function(candidate) {
    var unit = candidate.profile.units[0];
    unit.roles = ['frontend'];
    unit.evidence.push({ id: 'ev-human-note', path: 'package.json', kind: 'human-note', claim: 'reviewed manifest', confidence: 'human' });
  });
  var unrelatedResult = fixtures.runCli(['profile', 'check', unrelated, '--format', 'json'], unrelated);
  assert.equal(unrelatedResult.status, 2, unrelatedResult.output);
  assert.equal(JSON.parse(unrelatedResult.stdout).profileState, 'drifted');

  var missing = fixtures.createProject('check-human-missing');
  t.after(function() { fixtures.cleanup(missing); });
  addPackage(missing, { name: 'mystery' });
  fixtures.write(path.join(missing, 'classification.txt'), 'approved browser role\n');
  confirm(missing, function(candidate) {
    var unit = candidate.profile.units[0];
    unit.roles = ['frontend'];
    unit.evidence.push({ id: 'ev-human-role', path: 'classification.txt', kind: 'human-classification', claim: 'browser application', confidence: 'human' });
  });
  fs.unlinkSync(path.join(missing, 'classification.txt'));
  var missingResult = fixtures.runCli(['profile', 'check', missing, '--format', 'json'], missing);
  assert.equal(missingResult.status, 2, missingResult.output);
  assert.equal(JSON.parse(missingResult.stdout).profileState, 'drifted');
});

test('human relations require valid relation evidence and matching endpoint roots', function(t) {
  var root = fixtures.createProject('check-human-relation');
  t.after(function() { fixtures.cleanup(root); });
  fixtures.write(path.join(root, 'package.json'), JSON.stringify({ name: 'root', private: true, workspaces: ['apps/*'] }, null, 2) + '\n');
  fixtures.write(path.join(root, 'apps/web/package.json'), JSON.stringify({ name: 'web', dependencies: { react: '^19.0.0' } }, null, 2) + '\n');
  fixtures.write(path.join(root, 'apps/api/package.json'), JSON.stringify({ name: 'api', dependencies: { express: '^5.0.0' } }, null, 2) + '\n');
  fixtures.write(path.join(root, 'relation.txt'), 'web calls api\n');
  confirm(root, function(candidate) {
    var web = candidate.profile.units.find(function(unit) { return unit.id === 'web'; });
    web.evidence.push({ id: 'ev-human-relation', path: 'relation.txt', kind: 'human-relation', claim: 'web calls api', confidence: 'human' });
    candidate.profile.relations.push({ from: 'web', to: 'api', kind: 'calls', evidenceIds: ['ev-human-relation'], confidence: 'human' });
  });
  var clean = fixtures.runCli(['profile', 'check', root, '--format', 'json'], root);
  assert.equal(clean.status, 0, clean.output);
  fs.unlinkSync(path.join(root, 'relation.txt'));
  var stale = fixtures.runCli(['profile', 'check', root, '--format', 'json'], root);
  assert.equal(stale.status, 2, stale.output);
  assert.equal(JSON.parse(stale.stdout).profileState, 'drifted');
});

test('profile check reports missing current as an actionable read-only state', function(t) {
  var root = fixtures.createProject('check-missing');
  t.after(function() { fixtures.cleanup(root); });
  var before = fixtures.snapshotTree(root);
  var result = fixtures.runCli(['profile', 'check', root], root);
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /PROFILE_STATE: missing/);
  assert.match(result.output, /NEXT_ACTION: detect_and_confirm_profile/);
  assert.deepEqual(fixtures.snapshotTree(root), before);
});
