'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var detectors = require('./detectors');
var schema = require('./schema');
var canonical = require('./canonical');
var boundary = require('./boundary');
var errors = require('./errors');

function detectProfile(projectDir, limits) {
  var facts = detectors.detect(projectDir, limits);
  var candidate = {
    schemaVersion: 1,
    kind: 'sdd-project-profile-candidate',
    profile: schema.normalizeProfile({ detectorVersion: 1, sourceSnapshot: facts.sourceSnapshot, units: facts.units, relations: facts.relations })
  };
  schema.validateCandidate(candidate);
  return {
    schemaVersion: 1,
    profileState: candidate.profile.units.length ? 'detected' : 'empty',
    candidateDigest: canonical.digestProfile(candidate.profile),
    candidate: candidate
  };
}

function parseCandidateFile(projectDir, candidatePath) {
  var content = boundary.readContainedUtf8(projectDir, candidatePath, 2 * 1024 * 1024);
  var parsed;
  try { parsed = JSON.parse(content); }
  catch (error) { throw errors.profileError('SDD_PROFILE_CANDIDATE_INVALID', 'candidate is not valid JSON'); }
  var candidate = parsed && parsed.candidate ? parsed.candidate : parsed;
  schema.validateCandidate(candidate);
  candidate.profile = schema.normalizeProfile(candidate.profile);
  return candidate;
}

function assertFresh(projectDir, candidate) {
  candidate.profile.sourceSnapshot.forEach(function(source) {
    var file;
    try { file = boundary.resolveContained(projectDir, source.path, { mustExist: true }); }
    catch (error) { throw errors.profileError('SDD_PROFILE_CANDIDATE_STALE', 'candidate source is missing or escaped', { path: source.path }); }
    var stat = fs.statSync(file);
    var digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (!stat.isFile() || stat.size !== source.size || digest !== source.sha256) {
      throw errors.profileError('SDD_PROFILE_CANDIDATE_STALE', 'candidate source changed after detection', { path: source.path });
    }
  });
  return candidate;
}

function reviewCandidate(projectDir, candidatePath) {
  var candidate = parseCandidateFile(projectDir, candidatePath);
  assertFresh(projectDir, candidate);
  return {
    schemaVersion: 1,
    profileState: 'reviewable',
    candidateDigest: canonical.digestProfile(candidate.profile),
    candidate: candidate
  };
}

module.exports = {
  assertFresh: assertFresh,
  detectProfile: detectProfile,
  parseCandidateFile: parseCandidateFile,
  reviewCandidate: reviewCandidate
};
