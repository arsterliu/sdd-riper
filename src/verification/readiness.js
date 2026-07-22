'use strict';

var config = require('./config');

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
      return /^e2e$/i.test(ac.verification) && ac.provider === providerId;
    }).map(function(ac) { return { id: ac.id, contract: ac.contract }; })
  };
}

function inspect(specContent, projectDir, specPath) {
  var targets = acceptanceBlocks(specContent).filter(function(ac) { return /^e2e$/i.test(ac.verification); });
  var issues = [];
  targets.forEach(function(ac) {
    if (!ac.provider) issues.push('E2E Acceptance Criteria require Provider for: ' + ac.id + '.');
  });
  var required = Array.from(new Set(targets.map(function(ac) { return ac.provider; }).filter(Boolean))).sort();
  if (issues.length) return { state: 'required', requiredProviders: required, missingProviders: required, issues: issues };
  if (!required.length) return { state: 'ready', requiredProviders: [], missingProviders: [], issues: [] };
  var value;
  try { value = config.loadVerificationConfig(projectDir); }
  catch (error) { return { state: 'blocked', requiredProviders: required, missingProviders: required, issues: [error.code + ': ' + error.message] }; }
  var missing = required.filter(function(id) { return !value.providers[id]; });
  if (missing.length) return {
    state: 'required',
    requiredProviders: required,
    missingProviders: missing,
    issues: missing.map(function(id) { return 'Verification Provider is not configured: ' + id + '.'; })
  };
  var runStore = require('./run-store');
  var fingerprint = require('./fingerprint');
  var evidence = require('./evidence');
  var docsDir = require('../../lib/common').getDocsDir(projectDir);
  var runIssues = [];
  var allReady = required.every(function(id) {
    var runs;
    try { runs = runStore.runsForProvider(projectDir, docsDir, id, specPath); }
    catch (error) { runIssues.push((error.code || 'RUN_INVALID') + ': ' + error.message); return false; }
    if (!runs.length) return false;
    var expectedAcs = verificationContract(specContent, id).acs.map(function(ac) { return ac.id; });
    var expectedProjects = value.providers[id].projects;
    var evaluated = evidence.evaluateProviderEvidence({
      runs: runs,
      expectedAcs: expectedAcs,
      expectedProjects: expectedProjects,
      evaluateFreshness: function(run) {
        return fingerprint.evaluateRunFreshness(projectDir, docsDir, run, specPath);
      }
    });
    if (evaluated.ready) return true;
    runIssues.push('Verification coverage incomplete for ' + id + ': ' + evaluated.missingPairs.join(', ') + '.');
    if (evaluated.staleReasons.length) {
      runIssues.push('Verification Run is stale for ' + id + ': ' + evaluated.staleReasons.join(', ') + '.');
    }
    return false;
  });
  return { state: allReady ? 'ready' : runIssues.length ? 'blocked' : 'configured',
    requiredProviders: required, missingProviders: [], issues: runIssues };
}

module.exports = { inspect: inspect, acceptanceBlocks: acceptanceBlocks,
  frontmatterValue: frontmatterValue, verificationContract: verificationContract };
