'use strict';

var path = require('path');
var sanitizeDiagnostic = require('./process-gateway').sanitizeDiagnostic;

function orderedRuns(runs) {
  return (runs || []).slice().sort(function(a, b) {
    return Date.parse(b.createdAt) - Date.parse(a.createdAt) || String(b.runId).localeCompare(String(a.runId));
  });
}

function safeAttachment(item) {
  if (!item || typeof item !== 'object') return null;
  var relative = String(item.path || '').replace(/\\/g, '/');
  if (!relative || path.posix.isAbsolute(relative) || relative.split('/').indexOf('..') !== -1 ||
      relative.indexOf('artifacts/') !== 0) return null;
  return {
    name: safeText(String(item.name || '').replace(/\\/g, '/').split('/').pop(), 200),
    mediaType: safeText(item.mediaType || 'application/octet-stream', 200),
    size: Number.isFinite(item.size) && item.size >= 0 ? item.size : 0,
    sha256: /^[a-f0-9]{64}$/i.test(String(item.sha256 || '')) ? String(item.sha256) : '',
    path: safeText(relative, 500)
  };
}

function safeMessage(value) {
  var text = sanitizeDiagnostic(value, {}, []);
  text = text.replace(/\b[A-Za-z]:[\\/][^\s"'<>]*/g, '[PATH]');
  text = text.replace(/(^|\s)\/(?:[^\s"'<>/]+\/)*[^\s"'<>]*/g, function(_, prefix) {
    return prefix + '[PATH]';
  });
  text = text.replace(/\.\.[\\/][^\s"'<>]*/g, '[PATH]');
  return text.slice(0, 1000);
}

function safeText(value, limit) { return safeMessage(value).slice(0, limit || 200); }
function safeRelative(value) {
  var relative = String(value || '').replace(/\\/g, '/');
  if (!relative || path.posix.isAbsolute(relative) || /^[A-Za-z]:\//.test(relative) || relative.split('/').indexOf('..') !== -1) return '';
  return safeText(relative, 500);
}

function projectRun(run, current) {
  current = current || { freshness: 'unknown', reasons: [] };
  return {
    runId: safeText(run.runId || '', 200),
    createdAt: safeText(run.createdAt || '', 100),
    status: safeText(run.status || '', 50),
    gateDecision: safeText(run.gateDecision || '', 50),
    freshness: String(current.freshness || 'unknown'),
    freshnessReasons: Array.isArray(current.reasons) ? current.reasons.map(String) : [],
    targets: {
      acIds: run.targets && Array.isArray(run.targets.acIds) ? run.targets.acIds.map(function(value) { return safeText(value, 100); }) : [],
      projects: run.targets && Array.isArray(run.targets.projects) ? run.targets.projects.map(function(value) { return safeText(value, 100); }) : []
    },
    diagnostics: (run.diagnostics || []).slice(0, 100).map(function(item) {
      return { code: safeText(item && item.code || 'DIAGNOSTIC', 100), message: safeMessage(item && item.message) };
    }),
    attachments: (run.attachments || []).map(safeAttachment).filter(Boolean)
  };
}

function evaluateProviderEvidence(options) {
  options = options || {};
  var expectedAcs = Array.from(new Set((options.expectedAcs || []).map(String)));
  var expectedProjects = Array.from(new Set((options.expectedProjects || []).map(String)));
  var evaluateFreshness = options.evaluateFreshness || function() { return { freshness: 'unknown', reasons: [] }; };
  var latest = {};
  var staleReasons = [];
  var projected = orderedRuns(options.runs).map(function(run) {
    var current = evaluateFreshness(run);
    var view = projectRun(run, current);
    if (view.freshness !== 'fresh') {
      staleReasons = staleReasons.concat(view.freshnessReasons);
      return view;
    }
    var rawAcs = run.targets && Array.isArray(run.targets.acIds) ? run.targets.acIds.map(String) : [];
    var rawProjects = run.targets && Array.isArray(run.targets.projects) ? run.targets.projects.map(String) : [];
    rawAcs.forEach(function(acId) {
      rawProjects.forEach(function(project) {
        var key = acId + '\0' + project;
        if (!Object.prototype.hasOwnProperty.call(latest, key)) latest[key] = view;
      });
    });
    return view;
  });
  var missingPairs = [];
  var cells = [];
  expectedAcs.forEach(function(acId) {
    expectedProjects.forEach(function(project) {
      var selected = latest[acId + '\0' + project];
      var passing = selected && selected.gateDecision === 'PASS';
      if (!passing) missingPairs.push(acId + '/' + project);
      cells.push({
        acId: acId,
        project: project,
        state: selected ? selected.gateDecision : 'missing',
        gateDecision: selected ? selected.gateDecision : '',
        runId: selected ? selected.runId : ''
      });
    });
  });
  return {
    runs: projected,
    matrix: { acIds: expectedAcs, projects: expectedProjects, cells: cells },
    missingPairs: missingPairs,
    staleReasons: Array.from(new Set(staleReasons)),
    ready: missingPairs.length === 0
  };
}

function projectMatrix(matrix) {
  matrix = matrix || { acIds: [], projects: [], cells: [] };
  var occurrences = {};
  var projectLabels = {};
  var projects = (matrix.projects || []).map(function(project) {
    var base = safeText(project, 100) || '[REDACTED]';
    occurrences[base] = (occurrences[base] || 0) + 1;
    var label = occurrences[base] === 1 ? base : base + ' #' + occurrences[base];
    projectLabels[project] = label;
    return label;
  });
  return {
    acIds: (matrix.acIds || []).map(function(acId) { return safeText(acId, 100); }),
    projects: projects,
    cells: (matrix.cells || []).map(function(cell) {
      return {
        acId: safeText(cell.acId, 100),
        project: projectLabels[cell.project] || safeText(cell.project, 100),
        state: safeText(cell.state, 50),
        gateDecision: safeText(cell.gateDecision, 50),
        runId: safeText(cell.runId, 200)
      };
    })
  };
}

function buildConsoleProjection(specContent, projectDir, specPath, deps) {
  deps = deps || {};
  var readiness = require('./readiness');
  var suppliedAssessment;
  try { suppliedAssessment = deps.assessment; }
  catch (error) { suppliedAssessment = null; }
  var assessment = readiness.isAssessment(suppliedAssessment)
    ? suppliedAssessment
    : readiness.assess(specContent, projectDir, specPath, deps);
  var providers = assessment.providers.map(function(current) {
    var provider = current.provider;
    var runs = current.runs;
    var evaluated = current.evidence;
    var matrix = projectMatrix(evaluated.matrix);
    return {
      id: safeText(current.id, 100),
      adapter: safeText(provider.adapter || '', 100),
      workspaceRoot: provider.workspaceRoot === '.' ? '.' : safeRelative(provider.workspaceRoot),
      packageRoot: provider.packageRoot === '.' ? '.' : safeRelative(provider.packageRoot),
      config: safeRelative(provider.config),
      projects: matrix.projects,
      toolVersion: runs[0] && runs[0].workspace ? safeText(runs[0].workspace.resolvedToolVersion || '', 100) : '',
      readiness: current.state,
      issues: current.issues.map(function(issue) { return safeMessage(issue); }),
      runs: evaluated.runs.slice(0, 20),
      matrix: matrix
    };
  });
  return { schemaVersion: 1, state: assessment.state, providers: providers };
}

module.exports = {
  evaluateProviderEvidence: evaluateProviderEvidence,
  projectRun: projectRun,
  safeMessage: safeMessage,
  buildConsoleProjection: buildConsoleProjection
};
