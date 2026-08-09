'use strict';

var config = require('./config');
var governanceContract = require('../core/governance-contract');
var trustedAssessments = new WeakSet();

function immutableCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
  if (value && typeof value === 'object') {
    var copy = {};
    Object.keys(value).forEach(function(key) { copy[key] = immutableCopy(value[key]); });
    return Object.freeze(copy);
  }
  return value;
}

function completeAssessment(value) {
  var assessment = immutableCopy(value);
  trustedAssessments.add(assessment);
  return assessment;
}

function isAssessment(value) {
  return !!value && typeof value === 'object' && trustedAssessments.has(value);
}

function label(text, name) {
  var match = String(text).match(new RegExp('^' + name + ':\\s*(.+)$', 'mi'));
  return match ? match[1].trim() : '';
}

function acceptanceBlocks(content) {
  var section = String(content || '').split(/^## Acceptance Criteria\s*$/m)[1] || '';
  section = section.split(/^## /m)[0];
  var matches = [];
  var current = null;
  section.split(/\r?\n/).forEach(function(line) {
    if (/^### AC-\d+:/i.test(line)) {
      current = [line];
      matches.push(current);
    } else if (current) current.push(line);
  });
  return matches.map(function(lines) {
    var text = lines.join('\n');
    var id = (text.match(/^### (AC-\d+):/i) || [])[1];
    return { id: id && id.toUpperCase(), verification: label(text, 'Verification'), provider: label(text, 'Provider'),
      contract: text.replace(/\r\n/g, '\n').trim() };
  });
}

function frontmatterValue(content, name) {
  var match = String(content || '').match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return '';
  var value = label(match[1], name);
  return value.replace(/^['"]|['"]$/g, '');
}

function verificationContract(content, providerId) {
  return {
    mode: frontmatterValue(content, 'mode'),
    taskName: frontmatterValue(content, 'task-name'),
    acs: acceptanceBlocks(content).filter(function(ac) {
      return governanceContract.requiresProvider(ac.verification) && ac.provider === providerId;
    }).map(function(ac) { return { id: ac.id, contract: ac.contract }; })
  };
}

function summary(state, requiredProviders, missingProviders, issues) {
  return {
    state: state,
    requiredProviders: requiredProviders,
    missingProviders: missingProviders,
    issues: issues
  };
}

function assess(specContent, projectDir, specPath, deps) {
  deps = deps || {};
  var targets = acceptanceBlocks(specContent).filter(function(ac) { return governanceContract.requiresProvider(ac.verification); });
  var issues = [];
  targets.forEach(function(ac) {
    if (!ac.provider) issues.push('E2E Acceptance Criteria require Provider for: ' + ac.id + '.');
  });
  var required = Array.from(new Set(targets.map(function(ac) { return ac.provider; }).filter(Boolean))).sort();
  if (issues.length) return completeAssessment({
    targets: targets,
    providers: [],
    state: 'required',
    summary: summary('required', required, required, issues)
  });
  if (!required.length) return completeAssessment({
    targets: targets,
    providers: [],
    state: 'ready',
    summary: summary('ready', [], [], [])
  });
  var value;
  try { value = deps.loadConfig ? deps.loadConfig(projectDir) : config.loadVerificationConfig(projectDir); }
  catch (error) {
    return completeAssessment({
      targets: targets,
      providers: [],
      state: 'blocked',
      summary: summary('blocked', required, required, [(error.code || 'CONFIG_SCHEMA_INVALID') + ': ' + error.message])
    });
  }
  var missing = required.filter(function(id) { return !value.providers[id]; });
  if (missing.length) return completeAssessment({
    targets: targets,
    providers: [],
    state: 'required',
    summary: summary('required', required, missing,
      missing.map(function(id) { return 'Verification Provider is not configured: ' + id + '.'; }))
  });
  var runStore = deps.runsForProvider || require('./run-store').runsForProvider;
  var evaluateFreshness = deps.evaluateFreshness || function(run) {
    return require('./fingerprint').evaluateRunFreshness(projectDir, docsDir, run, specPath);
  };
  var evidence = require('./evidence');
  var docsDir = deps.docsDir || require('../../lib/common').getDocsDir(projectDir);
  var providers = required.map(function(id) {
    var provider = value.providers[id];
    var providerIssues = [];
    var runs;
    try { runs = runStore(projectDir, docsDir, id, specPath); }
    catch (error) {
      runs = [];
      providerIssues.push((error.code || 'RUN_INVALID') + ': ' + error.message);
    }
    var expectedAcs = verificationContract(specContent, id).acs.map(function(ac) { return ac.id; });
    var expectedProjects = provider.projects;
    var evaluated = evidence.evaluateProviderEvidence({
      runs: runs,
      expectedAcs: expectedAcs,
      expectedProjects: expectedProjects,
      evaluateFreshness: evaluateFreshness
    });
    if (!evaluated.ready) {
      if (runs.length && evaluated.missingPairs.length) {
        providerIssues.push('Verification coverage incomplete for ' + id + ': ' + evaluated.missingPairs.join(', ') + '.');
      }
      if (evaluated.staleReasons.length) {
        providerIssues.push('Verification Run is stale for ' + id + ': ' + evaluated.staleReasons.join(', ') + '.');
      }
    }
    return {
      id: id,
      provider: provider,
      runs: runs,
      evidence: evaluated,
      issues: providerIssues,
      state: providerIssues.length ? 'blocked' : !runs.length ? 'configured-no-runs' : evaluated.ready ? 'ready' : 'blocked'
    };
  });
  var runIssues = providers.reduce(function(all, provider) { return all.concat(provider.issues); }, []);
  var allReady = providers.every(function(provider) { return provider.state === 'ready'; });
  var firstNotReady = providers.find(function(provider) { return provider.state !== 'ready'; });
  var inspectIssues = firstNotReady ? firstNotReady.issues : [];
  var inspectState = allReady ? 'ready' : inspectIssues.length ? 'blocked' : 'configured';
  return completeAssessment({
    targets: targets,
    providers: providers,
    state: allReady ? 'ready' : runIssues.length ? 'blocked' : 'configured',
    summary: summary(inspectState, required, [], inspectIssues)
  });
}

function inspect(specContent, projectDir, specPath, deps) {
  var current = assess(specContent, projectDir, specPath, deps).summary;
  return {
    state: current.state,
    requiredProviders: current.requiredProviders.slice(),
    missingProviders: current.missingProviders.slice(),
    issues: current.issues.slice()
  };
}

module.exports = { inspect: inspect, acceptanceBlocks: acceptanceBlocks,
  frontmatterValue: frontmatterValue, verificationContract: verificationContract, assess: assess,
  isAssessment: isAssessment };
