'use strict';

var fs = require('fs');
var path = require('path');

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

function inspect(specPath, projectDir) {
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
    return result('ready', 'ready', 'approved', 'not-run');
  }

  var invalidDirectionBaseline = manifest.scenarios.some(function(scenario) { return invalidBaseline(contextPath, scenario.baseline, false); });
  if (invalidDirectionBaseline) return result('blocked', 'blocked', 'unknown', 'not-run', [{ code: 'VISUAL_EVIDENCE_SCHEMA_INVALID' }]);
  var pending = manifest.scenarios.some(function(scenario) { return scenario.baseline.status === 'pending'; });
  return result('ready', 'ready', pending ? 'pending' : 'approved', 'not-run');
}

module.exports = { inspect: inspect, _private: { isInside: isInside, isRealpathInside: isRealpathInside, isValidIsoTimestamp: isValidIsoTimestamp } };
