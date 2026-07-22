'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var os = require('os');
var path = require('path');
var fixtures = require('./helpers/profile-fixtures');

test('profile boundary rejects lexical escapes and absolute paths', function(t) {
  var boundary = require('../src/profile/boundary');
  var root = fixtures.createProject('boundary');
  t.after(function() { fixtures.cleanup(root); });
  assert.throws(function() { boundary.resolveContained(root, '../outside'); }, /SDD_PROFILE_PATH_ESCAPE/);
  assert.throws(function() { boundary.resolveContained(root, path.resolve(root, '..', 'outside')); }, /SDD_PROFILE_PATH_ESCAPE/);
});

test('bounded walk skips ignored directories and fails on file budget', function(t) {
  var boundary = require('../src/profile/boundary');
  var root = fixtures.createProject('walk');
  t.after(function() { fixtures.cleanup(root); });
  fixtures.write(path.join(root, 'src/a.js'), 'a');
  fixtures.write(path.join(root, 'node_modules/hidden/package.json'), '{}');
  var files = boundary.walkBounded(root, { maxDepth: 4, maxFiles: 10, maxFileSize: 1024, maxTotalBytes: 4096 });
  assert.ok(files.some(function(file) { return file.relative === 'src/a.js'; }));
  assert.ok(!files.some(function(file) { return /node_modules/.test(file.relative); }));
  assert.throws(function() { boundary.walkBounded(root, { maxDepth: 4, maxFiles: 1, maxFileSize: 1024, maxTotalBytes: 4096 }); }, /SDD_PROFILE_SCAN_LIMIT/);
});

test('explicit contained reads reject symlinks escaping project root', function(t) {
  var boundary = require('../src/profile/boundary');
  var root = fixtures.createProject('symlink');
  var outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-profile-outside-'));
  t.after(function() { fixtures.cleanup(root); fixtures.cleanup(outside); });
  fixtures.write(path.join(outside, 'candidate.json'), '{}');
  var link = path.join(root, 'candidate.json');
  try { fs.symlinkSync(path.join(outside, 'candidate.json'), link, 'file'); }
  catch (error) { t.skip('symlink unavailable: ' + error.code); return; }
  assert.throws(function() { boundary.readContainedUtf8(root, 'candidate.json', 1024); }, /SDD_PROFILE_PATH_ESCAPE/);
});

test('confirm never creates a revision through an escaping profiles directory link', function(t) {
  var root = fixtures.createProject('store-link');
  var outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-profile-outside-'));
  t.after(function() { fixtures.cleanup(root); fixtures.cleanup(outside); });
  fixtures.write(path.join(root, 'apps/web/package.json'), '{"name":"web"}\n');
  var candidate = fixtures.validCandidate();
  fixtures.write(path.join(root, 'candidate.json'), JSON.stringify(candidate));
  var profiles = path.join(root, 'mydocs', 'profiles');
  try { fs.symlinkSync(outside, profiles, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { t.skip('directory link unavailable: ' + error.code); return; }
  var digest = require('../src/profile/canonical').digestProfile(candidate.profile);
  var store = require('../src/profile/store');
  assert.throws(function() {
    store.confirmProfile(root, {
      candidate: 'candidate.json', expectedDigest: digest,
      confirmedBy: 'human:fixture', confirmationEvidence: 'approved exact digest'
    });
  }, function(error) { return error.code === 'SDD_PROFILE_PATH_ESCAPE'; });
  assert.equal(fs.existsSync(path.join(outside, 'revisions')), false, 'must reject before creating anything outside root');
});
