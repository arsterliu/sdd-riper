'use strict';

var canonical = require('./canonical');
var errors = require('./errors');

var ROLES = ['frontend', 'backend', 'contract', 'library', 'tool', 'unknown'];
var CONFIDENCE = ['high', 'medium', 'low', 'human'];

function fail(message, details, code) {
  throw errors.profileError(code || 'SDD_PROFILE_CANDIDATE_INVALID', message, details);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object');
}

function exact(value, keys, label) {
  object(value, label);
  var actual = Object.keys(value).sort();
  var expected = keys.slice().sort();
  if (actual.join('|') !== expected.join('|')) fail(label + ' has invalid fields', { actual: actual, expected: expected });
}

function string(value, label, pattern, max) {
  if (typeof value !== 'string' || !value || value.length > (max || 256) || (pattern && !pattern.test(value))) fail(label + ' is invalid');
}

function relative(value, label) {
  string(value, label, null, 512);
  if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(value) || value.replace(/\\/g, '/').split('/').indexOf('..') !== -1) fail(label + ' must be a contained relative path');
}

function uniqueStrings(values, label, allowed) {
  if (!Array.isArray(values)) fail(label + ' must be an array');
  var seen = {};
  values.forEach(function(value) {
    string(value, label + ' item', /^[A-Za-z0-9._@/+:-]+$/, 128);
    if (allowed && allowed.indexOf(value) === -1) fail(label + ' contains unsupported value: ' + value);
    if (seen[value]) fail(label + ' contains duplicate value: ' + value);
    seen[value] = true;
  });
}

function validateEvidence(evidence, ids) {
  exact(evidence, ['id', 'path', 'kind', 'claim', 'confidence'], 'evidence');
  string(evidence.id, 'evidence.id', /^[A-Za-z0-9._:-]+$/, 128);
  if (ids[evidence.id]) fail('duplicate evidence id: ' + evidence.id);
  ids[evidence.id] = true;
  relative(evidence.path, 'evidence.path');
  string(evidence.kind, 'evidence.kind', /^[A-Za-z0-9._-]+$/, 64);
  string(evidence.claim, 'evidence.claim', null, 512);
  if (CONFIDENCE.indexOf(evidence.confidence) === -1) fail('evidence.confidence is invalid');
}

function validateProfile(profile) {
  exact(profile, ['detectorVersion', 'sourceSnapshot', 'units', 'relations'], 'profile');
  if (profile.detectorVersion !== 1) fail('profile.detectorVersion must be 1');
  if (!Array.isArray(profile.sourceSnapshot) || !Array.isArray(profile.units) || !Array.isArray(profile.relations)) fail('profile collections must be arrays');
  var sourcePaths = {};
  profile.sourceSnapshot.forEach(function(source) {
    exact(source, ['path', 'kind', 'size', 'sha256'], 'sourceSnapshot');
    relative(source.path, 'sourceSnapshot.path');
    if (sourcePaths[source.path]) fail('duplicate source path: ' + source.path);
    sourcePaths[source.path] = true;
    string(source.kind, 'sourceSnapshot.kind', /^[A-Za-z0-9._-]+$/, 64);
    if (!Number.isSafeInteger(source.size) || source.size < 0) fail('sourceSnapshot.size is invalid');
    string(source.sha256, 'sourceSnapshot.sha256', /^[a-f0-9]{64}$/i, 64);
  });
  var units = {};
  var evidenceIds = {};
  profile.units.forEach(function(unit) {
    exact(unit, ['id', 'root', 'roles', 'languages', 'runtimes', 'frameworks', 'manifests', 'commandRefs', 'evidence'], 'unit');
    string(unit.id, 'unit.id', /^[A-Za-z][A-Za-z0-9._-]*$/, 64);
    if (units[unit.id]) fail('duplicate unit id: ' + unit.id);
    units[unit.id] = true;
    relative(unit.root, 'unit.root');
    uniqueStrings(unit.roles, 'unit.roles', ROLES);
    if (!unit.roles.length) fail('unit.roles cannot be empty');
    uniqueStrings(unit.languages, 'unit.languages');
    uniqueStrings(unit.runtimes, 'unit.runtimes');
    uniqueStrings(unit.manifests, 'unit.manifests');
    unit.manifests.forEach(function(manifest) { relative(manifest, 'unit.manifest'); });
    if (!Array.isArray(unit.frameworks) || !Array.isArray(unit.commandRefs) || !Array.isArray(unit.evidence)) fail('unit nested collections must be arrays');
    unit.frameworks.forEach(function(framework) {
      exact(framework, ['id', 'confidence', 'evidenceIds'], 'framework');
      string(framework.id, 'framework.id', /^[A-Za-z0-9._-]+$/, 64);
      if (CONFIDENCE.indexOf(framework.confidence) === -1) fail('framework.confidence is invalid');
      uniqueStrings(framework.evidenceIds, 'framework.evidenceIds');
    });
    unit.commandRefs.forEach(function(command) {
      exact(command, ['kind', 'name', 'source'], 'commandRef');
      string(command.kind, 'commandRef.kind', /^[A-Za-z0-9._-]+$/, 64);
      string(command.name, 'commandRef.name', /^[A-Za-z0-9._:-]+$/, 128);
      relative(command.source, 'commandRef.source');
    });
    unit.evidence.forEach(function(evidence) { validateEvidence(evidence, evidenceIds); });
  });
  profile.units.forEach(function(unit) {
    unit.frameworks.forEach(function(framework) {
      framework.evidenceIds.forEach(function(id) { if (!evidenceIds[id]) fail('framework references unknown evidence: ' + id); });
    });
  });
  profile.relations.forEach(function(relation) {
    exact(relation, ['from', 'to', 'kind', 'evidenceIds', 'confidence'], 'relation');
    if (!units[relation.from] || !units[relation.to]) fail('relation references unknown unit');
    string(relation.kind, 'relation.kind', /^[A-Za-z0-9._-]+$/, 64);
    if (CONFIDENCE.indexOf(relation.confidence) === -1) fail('relation.confidence is invalid');
    uniqueStrings(relation.evidenceIds, 'relation.evidenceIds');
    relation.evidenceIds.forEach(function(id) { if (!evidenceIds[id]) fail('relation references unknown evidence: ' + id); });
  });
  return profile;
}

function validateCandidate(candidate) {
  exact(candidate, ['schemaVersion', 'kind', 'profile'], 'candidate');
  if (candidate.schemaVersion !== 1 || candidate.kind !== 'sdd-project-profile-candidate') fail('candidate version or kind is invalid');
  validateProfile(candidate.profile);
  return candidate;
}

function validateRevision(revision) {
  exact(revision, ['schemaVersion', 'kind', 'profileDigest', 'profile', 'confirmation'], 'revision');
  if (revision.schemaVersion !== 1 || revision.kind !== 'sdd-project-profile-revision') fail('revision version or kind is invalid', {}, 'SDD_PROFILE_REVISION_CONFLICT');
  validateProfile(revision.profile);
  if (canonical.digestProfile(revision.profile) !== revision.profileDigest) fail('revision digest does not match profile', {}, 'SDD_PROFILE_REVISION_CONFLICT');
  exact(revision.confirmation, ['confirmedBy', 'confirmedAt', 'evidence'], 'confirmation');
  string(revision.confirmation.confirmedBy, 'confirmation.confirmedBy', /^human:[^:\s]+$/, 128);
  string(revision.confirmation.confirmedAt, 'confirmation.confirmedAt', /^\d{4}-\d{2}-\d{2}T/, 64);
  string(revision.confirmation.evidence, 'confirmation.evidence', /^[^\r\n]+$/, 512);
  return revision;
}

function validateCurrent(current) {
  exact(current, ['schemaVersion', 'kind', 'revision', 'profileDigest'], 'current');
  if (current.schemaVersion !== 1 || current.kind !== 'sdd-project-profile-current') fail('current version or kind is invalid', {}, 'SDD_PROFILE_CURRENT_INVALID');
  string(current.profileDigest, 'current.profileDigest', /^sha256:[a-f0-9]{64}$/i, 71);
  relative(current.revision, 'current.revision');
  if (!/^profiles\/revisions\/sha256-[a-f0-9]{64}\.json$/i.test(current.revision)) fail('current revision path is invalid', {}, 'SDD_PROFILE_CURRENT_INVALID');
  if (current.revision !== 'profiles/revisions/' + current.profileDigest.replace(':', '-') + '.json') fail('current revision does not match digest', {}, 'SDD_PROFILE_CURRENT_INVALID');
  return current;
}

function normalizeProfile(profile) {
  var value = JSON.parse(JSON.stringify(profile));
  function sortStrings(values) { return values.slice().sort(); }
  value.sourceSnapshot.sort(function(a, b) { return a.path.localeCompare(b.path); });
  value.units.forEach(function(unit) {
    unit.roles = sortStrings(unit.roles);
    unit.languages = sortStrings(unit.languages);
    unit.runtimes = sortStrings(unit.runtimes);
    unit.manifests = sortStrings(unit.manifests);
    unit.frameworks.forEach(function(item) { item.evidenceIds = sortStrings(item.evidenceIds); });
    unit.frameworks.sort(function(a, b) { return a.id.localeCompare(b.id); });
    unit.commandRefs.sort(function(a, b) { return (a.kind + ':' + a.name + ':' + a.source).localeCompare(b.kind + ':' + b.name + ':' + b.source); });
    unit.evidence.sort(function(a, b) { return a.id.localeCompare(b.id); });
  });
  value.units.sort(function(a, b) { return (a.id + ':' + a.root).localeCompare(b.id + ':' + b.root); });
  value.relations.forEach(function(item) { item.evidenceIds = sortStrings(item.evidenceIds); });
  value.relations.sort(function(a, b) { return (a.from + ':' + a.to + ':' + a.kind).localeCompare(b.from + ':' + b.to + ':' + b.kind); });
  return value;
}

module.exports = {
  CONFIDENCE: CONFIDENCE,
  ROLES: ROLES,
  normalizeProfile: normalizeProfile,
  validateCandidate: validateCandidate,
  validateCurrent: validateCurrent,
  validateProfile: validateProfile,
  validateRevision: validateRevision
};
