'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fixtures = require('./helpers/profile-fixtures');

test('profile v1 schema accepts exact candidate and rejects unknown or invalid facts', function() {
  var schema = require('../src/profile/schema');
  assert.doesNotThrow(function() { schema.validateCandidate(fixtures.validCandidate()); });

  var unknown = fixtures.validCandidate();
  unknown.command = 'npm test';
  assert.throws(function() { schema.validateCandidate(unknown); }, /SDD_PROFILE_CANDIDATE_INVALID/);

  var invalidRole = fixtures.validCandidate();
  invalidRole.profile.units[0].roles = ['fullstack'];
  assert.throws(function() { schema.validateCandidate(invalidRole); }, /SDD_PROFILE_CANDIDATE_INVALID/);

  var dangling = fixtures.validCandidate();
  dangling.profile.relations.push({ from: 'web', to: 'missing', kind: 'depends-on', evidenceIds: [], confidence: 'low' });
  assert.throws(function() { schema.validateCandidate(dangling); }, /SDD_PROFILE_CANDIDATE_INVALID/);
});

test('canonical profile digest ignores key and set ordering but changes with facts', function() {
  var canonical = require('../src/profile/canonical');
  var a = fixtures.validProfile();
  var b = fixtures.validProfile();
  b.units[0].roles = ['frontend'];
  b.units[0].languages = ['javascript'];
  assert.equal(canonical.digestProfile(a), canonical.digestProfile(b));
  b.units[0].roles = ['backend', 'frontend'];
  assert.notEqual(canonical.digestProfile(a), canonical.digestProfile(b));
  assert.match(canonical.digestProfile(a), /^sha256:[a-f0-9]{64}$/);
});

test('revision and current schemas verify digest and exact references', function() {
  var schema = require('../src/profile/schema');
  var canonical = require('../src/profile/canonical');
  var profile = fixtures.validProfile();
  var digest = canonical.digestProfile(profile);
  var revision = {
    schemaVersion: 1, kind: 'sdd-project-profile-revision', profileDigest: digest, profile: profile,
    confirmation: { confirmedBy: 'human:fixture', confirmedAt: '2026-07-21T00:00:00Z', evidence: 'approved exact digest' }
  };
  var current = { schemaVersion: 1, kind: 'sdd-project-profile-current', revision: 'profiles/revisions/' + digest.replace(':', '-') + '.json', profileDigest: digest };
  assert.doesNotThrow(function() { schema.validateRevision(revision); });
  assert.doesNotThrow(function() { schema.validateCurrent(current); });
  revision.profileDigest = 'sha256:' + '0'.repeat(64);
  assert.throws(function() { schema.validateRevision(revision); }, /SDD_PROFILE_REVISION_CONFLICT/);
});
