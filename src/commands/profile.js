'use strict';

var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var candidate = require('../profile/candidate');
var store = require('../profile/store');
var drift = require('../profile/drift');
var ProfileError = require('../profile/errors').ProfileError;

function ensureInitialized(projectDir) {
  var root = path.resolve(projectDir);
  if (!fs.existsSync(path.join(root, '.sdd-config')) || !fs.existsSync(common.getDocsRoot(root))) {
    var error = new ProfileError('SDD_PROFILE_NOT_INITIALIZED', 'project is not initialized; run sdd init first');
    throw error;
  }
  return root;
}

function format(value, mode) {
  mode = mode || 'text';
  if (mode === 'json') {
    process.stdout.write(JSON.stringify(value, null, 2) + '\n');
    return;
  }
  if (mode !== 'text') {
    var usage = new ProfileError('SDD_PROFILE_USAGE', '--format must be text or json', {}, 3);
    throw usage;
  }
  console.log('PROFILE_STATE: ' + value.profileState);
  console.log('CANDIDATE_DIGEST: ' + value.candidateDigest);
  console.log('UNITS: ' + value.candidate.profile.units.length);
  console.log('RELATIONS: ' + value.candidate.profile.relations.length);
  console.log('NEXT_ACTION: ' + (value.profileState === 'empty' ? 'create_bootstrap_spec' : value.profileState === 'reviewable' ? 'request_profile_confirmation' : 'review_profile_candidate'));
  if (value.profileState === 'empty') {
    console.log('GUIDANCE: Create a standard bootstrap Spec with sdd discover; do not choose or generate a framework from detection.');
  }
}

function handle(action) {
  try { action(); }
  catch (error) {
    if (error instanceof ProfileError) {
      console.error('[' + error.code + '] ' + error.message.replace(error.code + ': ', ''));
      process.exit(error.exitCode);
    }
    throw error;
  }
}

function detect(projectDir, opts) {
  handle(function() {
    var root = ensureInitialized(projectDir);
    format(candidate.detectProfile(root), opts.format);
  });
}

function review(projectDir, opts) {
  handle(function() {
    var root = ensureInitialized(projectDir);
    format(candidate.reviewCandidate(root, opts.candidate), opts.format);
  });
}

function confirm(projectDir, opts) {
  handle(function() {
    var root = ensureInitialized(projectDir);
    var value = store.confirmProfile(root, {
      candidate: opts.candidate,
      expectedDigest: opts.expectedDigest,
      confirmedBy: opts.confirmedBy,
      confirmationEvidence: opts.confirmationEvidence
    });
    if ((opts.format || 'text') === 'json') {
      process.stdout.write(JSON.stringify(value, null, 2) + '\n');
      return;
    }
    if (opts.format && opts.format !== 'text') throw new ProfileError('SDD_PROFILE_USAGE', '--format must be text or json', {}, 3);
    console.log('PROFILE_STATE: ' + value.profileState);
    console.log('PROFILE_DIGEST: ' + value.profileDigest);
    console.log('PROFILE_REVISION: ' + value.revision);
    console.log('NEXT_ACTION: use_profile_in_discover');
  });
}

function show(projectDir, opts) {
  handle(function() {
    var root = ensureInitialized(projectDir);
    var resolved = opts.revision ? store.resolveRevision(root, opts.revision) : store.resolveCurrent(root);
    if (!resolved) throw new ProfileError('SDD_PROFILE_CURRENT_INVALID', 'no confirmed current profile exists');
    var revision = resolved.revision;
    var revisionPath = resolved.relative || resolved.current.revision;
    var value = { schemaVersion: 1, profileState: 'confirmed', profileDigest: revision.profileDigest, revisionPath: revisionPath, revision: revision };
    if ((opts.format || 'text') === 'json') { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); return; }
    if (opts.format && opts.format !== 'text') throw new ProfileError('SDD_PROFILE_USAGE', '--format must be text or json', {}, 3);
    console.log('PROFILE_STATE: confirmed');
    console.log('PROFILE_DIGEST: ' + value.profileDigest);
    console.log('PROFILE_REVISION: ' + value.revisionPath);
    console.log('UNITS: ' + revision.profile.units.length);
  });
}

function check(projectDir, opts) {
  handle(function() {
    var root = ensureInitialized(projectDir);
    var value;
    try { value = drift.checkProfile(root); }
    catch (error) {
      if (error instanceof ProfileError && (error.code === 'SDD_PROFILE_CURRENT_INVALID' || error.code === 'SDD_PROFILE_REVISION_CONFLICT')) {
        value = { schemaVersion: 1, profileState: 'invalid', errorCode: error.code, nextAction: 'repair_profile_pointer' };
      } else throw error;
    }
    if ((opts.format || 'text') === 'json') process.stdout.write(JSON.stringify(value, null, 2) + '\n');
    else {
      if (opts.format && opts.format !== 'text') throw new ProfileError('SDD_PROFILE_USAGE', '--format must be text or json', {}, 3);
      console.log('PROFILE_STATE: ' + value.profileState);
      if (value.currentDigest) console.log('PROFILE_DIGEST: ' + value.currentDigest);
      console.log('NEXT_ACTION: ' + value.nextAction);
    }
    if (value.profileState !== 'clean') process.exitCode = 2;
  });
}

module.exports = { check: check, confirm: confirm, detect: detect, review: review, show: show, _private: { ensureInitialized: ensureInitialized, format: format, handle: handle } };
