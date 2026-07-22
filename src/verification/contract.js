'use strict';

var PROVIDER_ID = /^[a-z][a-z0-9-]{0,62}$/;
var PROVIDER_FIELDS = ['adapter', 'workspaceRoot', 'packageRoot', 'config', 'projects'];

function verificationError(code, message, details) {
  var error = new Error(message);
  error.name = 'VerificationError';
  error.code = code;
  error.details = details || {};
  return error;
}

function fail(path, message) {
  throw verificationError('CONFIG_SCHEMA_INVALID', message, { path: path });
}

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(path, path + ' must be a non-empty string');
}

function validateProviderDefinition(value) {
  if (!plainObject(value)) fail('', 'provider must be an object');
  Object.keys(value).forEach(function(field) {
    if (PROVIDER_FIELDS.indexOf(field) === -1) fail(field, 'unknown provider field: ' + field);
  });
  requiredString(value.adapter, 'adapter');
  requiredString(value.workspaceRoot, 'workspaceRoot');
  requiredString(value.packageRoot, 'packageRoot');
  requiredString(value.config, 'config');
  if (!Array.isArray(value.projects) || !value.projects.length) fail('projects', 'projects must be a non-empty array');
  value.projects.forEach(function(project, index) {
    requiredString(project, 'projects[' + index + ']');
  });
  return {
    adapter: value.adapter,
    workspaceRoot: value.workspaceRoot,
    packageRoot: value.packageRoot,
    config: value.config,
    projects: value.projects.slice()
  };
}

function validateVerificationConfig(value) {
  if (!plainObject(value)) fail('', 'verification config must be an object');
  Object.keys(value).forEach(function(field) {
    if (field !== 'schemaVersion' && field !== 'providers') fail(field, 'unknown config field: ' + field);
  });
  if (value.schemaVersion !== 1) fail('schemaVersion', 'schemaVersion must be 1');
  if (!plainObject(value.providers)) fail('providers', 'providers must be an object');
  var providers = {};
  Object.keys(value.providers).forEach(function(providerId) {
    if (!PROVIDER_ID.test(providerId)) fail('providers.' + providerId, 'invalid provider id');
    providers[providerId] = validateProviderDefinition(value.providers[providerId]);
  });
  return { schemaVersion: 1, providers: providers };
}

module.exports = {
  PROVIDER_ID: PROVIDER_ID,
  verificationError: verificationError,
  validateProviderDefinition: validateProviderDefinition,
  validateVerificationConfig: validateVerificationConfig
};
