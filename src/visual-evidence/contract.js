'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var inspectionDetails = new WeakMap();

function frontmatterValue(content, key) {
  var match = String(content || '').match(new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*"?([^"\\r\\n]*)"?\\s*$', 'm'));
  return match ? match[1].trim() : '';
}

function result(state, planReadiness, baselineStatus, diffStatus, diagnostics) {
  return {
    state: state,
    planReadiness: planReadiness,
    baselineStatus: baselineStatus,
    diffStatus: diffStatus,
    diagnostics: diagnostics || []
  };
}

function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function visualRunProviderAndWorkspaceAreCurrent(projectDir, run) {
  try {
    var verificationConfig = require('../verification/config').loadVerificationConfig(projectDir);
    var provider = verificationConfig.providers[run.providerId];
    if (!provider || provider.adapter !== run.adapterId || digest(JSON.stringify(provider)) !== run.providerDigest) return false;
    var registry = require('../verification/registry');
    var adapter = registry.requireCapability(registry.resolveAdapter(provider.adapter), 'visual-gate');
    if (digest(JSON.stringify(adapter)) !== run.adapterManifestDigest) return false;
    var resolved = require('../verification/workspace').resolveWorkspace(provider, projectDir, adapter);
    var configFile = require('../verification/workspace').resolveConfigFile(resolved.workspaceRoot, provider.config);
    return resolved.toolVersion === run.workspace.resolvedToolVersion &&
      digest(fs.readFileSync(resolved.declaringManifest)) === run.workspace.manifestDigest &&
      digest(fs.readFileSync(resolved.lockfile)) === run.workspace.lockfileDigest &&
      digest(fs.readFileSync(configFile)) === run.workspace.configDigest;
  } catch (_) {
    return false;
  }
}

function composeVisualRunStatus(base, specPath, projectDir) {
  var details = inspectionDetails.get(base);
  if (base.state !== 'ready' || !details || details.mode !== 'fidelity') return base;
  var manifestPath = details.manifestPath;
  var run;
  try { run = require('../visual-verification/run-store').runsForSpec(projectDir, require('../../lib/common').getDocsDir(projectDir), specPath)[0]; }
  catch (error) { return result(base.state, base.planReadiness, base.baselineStatus, 'stale', [{ code: error.code || 'VISUAL_RUN_INVALID' }]); }
  if (!run) return base;
  var configPath = path.join(path.resolve(projectDir), 'sdd.visual.config.json');
  var currentSpec = fs.readFileSync(specPath, 'utf8');
  var stale = run.spec.specDigest !== digest(currentSpec) || run.spec.visualContractDigest !== digest(fs.readFileSync(manifestPath)) ||
    !fs.existsSync(configPath) || run.spec.configDigest !== digest(fs.readFileSync(configPath));
  if (!stale) {
    try {
      var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      var contextRoot = path.resolve(projectDir, frontmatterValue(currentSpec, 'context-source'));
      var scenarios = {};
      (manifest.scenarios || []).forEach(function(scenario) { scenarios[scenario.id] = scenario; });
      stale = (run.visual && run.visual.scenarios || []).some(function(summary) {
        var scenario = scenarios[summary.scenarioId];
        var baseline = scenario && scenario.baseline && scenario.baseline.path;
        var baselinePath = baseline && path.resolve(contextRoot, baseline);
        return !baselinePath || !fs.existsSync(baselinePath) || digest(fs.readFileSync(baselinePath)) !== summary.baselineDigest;
      });
    } catch (_) { stale = true; }
  }
  if (!stale) {
    stale = !visualRunProviderAndWorkspaceAreCurrent(projectDir, run);
  }
  if (!stale) {
    try {
      stale = require('../verification/fingerprint').captureCodeState(projectDir, require('../../lib/common').getDocsDir(projectDir)).aggregateDigest !== run.codeStateAfter.aggregateDigest;
    } catch (_) { stale = true; }
  }
  if (stale) return result(base.state, base.planReadiness, base.baselineStatus, 'stale', [{ code: 'VISUAL_RUN_STALE' }]);
  return result(base.state, base.planReadiness, base.baselineStatus, String(run.gateDecision || '').toLowerCase(), []);
}

function isInside(parentPath, childPath) {
  var relative = path.relative(parentPath, childPath);
  return relative === '' || (relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function isRealpathInside(parentPath, childPath) {
  try { return isInside(fs.realpathSync(parentPath), fs.realpathSync(childPath)); }
  catch (error) { return false; }
}

function isValidIsoTimestamp(value) {
  var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || Number.isNaN(Date.parse(value))) return false;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var hour = Number(match[4]);
  var minute = Number(match[5]);
  var second = Number(match[6]);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
    hour <= 23 && minute <= 59 && second <= 59;
}

function invalidBaseline(contextPath, baseline, requireApproved) {
  if (!baseline || ['pending', 'approved'].indexOf(baseline.status) === -1) return true;
  if (requireApproved && baseline.status !== 'approved') return true;
  if (baseline.status === 'approved' && !baseline.path) return true;
  if (!baseline.path) return false;
  var baselinePath = path.resolve(contextPath, baseline.path);
  return !isInside(contextPath, baselinePath) || !fs.existsSync(baselinePath) || !isRealpathInside(contextPath, baselinePath);
}

function inspectContract(specPath, projectDir) {
  var specContent = fs.readFileSync(specPath, 'utf-8');
  if (frontmatterValue(specContent, 'visual-evidence') !== 'required') {
    return result('not-applicable', 'not-applicable', 'not-applicable', 'not-run');
  }

  var manifestRef = frontmatterValue(specContent, 'visual-evidence-file');
  if (!manifestRef) {
    return result('blocked', 'blocked', 'unknown', 'not-run', [{ code: 'VISUAL_EVIDENCE_FILE_MISSING' }]);
  }

  var manifestPath = path.resolve(projectDir, manifestRef);
  var contextRef = frontmatterValue(specContent, 'context-source');
  var contextPath = contextRef ? path.resolve(projectDir, contextRef) : '';
  if (!contextPath || !isInside(contextPath, manifestPath)) {
    return result('blocked', 'blocked', 'unknown', 'not-run', [{ code: 'VISUAL_EVIDENCE_PATH_OUTSIDE_CONTEXT' }]);
  }
  if (!fs.existsSync(manifestPath)) {
    return result('blocked', 'blocked', 'unknown', 'not-run', [{ code: 'VISUAL_EVIDENCE_FILE_MISSING' }]);
  }
  if (!isRealpathInside(contextPath, manifestPath)) {
    return result('blocked', 'blocked', 'unknown', 'not-run', [{ code: 'VISUAL_EVIDENCE_PATH_OUTSIDE_CONTEXT' }]);
  }

  var manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); }
  catch (error) { return result('blocked', 'blocked', 'unknown', 'not-run', [{ code: 'VISUAL_EVIDENCE_SCHEMA_INVALID' }]); }

  if (manifest.schemaVersion !== 1 || ['direction', 'fidelity'].indexOf(manifest.mode) === -1 ||
      !Array.isArray(manifest.sources) || !manifest.sources.length || !Array.isArray(manifest.scenarios) || !manifest.scenarios.length) {
    return result('blocked', 'blocked', 'unknown', 'not-run', [{ code: 'VISUAL_EVIDENCE_SCHEMA_INVALID' }]);
  }
  if (!manifest.approval || !/^human:[^\s:]+$/.test(manifest.approval.approvedBy || '') ||
      !isValidIsoTimestamp(manifest.approval.approvedAt)) {
    return result('pending-approval', 'blocked', 'unknown', 'not-run', [{ code: 'VISUAL_EVIDENCE_APPROVAL_PENDING' }]);
  }

  var sourceIds = {};
  var invalidSource = manifest.sources.some(function(source) {
    if (!source || !source.id || sourceIds[source.id] || !source.type || (!source.reference && !source.path)) return true;
    sourceIds[source.id] = true;
    if (!source.path) return false;
    var sourcePath = path.resolve(contextPath, source.path);
    return !isInside(contextPath, sourcePath) || !fs.existsSync(sourcePath) || !isRealpathInside(contextPath, sourcePath);
  });
  var scenarioIds = {};
  var invalidShape = invalidSource || manifest.scenarios.some(function(scenario) {
    if (!scenario || !scenario.id || scenarioIds[scenario.id] || !scenario.route || !scenario.state || !scenario.viewport ||
        !Number.isInteger(scenario.viewport.width) || scenario.viewport.width < 1 || !Number.isInteger(scenario.viewport.height) || scenario.viewport.height < 1) return true;
    scenarioIds[scenario.id] = true;
    return false;
  });
  if (invalidShape) return result('blocked', 'blocked', 'unknown', 'not-run', [{ code: 'VISUAL_EVIDENCE_SCHEMA_INVALID' }]);

  if (manifest.mode === 'fidelity') {
    var sources = {};
    manifest.sources.forEach(function(source) { sources[source.id] = source; });
    var invalidScenario = manifest.scenarios.some(function(scenario) {
      return !scenario.sourceId || !sources[scenario.sourceId] || invalidBaseline(contextPath, scenario.baseline, true);
    });
    if (invalidScenario) {
      return result('blocked', 'blocked', 'unknown', 'not-run', [{ code: 'VISUAL_EVIDENCE_SCHEMA_INVALID' }]);
    }
    var fidelity = result('ready', 'ready', 'approved', 'not-run');
    inspectionDetails.set(fidelity, { mode: 'fidelity', manifestPath: manifestPath });
    return fidelity;
  }

  var invalidDirectionBaseline = manifest.scenarios.some(function(scenario) { return invalidBaseline(contextPath, scenario.baseline, false); });
  if (invalidDirectionBaseline) return result('blocked', 'blocked', 'unknown', 'not-run', [{ code: 'VISUAL_EVIDENCE_SCHEMA_INVALID' }]);
  var pending = manifest.scenarios.some(function(scenario) { return scenario.baseline.status === 'pending'; });
  var direction = result('ready', 'ready', pending ? 'pending' : 'approved', 'not-run');
  inspectionDetails.set(direction, { mode: 'direction', manifestPath: manifestPath });
  return direction;
}

function inspect(specPath, projectDir) {
  return composeVisualRunStatus(inspectContract(specPath, projectDir), specPath, projectDir);
}

module.exports = { inspect: inspect, inspectContract: inspectContract,
  _private: { isInside: isInside, isRealpathInside: isRealpathInside, isValidIsoTimestamp: isValidIsoTimestamp } };
