'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var fixtures = require('./helpers/profile-fixtures');
var canonical = require('../src/profile/canonical');

function prepare(root) {
  fixtures.write(path.join(root, 'apps/web/package.json'), '{"name":"web"}\n');
  var value = fixtures.validCandidate();
  fixtures.write(path.join(root, 'candidate.json'), JSON.stringify(value, null, 2));
  return { candidate: value, digest: canonical.digestProfile(value.profile) };
}

function options(prepared) {
  return {
    candidate: 'candidate.json',
    expectedDigest: prepared.digest,
    confirmedBy: 'human:fixture',
    confirmationEvidence: '用户核对并批准该精确摘要'
  };
}

test('confirm requires complete human authorization before creating profile state', function(t) {
  var root = fixtures.createProject('confirm-auth');
  t.after(function() { fixtures.cleanup(root); });
  var prepared = prepare(root);
  var store = require('../src/profile/store');
  assert.throws(function() {
    store.confirmProfile(root, { candidate: 'candidate.json', expectedDigest: prepared.digest });
  }, function(error) { return error.code === 'SDD_PROFILE_CONFIRM_AUTH_REQUIRED'; });
  assert.equal(fs.existsSync(path.join(root, 'mydocs/profiles')), false);
});

test('confirm commits immutable revision before current and unchanged retry is idempotent', function(t) {
  var root = fixtures.createProject('confirm-ok');
  t.after(function() { fixtures.cleanup(root); });
  var prepared = prepare(root);
  var store = require('../src/profile/store');
  var result = store.confirmProfile(root, options(prepared));
  assert.equal(result.profileState, 'confirmed');
  assert.equal(result.profileDigest, prepared.digest);
  var revision = path.join(root, 'mydocs', result.revision);
  var current = path.join(root, 'mydocs/profiles/current.json');
  assert.equal(fs.existsSync(revision), true);
  assert.equal(fs.existsSync(current), true);
  var savedRevision = JSON.parse(fs.readFileSync(revision, 'utf8'));
  assert.equal(savedRevision.profileDigest, prepared.digest);
  assert.equal(savedRevision.confirmation.confirmedBy, 'human:fixture');
  var before = fs.statSync(revision).mtimeMs;
  var retry = store.confirmProfile(root, options(prepared));
  assert.equal(retry.profileState, 'unchanged');
  assert.equal(fs.statSync(revision).mtimeMs, before);
});

test('confirm rejects digest mismatch and stale candidates without changing current', function(t) {
  var root = fixtures.createProject('confirm-stale');
  t.after(function() { fixtures.cleanup(root); });
  var prepared = prepare(root);
  var store = require('../src/profile/store');
  assert.throws(function() {
    var opts = options(prepared); opts.expectedDigest = 'sha256:' + '0'.repeat(64);
    store.confirmProfile(root, opts);
  }, function(error) { return error.code === 'SDD_PROFILE_DIGEST_MISMATCH'; });
  assert.equal(fs.existsSync(path.join(root, 'mydocs/profiles/current.json')), false);
  fixtures.write(path.join(root, 'apps/web/package.json'), '{"name":"changed"}\n');
  assert.throws(function() { store.confirmProfile(root, options(prepared)); }, function(error) {
    return error.code === 'SDD_PROFILE_CANDIDATE_STALE';
  });
  assert.equal(fs.existsSync(path.join(root, 'mydocs/profiles/current.json')), false);
});

test('confirm lock is fail-fast and leaves profile state untouched', function(t) {
  var root = fixtures.createProject('confirm-lock');
  t.after(function() { fixtures.cleanup(root); });
  var prepared = prepare(root);
  fs.mkdirSync(path.join(root, '.sdd-project-profile.lock'));
  var store = require('../src/profile/store');
  assert.throws(function() { store.confirmProfile(root, options(prepared)); }, function(error) {
    return error.code === 'SDD_PROFILE_CONFIRM_LOCKED';
  });
  assert.equal(fs.existsSync(path.join(root, 'mydocs/profiles/current.json')), false);
});

test('pointer write failure preserves previous current and releases the lock', function(t) {
  var root = fixtures.createProject('confirm-atomic');
  t.after(function() { fixtures.cleanup(root); });
  var prepared = prepare(root);
  var store = require('../src/profile/store');
  store.confirmProfile(root, options(prepared));
  var currentFile = path.join(root, 'mydocs/profiles/current.json');
  var previous = fs.readFileSync(currentFile, 'utf8');
  var changed = JSON.parse(JSON.stringify(prepared.candidate));
  changed.profile.units[0].roles = ['backend'];
  fixtures.write(path.join(root, 'candidate-2.json'), JSON.stringify(changed));
  var changedPrepared = { digest: canonical.digestProfile(changed.profile) };
  var changedOptions = options(changedPrepared); changedOptions.candidate = 'candidate-2.json';
  assert.throws(function() {
    store.confirmProfile(root, changedOptions, {
      renameSync: function(from, to) {
        if (to === currentFile) throw new Error('injected current rename failure');
        fs.renameSync(from, to);
      }
    });
  }, /injected current rename failure/);
  assert.equal(fs.readFileSync(currentFile, 'utf8'), previous);
  assert.equal(fs.existsSync(path.join(root, '.sdd-project-profile.lock')), false);
});

test('unlock failure is the controlling diagnostic and retains transaction error details', function(t) {
  var root = fixtures.createProject('confirm-unlock');
  t.after(function() { fixtures.cleanup(root); });
  var prepared = prepare(root);
  var store = require('../src/profile/store');
  assert.throws(function() {
    store.confirmProfile(root, options(prepared), {
      renameSync: function() { throw new Error('injected transaction failure'); },
      rmdirSync: function() { throw new Error('injected unlock failure'); }
    });
  }, function(error) {
    return error.code === 'SDD_PROFILE_CONFIRM_UNLOCK_FAILED' &&
      error.details.transactionError.indexOf('injected transaction failure') !== -1;
  });
});

