'use strict';

var fs = require('fs');
var path = require('path');
var errors = require('./errors');
var attachmentStore = require('./attachment-store');

var FILE_LIMIT = attachmentStore.FILE_LIMIT;
var RUN_LIMIT = attachmentStore.RUN_LIMIT;

function inside(root, target) {
  var relative = path.relative(root, target);
  return relative === '' || (!!relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function validateRun(run) {
  function invalid(message) { errors.fail('RUN_SCHEMA_INVALID', message); }
  function object(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Run requires object ' + name);
  }
  function digest(value, name) {
    if (!/^[a-f0-9]{64}$/i.test(String(value || ''))) invalid('Run requires SHA-256 ' + name);
  }
  if (!run || typeof run !== 'object' || Array.isArray(run)) invalid('Run must be an object');
  if (run.schemaVersion !== 1) invalid('Run schemaVersion must be 1');
  ['runId', 'createdAt', 'providerId', 'adapterId', 'status', 'freshness', 'gateDecision'].forEach(function(field) {
    if (typeof run[field] !== 'string' || !run[field]) invalid('Run requires ' + field);
  });
  if (!/^[A-Za-z0-9._-]+$/.test(run.runId)) invalid('Run runId is invalid');
  if (Number.isNaN(Date.parse(run.createdAt))) invalid('Run createdAt must be ISO-8601');
  if (['passed', 'failed', 'blocked', 'interrupted'].indexOf(run.status) === -1) invalid('Run status is invalid');
  if (['fresh', 'stale', 'unknown'].indexOf(run.freshness) === -1) invalid('Run freshness is invalid');
  if (['PASS', 'FAIL', 'BLOCKED'].indexOf(run.gateDecision) === -1) invalid('Run gateDecision is invalid');
  ['acExecutions', 'testExecutions', 'attachments', 'diagnostics'].forEach(function(field) {
    if (!Array.isArray(run[field])) invalid('Run requires array ' + field);
  });
  digest(run.adapterManifestDigest, 'adapterManifestDigest');
  digest(run.providerDigest, 'providerDigest');
  digest(run.invocationDigest, 'invocationDigest');
  object(run.environmentDigests, 'environmentDigests');
  Object.keys(run.environmentDigests).forEach(function(name) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) invalid('Run environment digest key is invalid');
    digest(run.environmentDigests[name], 'environmentDigests.' + name);
  });
  if (!Array.isArray(run.allowedEnvironmentKeys) ||
      run.allowedEnvironmentKeys.some(function(name) { return !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name); }) ||
      new Set(run.allowedEnvironmentKeys).size !== run.allowedEnvironmentKeys.length) {
    invalid('Run allowedEnvironmentKeys must contain unique environment names');
  }
  object(run.spec, 'spec');
  ['path', 'diffBase'].forEach(function(field) {
    if (typeof run.spec[field] !== 'string') invalid('Run spec requires ' + field);
  });
  ['designPath'].forEach(function(field) {
    if (typeof run.spec[field] !== 'string') invalid('Run spec requires ' + field);
  });
  ['specDigest', 'verificationContractDigest', 'planDigest', 'designDigest'].forEach(function(field) { digest(run.spec[field], 'spec.' + field); });
  object(run.codeStateBefore, 'codeStateBefore');
  object(run.codeStateAfter, 'codeStateAfter');
  digest(run.codeStateBefore.aggregateDigest, 'codeStateBefore.aggregateDigest');
  digest(run.codeStateAfter.aggregateDigest, 'codeStateAfter.aggregateDigest');
  object(run.workspace, 'workspace');
  ['workspaceRoot', 'packageRoot', 'manifest', 'lockfile', 'resolvedToolVersion'].forEach(function(field) {
    if (typeof run.workspace[field] !== 'string' || !run.workspace[field]) invalid('Run workspace requires ' + field);
  });
  ['manifestDigest', 'lockfileDigest', 'configDigest'].forEach(function(field) { digest(run.workspace[field], 'workspace.' + field); });
  object(run.process, 'process');
  object(run.targets, 'targets');
  ['acIds', 'projects'].forEach(function(field) {
    if (!Array.isArray(run.targets[field]) || !run.targets[field].length ||
        run.targets[field].some(function(value) { return typeof value !== 'string' || !value; }) ||
        new Set(run.targets[field]).size !== run.targets[field].length) invalid('Run targets requires unique non-empty ' + field);
  });
  if (run.gateDecision === 'PASS' && (run.status !== 'passed' || run.freshness !== 'fresh')) {
    invalid('PASS Run must be passed and fresh');
  }
  if (run.gateDecision === 'PASS' && (!run.acExecutions.length || !run.testExecutions.length)) {
    invalid('PASS Run must contain AC and test executions');
  }
  if (run.gateDecision === 'PASS' && run.acExecutions.some(function(item) { return item.status !== 'passed'; })) {
    invalid('PASS Run cannot contain a non-passed AC execution');
  }
  if (run.gateDecision === 'PASS' && run.testExecutions.some(function(item) { return item.stablePass !== true; })) {
    invalid('PASS Run cannot contain a non-stable test execution');
  }
  if (run.gateDecision === 'PASS') {
    var testById = {};
    run.testExecutions.forEach(function(test) {
      if (!test || typeof test.id !== 'string' || !test.id || testById[test.id]) invalid('PASS Run test ids must be unique and non-empty');
      testById[test.id] = test;
      if (test.status !== 'passed' || test.expectedStatus !== 'passed' || test.retry !== 0 || test.stablePass !== true) {
        invalid('PASS Run test execution facts are inconsistent');
      }
    });
    var acKeys = {};
    run.acExecutions.forEach(function(ac) {
      if (!ac || !/^AC-\d+$/.test(ac.acId) || typeof ac.project !== 'string' || !ac.project ||
          !Array.isArray(ac.testIds) || !ac.testIds.length || ac.status !== 'passed') invalid('PASS Run AC execution is invalid');
      var key = ac.acId + '\0' + ac.project;
      if (acKeys[key]) invalid('PASS Run AC/project execution must be unique');
      acKeys[key] = true;
      ac.testIds.forEach(function(testId) {
        var test = testById[testId];
        if (!test || test.project !== ac.project || !Array.isArray(test.acIds) || test.acIds.indexOf(ac.acId) === -1) {
          invalid('PASS Run AC to test mapping is inconsistent');
        }
      });
    });
    var expectedKeys = [];
    run.targets.acIds.forEach(function(acId) {
      if (!/^AC-\d+$/.test(acId)) invalid('Run target AC id is invalid');
      run.targets.projects.forEach(function(project) { expectedKeys.push(acId + '\0' + project); });
    });
    if (Object.keys(acKeys).length !== expectedKeys.length || expectedKeys.some(function(key) { return !acKeys[key]; })) {
      invalid('PASS Run does not cover every target AC/project pair');
    }
  }
  return run;
}

function commitRun(projectDir, docsDir, run, attachments) {
  validateRun(run);
  var projectRoot = fs.realpathSync(path.resolve(projectDir));
  var workspaceCandidate = path.resolve(projectRoot, run.workspace.workspaceRoot);
  if (!inside(projectRoot, workspaceCandidate) || !fs.existsSync(workspaceCandidate)) {
    errors.fail('PATH_ESCAPE', 'Run workspaceRoot escapes project or does not exist', { path: run.workspace.workspaceRoot });
  }
  var attachmentRoot = fs.realpathSync(workspaceCandidate);
  if (!inside(projectRoot, attachmentRoot) || !fs.statSync(attachmentRoot).isDirectory()) {
    errors.fail('PATH_ESCAPE', 'Run workspaceRoot realpath escapes project', { path: run.workspace.workspaceRoot });
  }
  var runsRoot = path.join(projectRoot, docsDir, 'runs', 'verification');
  fs.mkdirSync(runsRoot, { recursive: true });
  var finalDir = path.join(runsRoot, run.runId);
  if (fs.existsSync(finalDir)) errors.fail('RUN_ALREADY_EXISTS', 'verification run already exists', { runId: run.runId });
  var staging = path.join(runsRoot, '.staging-' + run.runId + '-' + process.pid + '-' + Date.now());
  fs.mkdirSync(path.join(staging, 'artifacts'), { recursive: true });
  try {
    var records = attachmentStore.copyAttachments(attachmentRoot, staging, attachments);
    var value = Object.assign({}, run, { attachments: records });
    fs.writeFileSync(path.join(staging, 'run.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    if (fs.existsSync(finalDir)) errors.fail('RUN_ALREADY_EXISTS', 'verification run already exists', { runId: run.runId });
    fs.renameSync(staging, finalDir);
    return { runDir: finalDir, run: value };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function latestRunForProvider(projectDir, docsDir, providerId, specPath) {
  return runsForProvider(projectDir, docsDir, providerId, specPath)[0] || null;
}

function runsForProvider(projectDir, docsDir, providerId, specPath) {
  if (!specPath || !fs.existsSync(specPath)) return [];
  var expectedSpec = path.relative(path.resolve(projectDir), fs.realpathSync(specPath)).replace(/\\/g, '/') || '.';
  var root = path.join(path.resolve(projectDir), docsDir, 'runs', 'verification');
  if (!fs.existsSync(root)) return [];
  var runs = [];
  fs.readdirSync(root).filter(function(name) { return !name.startsWith('.staging-'); }).forEach(function(name) {
    var file = path.join(root, name, 'run.json');
    if (!fs.existsSync(file)) return;
    var value;
    try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
      errors.fail('RUN_SCHEMA_INVALID', 'stored Run is not valid JSON', { path: file });
    }
    validateRun(value);
    if (value.providerId === providerId && value.spec.path === expectedSpec) runs.push(value);
  });
  runs.sort(function(a, b) { return Date.parse(b.createdAt) - Date.parse(a.createdAt); });
  return runs;
}

module.exports = { commitRun: commitRun, validateRun: validateRun, latestRunForProvider: latestRunForProvider,
  runsForProvider: runsForProvider,
  FILE_LIMIT: FILE_LIMIT, RUN_LIMIT: RUN_LIMIT };
