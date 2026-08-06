'use strict';

var fs = require('fs');
var path = require('path');
var errors = require('../verification/errors');
var attachmentStore = require('../verification/attachment-store');

var FILE_LIMIT = attachmentStore.FILE_LIMIT;
var RUN_LIMIT = attachmentStore.RUN_LIMIT;
var ROOT_FIELDS = ['schemaVersion', 'runId', 'createdAt', 'providerId', 'adapterId', 'providerDigest', 'adapterManifestDigest',
  'invocationDigest', 'spec', 'codeStateBefore', 'codeStateAfter', 'workspace', 'targets', 'status', 'freshness', 'gateDecision',
  'process', 'visual', 'attachments', 'diagnostics'];

function inside(root, target) {
  var relative = path.relative(root, target);
  return relative === '' || (!!relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
function invalid(message) { errors.fail('VISUAL_RUN_SCHEMA_INVALID', message); }
function object(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Visual Run requires object ' + name); }
function sha(value, name) { if (!/^[a-f0-9]{64}$/i.test(String(value || ''))) invalid('Visual Run requires SHA-256 ' + name); }
function string(value, name) { if (typeof value !== 'string' || !value) invalid('Visual Run requires ' + name); }
function exactKeys(value, fields, name) {
  Object.keys(value).forEach(function(key) { if (fields.indexOf(key) === -1) invalid('Visual Run has unknown ' + name + ' field: ' + key); });
}
function uniqueStrings(value, name) {
  if (!Array.isArray(value) || !value.length || value.some(function(item) { return typeof item !== 'string' || !item; }) || new Set(value).size !== value.length) {
    invalid('Visual Run requires unique non-empty ' + name);
  }
}

function validateRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) invalid('Visual Run must be an object');
  exactKeys(run, ROOT_FIELDS, 'root');
  if (run.schemaVersion !== 1) invalid('Visual Run schemaVersion must be 1');
  ['runId', 'createdAt', 'providerId', 'adapterId', 'status', 'freshness', 'gateDecision'].forEach(function(field) { string(run[field], field); });
  if (!/^[A-Za-z0-9._-]+$/.test(run.runId)) invalid('Visual Run runId is invalid');
  if (Number.isNaN(Date.parse(run.createdAt))) invalid('Visual Run createdAt must be ISO-8601');
  if (['passed', 'failed', 'blocked', 'interrupted'].indexOf(run.status) === -1) invalid('Visual Run status is invalid');
  if (['fresh', 'stale', 'unknown'].indexOf(run.freshness) === -1) invalid('Visual Run freshness is invalid');
  if (['PASS', 'FAIL', 'BLOCKED'].indexOf(run.gateDecision) === -1) invalid('Visual Run gateDecision is invalid');
  ['providerDigest', 'adapterManifestDigest', 'invocationDigest'].forEach(function(field) { sha(run[field], field); });
  ['attachments', 'diagnostics'].forEach(function(field) { if (!Array.isArray(run[field])) invalid('Visual Run requires array ' + field); });

  object(run.spec, 'spec');
  exactKeys(run.spec, ['path', 'specDigest', 'visualContractDigest', 'configDigest'], 'spec');
  string(run.spec.path, 'spec.path');
  ['specDigest', 'visualContractDigest', 'configDigest'].forEach(function(field) { sha(run.spec[field], 'spec.' + field); });
  ['codeStateBefore', 'codeStateAfter'].forEach(function(field) { object(run[field], field); sha(run[field].aggregateDigest, field + '.aggregateDigest'); });
  object(run.workspace, 'workspace');
  exactKeys(run.workspace, ['workspaceRoot', 'packageRoot', 'resolvedToolVersion', 'manifestDigest', 'lockfileDigest', 'configDigest'], 'workspace');
  ['workspaceRoot', 'packageRoot', 'resolvedToolVersion'].forEach(function(field) { string(run.workspace[field], 'workspace.' + field); });
  ['manifestDigest', 'lockfileDigest', 'configDigest'].forEach(function(field) { sha(run.workspace[field], 'workspace.' + field); });
  object(run.targets, 'targets');
  exactKeys(run.targets, ['scenarioIds', 'projects'], 'targets');
  uniqueStrings(run.targets.scenarioIds, 'targets.scenarioIds');
  uniqueStrings(run.targets.projects, 'targets.projects');
  object(run.process, 'process');
  if (!Number.isInteger(run.process.status) || typeof run.process.signal !== 'string') invalid('Visual Run process is invalid');

  object(run.visual, 'visual');
  exactKeys(run.visual, ['scenarios'], 'visual');
  if (!Array.isArray(run.visual.scenarios) || (run.visual.scenarios.length !== run.targets.scenarioIds.length &&
      !(run.gateDecision !== 'PASS' && run.visual.scenarios.length === 0))) invalid('Visual Run must contain one visual result per target scenario');
  var scenarioIds = {};
  run.visual.scenarios.forEach(function(scenario) {
    object(scenario, 'visual.scenario');
    exactKeys(scenario, ['scenarioId', 'baselineDigest', 'currentDigest', 'changedPixels', 'totalPixels', 'changedRatio', 'threshold', 'masks', 'maskedPixels', 'decision'], 'visual.scenario');
    string(scenario.scenarioId, 'visual.scenario.scenarioId');
    if (scenarioIds[scenario.scenarioId] || run.targets.scenarioIds.indexOf(scenario.scenarioId) === -1) invalid('Visual Run scenario result does not match targets');
    scenarioIds[scenario.scenarioId] = true;
    ['baselineDigest', 'currentDigest'].forEach(function(field) { sha(scenario[field], 'visual.scenario.' + field); });
    if (!Array.isArray(scenario.masks) || scenario.masks.some(function(mask) {
      return !mask || typeof mask !== 'object' || Array.isArray(mask) || Object.keys(mask).some(function(field) { return ['x', 'y', 'width', 'height'].indexOf(field) === -1; }) ||
        !Number.isInteger(mask.x) || !Number.isInteger(mask.y) || !Number.isInteger(mask.width) || !Number.isInteger(mask.height) ||
        mask.x < 0 || mask.y < 0 || mask.width < 1 || mask.height < 1;
    }) || !Number.isInteger(scenario.maskedPixels) || scenario.maskedPixels < 0 ||
        !Number.isInteger(scenario.changedPixels) || !Number.isInteger(scenario.totalPixels) || scenario.totalPixels < 1 || scenario.changedPixels < 0 || scenario.changedPixels > scenario.totalPixels) {
      invalid('Visual Run scenario pixel counts are invalid');
    }
    if (!Number.isFinite(scenario.changedRatio) || Math.abs(scenario.changedRatio - scenario.changedPixels / scenario.totalPixels) > 1e-12 ||
        !Number.isFinite(scenario.threshold) || scenario.threshold < 0 || scenario.threshold > 1 || ['PASS', 'FAIL'].indexOf(scenario.decision) === -1) {
      invalid('Visual Run scenario diff summary is invalid');
    }
    if ((scenario.changedRatio <= scenario.threshold) !== (scenario.decision === 'PASS')) invalid('Visual Run scenario decision does not match threshold');
  });
  if (run.gateDecision === 'PASS' && (run.status !== 'passed' || run.freshness !== 'fresh' || run.visual.scenarios.some(function(scenario) { return scenario.decision !== 'PASS'; }))) {
    invalid('PASS Visual Run must be fresh, passed, and within every scenario threshold');
  }
  if (run.gateDecision === 'FAIL' && (run.status !== 'failed' || !run.visual.scenarios.some(function(scenario) { return scenario.decision === 'FAIL'; }))) {
    invalid('FAIL Visual Run must contain a failed scenario');
  }
  return run;
}

function commitVisualRun(projectDir, docsDir, run, attachments) {
  validateRun(run);
  var projectRoot = fs.realpathSync(path.resolve(projectDir));
  var workspaceCandidate = path.resolve(projectRoot, run.workspace.workspaceRoot);
  if (!inside(projectRoot, workspaceCandidate) || !fs.existsSync(workspaceCandidate)) errors.fail('PATH_ESCAPE', 'Visual Run workspaceRoot escapes project or does not exist', { path: run.workspace.workspaceRoot });
  var attachmentRoot = fs.realpathSync(workspaceCandidate);
  if (!inside(projectRoot, attachmentRoot) || !fs.statSync(attachmentRoot).isDirectory()) errors.fail('PATH_ESCAPE', 'Visual Run workspaceRoot realpath escapes project', { path: run.workspace.workspaceRoot });
  var runsRoot = path.join(projectRoot, docsDir, 'runs', 'visual');
  fs.mkdirSync(runsRoot, { recursive: true });
  var finalDir = path.join(runsRoot, run.runId);
  if (fs.existsSync(finalDir)) errors.fail('VISUAL_RUN_ALREADY_EXISTS', 'visual run already exists', { runId: run.runId });
  var staging = path.join(runsRoot, '.staging-' + run.runId + '-' + process.pid + '-' + Date.now());
  fs.mkdirSync(path.join(staging, 'artifacts'), { recursive: true });
  try {
    var records = attachmentStore.copyAttachments(attachmentRoot, staging, attachments);
    var value = Object.assign({}, run, { attachments: records });
    fs.writeFileSync(path.join(staging, 'run.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    if (fs.existsSync(finalDir)) errors.fail('VISUAL_RUN_ALREADY_EXISTS', 'visual run already exists', { runId: run.runId });
    fs.renameSync(staging, finalDir);
    return { runDir: finalDir, run: value };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function runsForSpec(projectDir, docsDir, specPath) {
  if (!specPath || !fs.existsSync(specPath)) return [];
  var root = path.resolve(projectDir);
  var expectedSpec = path.relative(root, fs.realpathSync(specPath)).replace(/\\/g, '/') || '.';
  var runsRoot = path.join(root, docsDir, 'runs', 'visual');
  if (!fs.existsSync(runsRoot)) return [];
  var runs = [];
  fs.readdirSync(runsRoot).filter(function(name) { return !name.startsWith('.staging-'); }).forEach(function(name) {
    var file = path.join(runsRoot, name, 'run.json');
    if (!fs.existsSync(file)) return;
    var value;
    try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_) { errors.fail('VISUAL_RUN_SCHEMA_INVALID', 'stored Visual Run is not valid JSON', { path: file }); }
    validateRun(value);
    if (value.spec.path === expectedSpec) runs.push(value);
  });
  runs.sort(function(a, b) { return Date.parse(b.createdAt) - Date.parse(a.createdAt) || String(b.runId).localeCompare(String(a.runId)); });
  return runs;
}

module.exports = { commitVisualRun: commitVisualRun, validateVisualRun: validateRun, runsForSpec: runsForSpec,
  FILE_LIMIT: FILE_LIMIT, RUN_LIMIT: RUN_LIMIT };
