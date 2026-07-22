'use strict';

var crypto = require('crypto');

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (!value || typeof value !== 'object') return value;
  var out = {};
  Object.keys(value).sort().forEach(function(key) { out[key] = ordered(value[key]); });
  return out;
}

function canonicalize(profile) {
  var schema = require('./schema');
  var normalized = schema.normalizeProfile(profile);
  schema.validateProfile(normalized);
  return JSON.stringify(ordered(normalized));
}

function digestProfile(profile) {
  return 'sha256:' + crypto.createHash('sha256').update(canonicalize(profile), 'utf8').digest('hex');
}

function stableStringify(value) {
  return JSON.stringify(ordered(value));
}

module.exports = { canonicalize: canonicalize, digestProfile: digestProfile, stableStringify: stableStringify };
