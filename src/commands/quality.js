'use strict';

var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var input = require('../quality/input');
var planner = require('../quality/planner');
var readiness = require('../verification/readiness');

function QualityError(code, message, exitCode) {
  Error.call(this, message);
  this.name = 'QualityError';
  this.message = message;
  this.code = code;
  this.exitCode = exitCode || 2;
  if (Error.captureStackTrace) Error.captureStackTrace(this, QualityError);
}
QualityError.prototype = Object.create(Error.prototype);
QualityError.prototype.constructor = QualityError;

function ensureInitialized(projectDir) {
  var root = fs.realpathSync(path.resolve(projectDir));
  if (!fs.existsSync(path.join(root, '.sdd-config')) || !fs.existsSync(common.getDocsRoot(root))) {
    throw new QualityError('NOT_INITIALIZED', 'project is not initialized; run sdd init first');
  }
  return root;
}

function isContained(root, target) {
  var relative = path.relative(root, target);
  return relative === '' || (!!relative && relative !== '..' &&
    !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function resolveSpecRoots(root) {
  var projectRoot = fs.realpathSync(root);
  var docsRoot = path.resolve(common.getDocsRoot(root));
  if (!isContained(projectRoot, docsRoot)) {
    throw new QualityError('SPEC_PATH_ESCAPE', 'docs root must be inside the project');
  }
  var docsReal = fs.realpathSync(docsRoot);
  if (!isContained(projectRoot, docsReal)) {
    throw new QualityError('SPEC_PATH_ESCAPE', 'docs root must resolve inside the project');
  }
  var specsRoot = path.resolve(docsRoot, 'specs');
  if (!isContained(docsRoot, specsRoot)) {
    throw new QualityError('SPEC_PATH_ESCAPE', 'specs directory must be inside the docs root');
  }
  if (!fs.existsSync(specsRoot)) {
    throw new QualityError('SPEC_NOT_FOUND', 'no selected Spec exists');
  }
  var specsReal = fs.realpathSync(specsRoot);
  if (!isContained(docsReal, specsReal)) {
    throw new QualityError('SPEC_PATH_ESCAPE', 'specs directory must resolve inside the docs root');
  }
  return {
    projectRoot: projectRoot,
    docsRoot: docsRoot,
    docsReal: docsReal,
    specsRoot: specsRoot,
    specsReal: specsReal
  };
}

function resolveSelectedSpec(specRoots, selectedSpec) {
  var candidate = path.resolve(selectedSpec);
  if (candidate === specRoots.specsRoot || !isContained(specRoots.specsRoot, candidate)) {
    throw new QualityError('SPEC_PATH_ESCAPE', 'selected Spec must be inside <docs-root>/specs');
  }
  if (!fs.existsSync(candidate)) return candidate;
  var resolved = fs.realpathSync(candidate);
  if (resolved === specRoots.specsReal || !isContained(specRoots.specsReal, resolved)) {
    throw new QualityError('SPEC_PATH_ESCAPE', 'selected Spec real path must be inside <docs-root>/specs');
  }
  return candidate;
}

function findLatestQualitySpec(specRoots) {
  var files = fs.readdirSync(specRoots.specsRoot).filter(function(file) {
    return file.endsWith('.md') && file !== '.gitkeep';
  });
  var candidates = [];
  files.forEach(function(file) {
    var parsed = common.parseSpecFileName(file);
    if (!parsed) return;
    var selected = resolveSelectedSpec(specRoots, path.join(specRoots.specsRoot, file));
    if (!fs.existsSync(selected)) return;
    var mtime = 0;
    try { mtime = fs.statSync(selected).mtimeMs; } catch (error) {}
    candidates.push({
      path: selected,
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch,
      status: common.getFrontmatterField(selected, 'status') || '',
      date: common.getFrontmatterField(selected, 'date') || '',
      mtime: mtime
    });
  });
  if (!candidates.length) return '';
  var active = candidates.filter(function(candidate) { return candidate.status !== 'archived'; });
  var pool = active.length ? active : candidates;
  if (pool.length === 1) return pool[0].path;
  pool.sort(function(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.major !== b.major) return b.major - a.major;
    if (a.minor !== b.minor) return b.minor - a.minor;
    if (a.patch !== b.patch) return b.patch - a.patch;
    return b.mtime - a.mtime;
  });
  return pool[0].path;
}

function resolveQualitySpec(root, options) {
  var specRoots = resolveSpecRoots(root);
  var selectedSpec = '';
  if (options.spec) {
    selectedSpec = path.resolve(root, options.spec);
  } else if (options.name) {
    selectedSpec = common.findSourceSpecByRef(specRoots.specsRoot, options.name);
  } else {
    selectedSpec = findLatestQualitySpec(specRoots);
  }
  if (!selectedSpec) return '';
  return resolveSelectedSpec(specRoots, selectedSpec);
}

function errorProjection(code, message) {
  return {
    schemaVersion: 1,
    policyVersion: '1',
    source: {
      specPath: '',
      taskName: '',
      profile: null,
      declaredAffectedUnits: [],
      effectiveAffectedUnits: []
    },
    acFacts: [],
    policyFocus: [],
    acMappings: [],
    e2eReadiness: null,
    diagnostics: [{ code: code, severity: 'blocking', message: message }],
    blocking: true
  };
}

function formatText(value) {
  var lines = [
    'QUALITY_PLAN_SCHEMA: ' + value.schemaVersion,
    'POLICY_VERSION: ' + value.policyVersion,
    'SPEC: ' + value.source.specPath,
    'TASK: ' + (value.source.taskName || 'none'),
    'PROFILE_REVISION: ' + (value.source.profile ? value.source.profile.revision : 'none'),
    'PROFILE_DIGEST: ' + (value.source.profile ? value.source.profile.digest : 'none'),
    'DECLARED_UNITS: ' + (value.source.declaredAffectedUnits.length ? value.source.declaredAffectedUnits.join(',') : 'none'),
    'EFFECTIVE_UNITS: ' + (value.source.effectiveAffectedUnits.length ? value.source.effectiveAffectedUnits.join(',') : 'none'),
    'AC_FACTS:',
    'POLICY_FOCUS:'
  ];
  (value.acFacts.length ? value.acFacts : []).forEach(function(ac) {
    var line = '- ' + ac.acId + ': ' + ac.verification;
    if (ac.provider) line += ' (Provider: ' + ac.provider + ')';
    if (ac.manualEvidence) line += ' (Manual Evidence: ' + ac.manualEvidence + ')';
    lines.splice(lines.length - 1, 0, line);
  });
  if (!value.acFacts.length) lines.splice(lines.length - 1, 0, '- none');
  (value.policyFocus.length ? value.policyFocus : []).forEach(function(item) {
    lines.push('- ' + item.id + ': ' + item.recommendedCapabilities.join(','));
    lines.push('  REASONS:');
    (item.reasons || []).forEach(function(reason) {
      lines.push('  - ' + JSON.stringify(reason));
    });
    if (!(item.reasons || []).length) lines.push('  - none');
  });
  if (!value.policyFocus.length) lines.push('- none');
  lines.push('AC_MAPPINGS:');
  (value.acMappings.length ? value.acMappings : []).forEach(function(item) {
    lines.push('- ' + item.acId + ': ' + item.verification + ' -> ' + item.verificationCapability);
  });
  if (!value.acMappings.length) lines.push('- none');
  if (value.e2eReadiness) {
    lines.push('E2E_READINESS: ' + value.e2eReadiness.state);
    lines.push('E2E_REQUIRED_PROVIDERS: ' + value.e2eReadiness.requiredProviders.join(','));
    lines.push('E2E_MISSING_PROVIDERS: ' + value.e2eReadiness.missingProviders.join(','));
    lines.push('E2E_ISSUES:');
    (value.e2eReadiness.issues || []).forEach(function(issue) {
      lines.push('- ' + issue);
    });
    if (!(value.e2eReadiness.issues || []).length) lines.push('- none');
  }
  lines.push('DIAGNOSTICS:');
  (value.diagnostics.length ? value.diagnostics : []).forEach(function(item) {
    lines.push('- [' + item.severity + '] ' + item.code + ': ' + item.message);
    if (item.recovery) lines.push('  RECOVERY: ' + item.recovery);
  });
  if (!value.diagnostics.length) lines.push('- none');
  return lines.join('\n') + '\n';
}

function emit(value, format) {
  if (format === 'json') {
    process.stdout.write(JSON.stringify(value, null, 2) + '\n');
    return;
  }
  process.stdout.write(formatText(value));
}

function usage(message) {
  console.error('[SDD_QUALITY_USAGE] ' + message);
  process.exitCode = 3;
}

function attachReadiness(loaded, projectDir, reader) {
  if (loaded.blocking) return;
  var e2e = loaded.acFacts.filter(function(ac) { return ac.verification === 'e2e'; });
  if (!e2e.length) return;
  var unbound = e2e.filter(function(ac) { return !ac.provider; });
  if (unbound.length) {
    loaded.diagnostics.push({
      code: 'e2e-provider-unbound',
      severity: 'attention',
      message: 'E2E Acceptance Criteria require Provider for: ' + unbound.map(function(ac) {
        return ac.acId;
      }).join(', ') + '.'
    });
    return;
  }
  loaded.e2eReadiness = reader(loaded.specContent, projectDir, loaded.specPath);
}

function recordReadinessUnavailable(loaded, error) {
  loaded.blocking = true;
  loaded.e2eReadiness = null;
  loaded.diagnostics.push({
    code: 'readiness-unavailable',
    severity: 'blocking',
    message: 'existing e2e readiness cannot be inspected: ' + (error.code || error.message) + '.',
    details: { cause: error.code || error.message }
  });
}

function plan(projectDir, options, dependencies) {
  options = options || {};
  dependencies = dependencies || {};
  var format = options.format || 'text';
  if (format !== 'text' && format !== 'json') {
    return usage('--format must be text or json');
  }
  if (options.spec && options.name) {
    return usage('--spec and --name cannot be used together');
  }
  try {
    var root = ensureInitialized(projectDir);
    var selectedSpec = resolveQualitySpec(root, options);
    if (!selectedSpec) {
      throw new QualityError('SPEC_NOT_FOUND', 'no selected Spec exists');
    }
    if (!fs.existsSync(selectedSpec)) {
      throw new QualityError('SPEC_NOT_FOUND', 'no selected Spec exists');
    }
    var loaded = input.loadQualityInput(root, selectedSpec);
    try {
      attachReadiness(loaded, root, dependencies.readinessReader || readiness.inspect);
    } catch (error) {
      recordReadinessUnavailable(loaded, error);
    }
    var value = planner.buildQualityPlan(loaded);
    emit(value, format);
    if (value.blocking) process.exitCode = 2;
  } catch (error) {
    if (error instanceof QualityError && error.exitCode === 3) throw error;
    var code = error.code || 'INPUT_INVALID';
    emit(errorProjection(String(code).toLowerCase().replace(/^sdd_quality_/, ''), error.message), format);
    process.exitCode = error.exitCode || 2;
  }
}

module.exports = {
  plan: plan,
  _private: {
    QualityError: QualityError,
    ensureInitialized: ensureInitialized,
    resolveSpecRoots: resolveSpecRoots,
    resolveSelectedSpec: resolveSelectedSpec,
    findLatestQualitySpec: findLatestQualitySpec,
    resolveQualitySpec: resolveQualitySpec,
    errorProjection: errorProjection,
    formatText: formatText,
    attachReadiness: attachReadiness,
    recordReadinessUnavailable: recordReadinessUnavailable,
    usage: usage
  }
};
