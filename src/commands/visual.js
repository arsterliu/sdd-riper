'use strict';

var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var validate = require('./validate');
var contract = require('../visual-evidence/contract');
var discoveryModule = require('../visual-evidence/discovery');

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
  var specPath = activeSpecPath(root, opts.spec, 'VISUAL_EVIDENCE_SPEC_INVALID');
  var docsRoot = common.getDocsRoot(root);

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

function activeSpecPath(projectDir, spec, errorCode) {
  var root = path.resolve(projectDir);
  var specPath = resolveSpec(root, spec);
  var specsRoot = path.join(common.getDocsRoot(root), 'specs');
  var code = errorCode || 'VISUAL_CONTEXT_SPEC_INVALID';
  if (!specPath || !fs.existsSync(specPath) || !isRealpathInside(specsRoot, specPath) || common.getFrontmatterField(specPath, 'status') === 'archived') {
    throw new Error(code + ': --spec must resolve to an active Spec');
  }
  return specPath;
}

function hasValidVisualContextSelection(specPath) {
  var uiImpact = common.getFrontmatterField(specPath, 'ui-impact');
  var intent = common.getFrontmatterField(specPath, 'visual-context-intent');
  return (uiImpact === 'no' && intent === 'not-applicable') ||
    (uiImpact === 'yes' && ['not-required', 'direction', 'fidelity'].indexOf(intent) !== -1);
}

function select(projectDir, opts) {
  opts = opts || {};
  if (['yes', 'no'].indexOf(opts.uiImpact) === -1) {
    throw new Error('VISUAL_CONTEXT_USAGE: --ui-impact must be yes or no');
  }
  if (opts.uiImpact === 'yes' && ['not-required', 'direction', 'fidelity'].indexOf(opts.intent) === -1) {
    throw new Error('VISUAL_CONTEXT_USAGE: --intent must be not-required, direction, or fidelity when --ui-impact is yes');
  }

  var specPath = activeSpecPath(projectDir, opts.spec, 'VISUAL_CONTEXT_SPEC_INVALID');
  if (opts.uiImpact === 'no' && validate.profileUiImpact(specPath, path.resolve(projectDir)) === 'frontend') {
    throw new Error('VISUAL_CONTEXT_UI_IMPACT_CONTRADICTS_PROFILE: --ui-impact no conflicts with the Spec-bound frontend Profile scope');
  }
  var content = fs.readFileSync(specPath, 'utf-8');
  if (hasValidVisualContextSelection(specPath)) {
    throw new Error('VISUAL_CONTEXT_ALREADY_SELECTED: visual context intent is already recorded for this Spec');
  }
  content = setField(content, 'ui-impact', opts.uiImpact);
  content = setField(content, 'visual-context-intent', opts.uiImpact === 'no' ? 'not-applicable' : opts.intent);
  fs.writeFileSync(specPath, content, 'utf-8');
  return {
    uiImpact: opts.uiImpact,
    intent: opts.uiImpact === 'no' ? 'not-applicable' : opts.intent
  };
}

function discover(projectDir, opts) {
  var root = path.resolve(projectDir);
  var specPath = activeSpecPath(root, opts && opts.spec, 'VISUAL_CONTEXT_SPEC_INVALID');
  return discoveryModule.discover(specPath, root);
}

function print(result) {
  console.log('VISUAL_EVIDENCE_STATE: ' + result.state);
  console.log('PLAN_READINESS: ' + result.planReadiness);
  console.log('BASELINE_STATUS: ' + result.baselineStatus);
  console.log('DIFF_STATUS: ' + result.diffStatus);
  result.diagnostics.forEach(function(diagnostic) { console.log('DIAGNOSTIC: ' + diagnostic.code); });
}

function printEntries(label, entries, format) {
  if (!entries.length) {
    console.log(label + ': none');
    return;
  }
  entries.forEach(function(entry) { console.log(label + ': ' + format(entry)); });
}

function printDiscovery(result) {
  printEntries('MATERIAL', result.materials, function(material) {
    return material.path + ' [' + material.kind + ']';
  });
  printEntries('CANDIDATE', result.candidates, function(candidate) {
    return candidate.kind + ' ' + candidate.materialPath + ' ' + (candidate.hint || candidate.reference) + ' [' + candidate.confidence + ']';
  });
  printEntries('GAP', result.gaps, function(gap) { return gap.code; });
  printEntries('QUESTION', result.questions, function(question) {
    return question.code + (question.materialPath ? ' ' + question.materialPath : '');
  });
  printEntries('DIAGNOSTIC', result.diagnostics, function(diagnostic) {
    return diagnostic.code + (diagnostic.path ? ' ' + diagnostic.path : '');
  });
}

function runInit(projectDir, opts) {
  try { print(init(projectDir, opts)); }
  catch (error) { console.error('[' + String(error.message || error).split(':')[0] + '] ' + String(error.message || error)); process.exitCode = 3; }
}

function runSelect(projectDir, opts) {
  try {
    var result = select(projectDir, opts);
    console.log('UI_IMPACT: ' + result.uiImpact);
    console.log('VISUAL_CONTEXT_INTENT: ' + result.intent);
  } catch (error) {
    console.error('[' + String(error.message || error).split(':')[0] + '] ' + String(error.message || error));
    process.exitCode = 3;
  }
}

function runDiscover(projectDir, opts) {
  try { printDiscovery(discover(projectDir, opts)); }
  catch (error) {
    console.error('[' + String(error.message || error).split(':')[0] + '] ' + String(error.message || error));
    process.exitCode = 3;
  }
}

function inspect(projectDir, opts) {
  try { print(contract.inspect(resolveSpec(path.resolve(projectDir), opts.spec), path.resolve(projectDir))); }
  catch (error) { console.error('[VISUAL_EVIDENCE_INSPECT_FAILED] ' + error.message); process.exitCode = 2; }
}

module.exports = { init: init, runInit: runInit, select: select, runSelect: runSelect, discover: discover, runDiscover: runDiscover, inspect: inspect, _private: { setField: setField, isInside: isInside, isRealpathInside: isRealpathInside, activeSpecPath: activeSpecPath, hasValidVisualContextSelection: hasValidVisualContextSelection } };
