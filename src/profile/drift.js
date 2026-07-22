'use strict';

var canonical = require('./canonical');
var candidateService = require('./candidate');
var schema = require('./schema');
var store = require('./store');
var boundary = require('./boundary');

function keyed(values, key) {
  var out = {};
  values.forEach(function(value) { out[value[key]] = value; });
  return out;
}

function sameSet(a, b) {
  return a.slice().sort().join('|') === b.slice().sort().join('|');
}

function pinHumanFacts(projectDir, saved, detected, reviewRequired) {
  var savedUnits = keyed(saved.units, 'id');
  var detectedUnits = keyed(detected.units, 'id');
  var evidenceIndex = {};
  Object.keys(savedUnits).forEach(function(id) {
    savedUnits[id].evidence.forEach(function(evidence) { evidenceIndex[evidence.id] = { evidence: evidence, owner: id }; });
  });
  function rootMatches(id) {
    var oldUnit = savedUnits[id];
    var freshUnit = detectedUnits[id];
    if (!oldUnit || !freshUnit || oldUnit.root !== freshUnit.root) return false;
    try { boundary.resolveContained(projectDir, oldUnit.root, { mustExist: true }); return true; }
    catch (error) { return false; }
  }
  Object.keys(savedUnits).forEach(function(id) {
    var oldUnit = savedUnits[id];
    var freshUnit = detectedUnits[id];
    var humanEvidence = oldUnit.evidence.filter(function(item) {
      if (item.confidence !== 'human' || item.kind !== 'human-classification') return false;
      try { boundary.resolveContained(projectDir, item.path, { mustExist: true }); return true; }
      catch (error) { return false; }
    });
    if (!humanEvidence.length || !freshUnit || oldUnit.root !== freshUnit.root) return;
    try { boundary.resolveContained(projectDir, oldUnit.root, { mustExist: true }); }
    catch (error) { return; }
    var oldRoles = oldUnit.roles.filter(function(role) { return role !== 'unknown'; });
    var freshRoles = freshUnit.roles.filter(function(role) { return role !== 'unknown'; });
    if (freshRoles.length && oldRoles.length && !sameSet(oldRoles, freshRoles)) {
      reviewRequired.push({ unit: id, savedRoles: oldRoles, detectedRoles: freshRoles });
      return;
    }
    freshUnit.roles = oldUnit.roles.slice();
    humanEvidence.forEach(function(evidence) {
      if (!freshUnit.evidence.some(function(item) { return item.id === evidence.id; })) freshUnit.evidence.push(evidence);
    });
    oldUnit.frameworks.filter(function(item) { return item.confidence === 'human'; }).forEach(function(framework) {
      if (!freshUnit.frameworks.some(function(item) { return item.id === framework.id; })) freshUnit.frameworks.push(framework);
    });
  });
  saved.relations.filter(function(item) { return item.confidence === 'human'; }).forEach(function(relation) {
    if (!rootMatches(relation.from) || !rootMatches(relation.to) || !relation.evidenceIds.length) return;
    var records = relation.evidenceIds.map(function(id) { return evidenceIndex[id]; });
    var valid = records.every(function(record) {
      if (!record || !rootMatches(record.owner) || record.evidence.confidence !== 'human' || record.evidence.kind !== 'human-relation') return false;
      try { boundary.resolveContained(projectDir, record.evidence.path, { mustExist: true }); return true; }
      catch (error) { return false; }
    });
    if (!valid) return;
    records.forEach(function(record) {
      var target = detectedUnits[record.owner];
      if (!target.evidence.some(function(item) { return item.id === record.evidence.id; })) target.evidence.push(record.evidence);
    });
    var index = detected.relations.findIndex(function(item) {
      return item.from === relation.from && item.to === relation.to && item.kind === relation.kind;
    });
    if (index === -1) detected.relations.push(relation);
    else detected.relations[index] = relation;
  });
}

function compare(projectDir, saved, fresh) {
  var differences = { added: [], removed: [], changed: [], sourceStale: [], reviewRequired: [] };
  var oldSources = keyed(saved.sourceSnapshot, 'path');
  var newSources = keyed(fresh.sourceSnapshot, 'path');
  Object.keys(oldSources).forEach(function(name) {
    if (!newSources[name] || canonical.stableStringify(oldSources[name]) !== canonical.stableStringify(newSources[name])) differences.sourceStale.push(name);
  });
  Object.keys(newSources).forEach(function(name) { if (!oldSources[name]) differences.sourceStale.push(name); });
  pinHumanFacts(projectDir, saved, fresh, differences.reviewRequired);
  saved = schema.normalizeProfile(saved);
  fresh = schema.normalizeProfile(fresh);
  var oldUnits = keyed(saved.units, 'id');
  var newUnits = keyed(fresh.units, 'id');
  Object.keys(newUnits).forEach(function(id) {
    if (!oldUnits[id]) differences.added.push('unit:' + id);
    else if (canonical.stableStringify(oldUnits[id]) !== canonical.stableStringify(newUnits[id])) differences.changed.push('unit:' + id);
  });
  Object.keys(oldUnits).forEach(function(id) { if (!newUnits[id]) differences.removed.push('unit:' + id); });
  if (canonical.stableStringify(saved.relations) !== canonical.stableStringify(fresh.relations)) differences.changed.push('relations');
  Object.keys(differences).forEach(function(key) { differences[key] = differences[key].slice(0, 100); });
  return differences;
}

function checkProfile(projectDir) {
  var current = store.resolveCurrent(projectDir);
  if (!current) return { schemaVersion: 1, profileState: 'missing', nextAction: 'detect_and_confirm_profile' };
  var fresh = candidateService.detectProfile(projectDir).candidate.profile;
  var saved = JSON.parse(JSON.stringify(current.revision.profile));
  var normalizedFresh = schema.normalizeProfile(fresh);
  var differences = compare(projectDir, saved, normalizedFresh);
  normalizedFresh = schema.normalizeProfile(normalizedFresh);
  var clean = canonical.digestProfile(normalizedFresh) === current.current.profileDigest &&
    Object.keys(differences).every(function(key) { return differences[key].length === 0; });
  return {
    schemaVersion: 1,
    profileState: clean ? 'clean' : 'drifted',
    currentDigest: current.current.profileDigest,
    detectedDigest: canonical.digestProfile(normalizedFresh),
    differences: differences,
    nextAction: clean ? 'none' : 'review_profile_candidate'
  };
}

module.exports = { checkProfile: checkProfile, _private: { compare: compare, pinHumanFacts: pinHumanFacts } };
