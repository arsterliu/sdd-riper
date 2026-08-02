'use strict';

var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var validate = require('./validate');
var contract = require('../visual-evidence/contract');

function isInside(parentPath, childPath) {
  var relative = path.relative(parentPath, childPath);
  return relative === '' || (relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function isRealpathInside(parentPath, childPath) {
  try { return isInside(fs.realpathSync(parentPath), fs.realpathSync(childPath)); }
  catch (error) { return false; }
}

function setField(content, field, value) {
  var line = field + ': "' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  var matcher = new RegExp('^' + field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':.*$', 'm');
  if (matcher.test(content)) return content.replace(matcher, line);
  return content.replace(/^---\r?\n/, '---\n' + line + '\n');
}

function resolveSpec(projectDir, spec) {
  return validate.resolveSpec(projectDir, { spec: spec });
}

function init(projectDir, opts) {
  var root = path.resolve(projectDir);
  if (!opts || ['fidelity', 'direction'].indexOf(opts.mode) === -1) throw new Error('VISUAL_EVIDENCE_USAGE: --mode must be fidelity or direction');
  var specPath = resolveSpec(root, opts.spec);
  var docsRoot = common.getDocsRoot(root);
  var specsRoot = path.join(docsRoot, 'specs');
  if (!specPath || !fs.existsSync(specPath) || !isRealpathInside(specsRoot, specPath)) {
    throw new Error('VISUAL_EVIDENCE_SPEC_INVALID: --spec must resolve to an active Spec');
  }

  var content = fs.readFileSync(specPath, 'utf-8');
  if (common.getFrontmatterField(specPath, 'visual-evidence') === 'required') {
    throw new Error('VISUAL_EVIDENCE_ALREADY_ENABLED: visual evidence is already enabled for this Spec');
  }
  var taskName = common.getFrontmatterField(specPath, 'task-name');
  var docsDir = common.getDocsDir(root);
  var contextRef = common.getFrontmatterField(specPath, 'context-source') || (docsDir + '/context/' + taskName);
  var contextPath = path.resolve(root, contextRef);
  if (!taskName || !isInside(docsRoot, contextPath)) throw new Error('VISUAL_EVIDENCE_CONTEXT_INVALID: Context must be inside the project docs directory');

  var manifestPath = path.join(contextPath, 'visual-evidence.json');
  if (fs.existsSync(manifestPath)) throw new Error('VISUAL_EVIDENCE_FILE_EXISTS: visual-evidence.json already exists');
  fs.mkdirSync(contextPath, { recursive: true });
  if (!isRealpathInside(docsRoot, contextPath)) throw new Error('VISUAL_EVIDENCE_CONTEXT_INVALID: Context realpath must be inside the project docs directory');
  var templatePath = path.resolve(__dirname, '../../templates/visual-evidence.json');
  var template = fs.readFileSync(templatePath, 'utf-8').replace('__MODE__', opts.mode);
  var temporaryPath = manifestPath + '.tmp-' + process.pid;
  fs.writeFileSync(temporaryPath, template, 'utf-8');
  fs.renameSync(temporaryPath, manifestPath);

  var manifestRef = common.relativeToProject(root, manifestPath).replace(/\\/g, '/');
  content = setField(content, 'context-source', contextRef.replace(/\\/g, '/'));
  content = setField(content, 'visual-evidence', 'required');
  content = setField(content, 'visual-evidence-file', manifestRef);
  fs.writeFileSync(specPath, content, 'utf-8');
  return contract.inspect(specPath, root);
}

function print(result) {
  console.log('VISUAL_EVIDENCE_STATE: ' + result.state);
  console.log('PLAN_READINESS: ' + result.planReadiness);
  console.log('BASELINE_STATUS: ' + result.baselineStatus);
  console.log('DIFF_STATUS: ' + result.diffStatus);
  result.diagnostics.forEach(function(diagnostic) { console.log('DIAGNOSTIC: ' + diagnostic.code); });
}

function runInit(projectDir, opts) {
  try { print(init(projectDir, opts)); }
  catch (error) { console.error('[' + String(error.message || error).split(':')[0] + '] ' + String(error.message || error)); process.exitCode = 3; }
}

function inspect(projectDir, opts) {
  try { print(contract.inspect(resolveSpec(path.resolve(projectDir), opts.spec), path.resolve(projectDir))); }
  catch (error) { console.error('[VISUAL_EVIDENCE_INSPECT_FAILED] ' + error.message); process.exitCode = 2; }
}

module.exports = { init: init, runInit: runInit, inspect: inspect, _private: { setField: setField, isInside: isInside, isRealpathInside: isRealpathInside } };
