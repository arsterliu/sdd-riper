'use strict';

var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var candidateService = require('./candidate');
var canonical = require('./canonical');
var schema = require('./schema');
var errors = require('./errors');
var boundary = require('./boundary');

function requireAuthorization(options) {
  options = options || {};
  if (!options.candidate ||
      !/^sha256:[a-f0-9]{64}$/i.test(options.expectedDigest || '') ||
      !/^human:[^:\s]+$/.test(options.confirmedBy || '') ||
      !options.confirmationEvidence ||
      /[\r\n]/.test(options.confirmationEvidence) ||
      options.confirmationEvidence.length > 512) {
    throw errors.profileError(
      'SDD_PROFILE_CONFIRM_AUTH_REQUIRED',
      'candidate, exact digest, human:<name>, and non-empty single-line confirmation evidence are required'
    );
  }
}

function ioWith(overrides) {
  var value = {
    existsSync: fs.existsSync,
    mkdirSync: fs.mkdirSync,
    readFileSync: fs.readFileSync,
    renameSync: fs.renameSync,
    rmdirSync: fs.rmdirSync,
    unlinkSync: fs.unlinkSync,
    writeFileSync: fs.writeFileSync
  };
  Object.keys(overrides || {}).forEach(function(key) { value[key] = overrides[key]; });
  return value;
}

function readJson(file, code, io) {
  var value;
  try { value = JSON.parse(io.readFileSync(file, 'utf8')); }
  catch (error) { throw errors.profileError(code, 'stored JSON is unreadable', { path: file, cause: error.message }); }
  return value;
}

function atomicWrite(file, value, io) {
  var temp = file + '.tmp-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  try {
    io.writeFileSync(temp, canonical.stableStringify(value) + '\n', { encoding: 'utf8', flag: 'wx' });
    io.renameSync(temp, file);
  } catch (error) {
    try { if (io.existsSync(temp)) io.unlinkSync(temp); } catch (cleanupError) {}
    throw error;
  }
}

function revisionRelative(digest) {
  return 'profiles/revisions/' + digest.replace(':', '-') + '.json';
}

function ensureContainedDirectory(root, relative, io) {
  var absolute = path.resolve(root, relative);
  if (io.existsSync(absolute)) {
    boundary.resolveContained(root, relative, { mustExist: true });
    if (!fs.statSync(absolute).isDirectory()) throw errors.profileError('SDD_PROFILE_PATH_INVALID', 'profile storage path is not a directory', { path: relative });
    return absolute;
  }
  var parent = path.dirname(relative);
  boundary.resolveContained(root, parent, { mustExist: true });
  io.mkdirSync(absolute);
  boundary.resolveContained(root, relative, { mustExist: true });
  return absolute;
}

function validateProfilePaths(root, profile) {
  profile.units.forEach(function(unit) {
    boundary.resolveContained(root, unit.root, { mustExist: true });
    unit.manifests.forEach(function(value) { boundary.resolveContained(root, value, { mustExist: true }); });
    unit.commandRefs.forEach(function(value) { boundary.resolveContained(root, value.source, { mustExist: true }); });
    unit.evidence.forEach(function(value) { boundary.resolveContained(root, value.path, { mustExist: true }); });
  });
}

function resolveRevision(projectDir, digest, ioOverrides) {
  var io = ioWith(ioOverrides);
  var root = path.resolve(projectDir);
  var docsRoot = common.getDocsRoot(root);
  var relative = revisionRelative(digest);
  var projectRelative = path.join(common.getDocsDir(root), relative);
  var file;
  try { file = boundary.resolveContained(root, projectRelative, { mustExist: true }); }
  catch (error) {
    if (error.code === 'SDD_PROFILE_PATH_MISSING') throw errors.profileError('SDD_PROFILE_CURRENT_INVALID', 'profile revision is missing', { revision: relative });
    throw error;
  }
  if (!io.existsSync(file)) throw errors.profileError('SDD_PROFILE_CURRENT_INVALID', 'profile revision is missing', { revision: relative });
  var revision = readJson(file, 'SDD_PROFILE_REVISION_CONFLICT', io);
  schema.validateRevision(revision);
  if (revision.profileDigest !== digest) throw errors.profileError('SDD_PROFILE_REVISION_CONFLICT', 'revision digest differs from requested digest');
  return { file: file, relative: relative, revision: revision };
}

function resolveCurrent(projectDir, ioOverrides) {
  var io = ioWith(ioOverrides);
  var root = path.resolve(projectDir);
  var docsRoot = common.getDocsRoot(root);
  var expected = path.join(docsRoot, 'profiles', 'current.json');
  if (!io.existsSync(expected)) return null;
  var file = boundary.resolveContained(root, path.join(common.getDocsDir(root), 'profiles', 'current.json'), { mustExist: true });
  var current = readJson(file, 'SDD_PROFILE_CURRENT_INVALID', io);
  schema.validateCurrent(current);
  var resolved = resolveRevision(root, current.profileDigest, io);
  if (resolved.relative !== current.revision) throw errors.profileError('SDD_PROFILE_CURRENT_INVALID', 'current pointer revision differs from digest');
  return { current: current, revision: resolved.revision, currentFile: file, revisionFile: resolved.file };
}

function confirmProfile(projectDir, options, ioOverrides) {
  requireAuthorization(options);
  var root = path.resolve(projectDir);
  var io = ioWith(ioOverrides);
  // Lock-free preflight is deliberately repeated under the lock.
  candidateService.parseCandidateFile(root, options.candidate);
  var lock = path.join(root, '.sdd-project-profile.lock');
  try { io.mkdirSync(lock); }
  catch (error) {
    if (error && error.code === 'EEXIST') {
      throw errors.profileError('SDD_PROFILE_CONFIRM_LOCKED', 'another profile confirm is active; retry after it finishes');
    }
    throw error;
  }

  var result;
  var transactionError = null;
  try {
    var candidate = candidateService.parseCandidateFile(root, options.candidate);
    candidateService.assertFresh(root, candidate);
    validateProfilePaths(root, candidate.profile);
    var digest = canonical.digestProfile(candidate.profile);
    if (digest !== options.expectedDigest) {
      throw errors.profileError('SDD_PROFILE_DIGEST_MISMATCH', 'candidate digest does not match the authorized digest', {
        expected: options.expectedDigest, actual: digest
      });
    }
    var docsRelative = common.getDocsDir(root);
    var docsRoot = boundary.resolveContained(root, docsRelative, { mustExist: true });
    var profilesDir = ensureContainedDirectory(root, path.join(docsRelative, 'profiles'), io);
    var revisionsDir = ensureContainedDirectory(root, path.join(docsRelative, 'profiles', 'revisions'), io);
    var relative = revisionRelative(digest);
    var revisionFile = path.join(docsRoot, relative);
    var revision;
    if (io.existsSync(revisionFile)) {
      revisionFile = boundary.resolveContained(root, path.join(common.getDocsDir(root), relative), { mustExist: true });
      revision = readJson(revisionFile, 'SDD_PROFILE_REVISION_CONFLICT', io);
      schema.validateRevision(revision);
      if (revision.profileDigest !== digest || canonical.digestProfile(revision.profile) !== digest) {
        throw errors.profileError('SDD_PROFILE_REVISION_CONFLICT', 'existing immutable revision conflicts with candidate');
      }
    } else {
      revision = {
        schemaVersion: 1,
        kind: 'sdd-project-profile-revision',
        profileDigest: digest,
        profile: schema.normalizeProfile(candidate.profile),
        confirmation: {
          confirmedBy: options.confirmedBy,
          confirmedAt: new Date().toISOString(),
          evidence: options.confirmationEvidence
        }
      };
      schema.validateRevision(revision);
      atomicWrite(revisionFile, revision, io);
    }
    var currentFile = path.join(profilesDir, 'current.json');
    var old = resolveCurrent(root, io);
    if (old && old.current.profileDigest === digest) {
      result = { schemaVersion: 1, profileState: 'unchanged', profileDigest: digest, revision: relative };
    } else {
      var current = { schemaVersion: 1, kind: 'sdd-project-profile-current', revision: relative, profileDigest: digest };
      schema.validateCurrent(current);
      atomicWrite(currentFile, current, io);
      result = { schemaVersion: 1, profileState: 'confirmed', profileDigest: digest, revision: relative };
    }
  } catch (error) {
    transactionError = error;
  }

  try { io.rmdirSync(lock); }
  catch (unlockError) {
    throw errors.profileError(
      'SDD_PROFILE_CONFIRM_UNLOCK_FAILED',
      'profile state may have been written; inspect current/revision, confirm no active process, then remove the empty lock directory manually',
      { transactionError: transactionError ? transactionError.message : '', unlockError: unlockError.message }
    );
  }
  if (transactionError) throw transactionError;
  return result;
}

module.exports = {
  confirmProfile: confirmProfile,
  resolveCurrent: resolveCurrent,
  resolveRevision: resolveRevision,
  _private: {
    atomicWrite: atomicWrite,
    ensureContainedDirectory: ensureContainedDirectory,
    requireAuthorization: requireAuthorization,
    revisionRelative: revisionRelative,
    validateProfilePaths: validateProfilePaths
  }
};
