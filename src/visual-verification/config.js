'use strict';

var fs = require('fs');
var path = require('path');

var ROOT_FIELDS = ['schemaVersion', 'scenarios'];
var BINDING_FIELDS = ['testFile', 'testTitle', 'project', 'threshold', 'masks'];

function visualConfigError(code, message, details) {
  var error = new Error(message);
  error.name = 'VisualConfigError';
  error.code = code;
  error.details = details || {};
  return error;
}

function isInside(parentPath, childPath) {
  var relative = path.relative(parentPath, childPath);
  return relative === '' || (relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function fail(pathName, message) {
  throw visualConfigError('VISUAL_CONFIG_INVALID', message, { path: pathName });
}

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value, pathName) {
  if (typeof value !== 'string' || !value.trim()) fail(pathName, pathName + ' must be a non-empty string');
}

function staticMask(value, pathName) {
  if (!plainObject(value)) fail(pathName, pathName + ' must be an object');
  var fields = ['x', 'y', 'width', 'height'];
  Object.keys(value).forEach(function(field) {
    if (fields.indexOf(field) === -1) fail(pathName + '.' + field, 'unknown mask field: ' + field);
  });
  fields.forEach(function(field) {
    if (!Number.isInteger(value[field]) || value[field] < 0 || ((field === 'width' || field === 'height') && value[field] < 1)) {
      fail(pathName + '.' + field, pathName + '.' + field + ' must be a non-negative integer' + (field === 'width' || field === 'height' ? ' greater than zero' : ''));
    }
  });
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function validateBinding(scenarioId, binding, packageRoot, allowedProjects) {
  var prefix = 'scenarios.' + scenarioId;
  if (!plainObject(binding)) fail(prefix, prefix + ' must be an object');
  Object.keys(binding).forEach(function(field) {
    if (BINDING_FIELDS.indexOf(field) === -1) fail(prefix + '.' + field, 'unknown scenario binding field: ' + field);
  });
  ['testFile', 'testTitle', 'project'].forEach(function(field) { requiredString(binding[field], prefix + '.' + field); });
  if (!Number.isFinite(binding.threshold) || binding.threshold < 0 || binding.threshold > 1) {
    fail(prefix + '.threshold', prefix + '.threshold must be a finite ratio from 0 to 1');
  }
  if (!Array.isArray(binding.masks)) fail(prefix + '.masks', prefix + '.masks must be an array of static pixel rectangles');
  var masks = binding.masks.map(function(mask, index) { return staticMask(mask, prefix + '.masks.' + index); });
  if (allowedProjects.indexOf(binding.project) === -1) fail(prefix + '.project', 'project is not allowed: ' + binding.project);

  var filePath = path.resolve(packageRoot, binding.testFile);
  if (!isInside(packageRoot, filePath) || !fs.existsSync(filePath)) {
    fail(prefix + '.testFile', 'testFile must exist inside packageRoot');
  }
  var realPackageRoot = fs.realpathSync(packageRoot);
  var realFilePath = fs.realpathSync(filePath);
  if (!isInside(realPackageRoot, realFilePath)) fail(prefix + '.testFile', 'testFile must resolve inside packageRoot');

  return {
    testFile: binding.testFile,
    testTitle: binding.testTitle,
    project: binding.project,
    threshold: binding.threshold,
    masks: masks
  };
}

function loadVisualConfig(projectDir, packageRoot, allowedProjects) {
  var file = path.join(path.resolve(projectDir), 'sdd.visual.config.json');
  if (!fs.existsSync(file)) {
    throw visualConfigError('VISUAL_CONFIG_MISSING', 'visual config file is missing', { path: file });
  }
  var value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw visualConfigError('VISUAL_CONFIG_INVALID', 'invalid visual config JSON', { path: file }); }
  if (!plainObject(value)) fail('', 'visual config must be an object');
  Object.keys(value).forEach(function(field) {
    if (ROOT_FIELDS.indexOf(field) === -1) fail(field, 'unknown visual config field: ' + field);
  });
  if (value.schemaVersion !== 1) fail('schemaVersion', 'schemaVersion must be 1');
  if (!plainObject(value.scenarios) || !Object.keys(value.scenarios).length) fail('scenarios', 'scenarios must be a non-empty object');
  if (!Array.isArray(allowedProjects) || !allowedProjects.length) fail('projects', 'allowed projects must be a non-empty array');

  var root = path.resolve(packageRoot);
  if (!fs.existsSync(root)) fail('packageRoot', 'packageRoot must exist');
  var scenarios = {};
  Object.keys(value.scenarios).forEach(function(scenarioId) {
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(scenarioId)) fail('scenarios.' + scenarioId, 'invalid scenario id');
    scenarios[scenarioId] = validateBinding(scenarioId, value.scenarios[scenarioId], root, allowedProjects);
  });
  return { schemaVersion: 1, scenarios: scenarios };
}

function bindScenarios(config, scenarioIds) {
  if (!config || !plainObject(config.scenarios) || !Array.isArray(scenarioIds)) {
    throw visualConfigError('VISUAL_SCENARIO_BINDING_INVALID', 'visual scenario binding input is invalid');
  }
  var required = {};
  scenarioIds.forEach(function(scenarioId) {
    if (typeof scenarioId !== 'string' || !scenarioId || required[scenarioId]) {
      throw visualConfigError('VISUAL_SCENARIO_BINDING_INVALID', 'visual scenario ids must be unique');
    }
    required[scenarioId] = true;
  });
  var configured = Object.keys(config.scenarios).sort();
  var expected = Object.keys(required).sort();
  if (configured.length !== expected.length || configured.some(function(id, index) { return id !== expected[index]; })) {
    throw visualConfigError('VISUAL_SCENARIO_BINDING_INVALID', 'visual config scenarios must match contract scenarios exactly', {
      configuredScenarioIds: configured,
      requiredScenarioIds: expected
    });
  }
  return expected.map(function(scenarioId) {
    return Object.assign({ scenarioId: scenarioId }, config.scenarios[scenarioId]);
  });
}

module.exports = {
  loadVisualConfig: loadVisualConfig,
  bindScenarios: bindScenarios,
  _private: { isInside: isInside }
};
