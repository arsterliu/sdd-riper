var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var reviewerGuidance = require('../core/reviewer-guidance');
var specState = require('../core/spec-state');
var visualEvidence = require('../visual-evidence/contract');

function frontmatterFieldPresent(content, field) {
  var match = String(content || '').match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return false;
  return new RegExp('^' + field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[^\\r\\n]*$', 'm').test(match[1]);
}

function profileUiImpact(specPath, projectDir) {
  var revisionRef = common.getFrontmatterField(specPath, 'project-profile-revision') || '';
  var digest = common.getFrontmatterField(specPath, 'project-profile-digest') || '';
  var affectedUnits = (common.getFrontmatterField(specPath, 'affected-units') || '').split(',').map(function(value) { return value.trim(); }).filter(Boolean);
  if (!revisionRef || !digest || !affectedUnits.length) return 'unknown';
  try {
    var resolved = require('../profile/store').resolveRevision(projectDir, digest);
    if (resolved.relative !== revisionRef) return 'unknown';
    var allUnits = resolved.revision.profile.units || [];
    var units = affectedUnits.indexOf('project') !== -1 ? allUnits : allUnits.filter(function(unit) {
      return affectedUnits.indexOf(unit.id) !== -1;
    });
    if (!units.length) return 'unknown';
    if (units.some(function(unit) { return (unit.roles || []).indexOf('frontend') !== -1; })) return 'frontend';
    if (units.every(function(unit) { return (unit.roles || []).indexOf('backend') !== -1; })) return 'backend-only';
    return 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

function visualContextStatus(specPath, projectDir) {
  var content = fs.readFileSync(specPath, 'utf-8');
  var uiImpact = common.getFrontmatterField(specPath, 'ui-impact') || '';
  var intent = common.getFrontmatterField(specPath, 'visual-context-intent') || '';
  if (!uiImpact && !intent) {
    if (!frontmatterFieldPresent(content, 'ui-impact') && !frontmatterFieldPresent(content, 'visual-context-intent')) {
      return { uiImpact: 'unknown', intent: 'unknown', selectionRequired: false, selectionInvalid: false, uiImpactConfirmationRequired: false, profileUiImpact: 'legacy' };
    }
    var impact = profileUiImpact(specPath, projectDir);
    if (impact === 'backend-only') {
      return { uiImpact: 'no', intent: 'not-applicable', selectionRequired: false, selectionInvalid: false, uiImpactConfirmationRequired: false, profileUiImpact: impact };
    }
    return { uiImpact: 'pending', intent: 'pending', selectionRequired: impact === 'frontend', selectionInvalid: false, uiImpactConfirmationRequired: true, profileUiImpact: impact };
  }
  if (uiImpact === 'no' && intent === 'not-applicable') {
    var selectedImpact = profileUiImpact(specPath, projectDir);
    if (selectedImpact === 'frontend') {
      return { uiImpact: 'no', intent: 'not-applicable', selectionRequired: false, selectionInvalid: true, uiImpactConfirmationRequired: false, profileUiImpact: selectedImpact };
    }
    return { uiImpact: 'no', intent: 'not-applicable', selectionRequired: false, selectionInvalid: false, uiImpactConfirmationRequired: false, profileUiImpact: selectedImpact === 'unknown' ? 'manual' : selectedImpact };
  }
  if (uiImpact === 'yes' && !intent) return { uiImpact: 'yes', intent: 'pending', selectionRequired: true, selectionInvalid: false, uiImpactConfirmationRequired: false, profileUiImpact: 'manual' };
  if (uiImpact === 'yes' && ['not-required', 'direction', 'fidelity'].indexOf(intent) !== -1) {
    return { uiImpact: 'yes', intent: intent, selectionRequired: false, selectionInvalid: false, uiImpactConfirmationRequired: false, profileUiImpact: 'manual' };
  }
  return { uiImpact: uiImpact || 'unknown', intent: intent || 'unknown', selectionRequired: false, selectionInvalid: true, uiImpactConfirmationRequired: false, profileUiImpact: 'manual' };
}

function visualContextSelectionIssue(status) {
  if (status.selectionRequired) {
    return 'Visual evidence is not ready for Plan: VISUAL_CONTEXT_SELECTION_REQUIRED. Complete one visual context selection with sdd visual select.';
  }
  if (status.selectionInvalid) {
    return 'Visual evidence is not ready for Plan: VISUAL_CONTEXT_SELECTION_INVALID. Use ui-impact no with not-applicable, or ui-impact yes with not-required, direction, or fidelity.';
  }
  return '';
}

function resolveSpec(projectDir, opts) {
  opts = opts || {};
  if (opts.spec) return path.resolve(projectDir, opts.spec);
  var docsRoot = common.getDocsRoot(projectDir);
  var specsDir = path.join(docsRoot, 'specs');
  if (opts.name) {
    var found = common.findSourceSpecByRef(specsDir, opts.name);
    if (found) return found;
  }
  return common.findLatestSpec(specsDir);
}

// Validate AC Coverage against Spec declarations (L1-L2 and advisory L4).
// L1: every AC in Spec has a Coverage record in Execute Log
// L2: all Coverage results are PASS (SKIPPED with approval is OK)
// L3: Test path existence is owned by the central spec-state evaluator
// L4 (limited): Scenario names in Coverage appear in Spec (warning only)
function validateSpec(specPath, opts) {
  opts = opts || {};
  if (!specPath || !fs.existsSync(specPath)) return { ok: false, issues: ['Spec file not found.'], specPath: specPath || '' };
  var projectDir = opts.projectDir || path.dirname(path.dirname(path.dirname(specPath)));
  var snapshot = specState.readSnapshot(projectDir, specPath);
  if (snapshot.location === 'archive') return { ok: false, issues: ['Archived documents are read-only; historical gates are not revalidated.'], specPath: specPath };
  var issues = [];
  var formatIssue = require('../core/workflow-policy').formatIssue(snapshot.content);
  if (!formatIssue) {
    validateProfileReference(projectDir, specPath, issues);
    if (!opts.archiveReady) {
      var visualContext = visualContextStatus(specPath, projectDir);
      var selectionIssue = visualContextSelectionIssue(visualContext);
      if (selectionIssue) issues.push(selectionIssue);
      var visual = visualEvidence.inspect(specPath, projectDir);
      if (visual.planReadiness === 'blocked') visual.diagnostics.forEach(function(diagnostic) {
        issues.push('Visual evidence is not ready for Plan: ' + diagnostic.code + '.');
      });
    }
  }
  var sharedState = specState.evaluate(snapshot, { validationIssues: issues.filter(issue => !/^WARNING:/i.test(issue)) });
  var resultIssues = issues.filter(issue => /^WARNING:/i.test(issue)).concat(sharedState.blockers.map(blocker => blocker.message));
  return { ok: sharedState.completionReady, issues: [...new Set(resultIssues)], specPath: specPath, workflowState: sharedState };
}

function validateProfileReference(projectDir, specPath, issues) {
  var revisionRef = common.getFrontmatterField(specPath, 'project-profile-revision') || '';
  var digest = common.getFrontmatterField(specPath, 'project-profile-digest') || '';
  var unitsText = common.getFrontmatterField(specPath, 'affected-units') || '';
  if (!revisionRef && !digest && !unitsText) return;
  if (!revisionRef || !digest || !unitsText) {
    issues.push('Project Profile reference is incomplete: revision, digest, and affected-units must be declared together.');
    return;
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    issues.push('Project Profile digest is invalid.');
    return;
  }
  try {
    var resolved = require('../profile/store').resolveRevision(projectDir, digest);
    if (resolved.relative !== revisionRef) issues.push('Project Profile revision path does not match its digest.');
    var known = {};
    resolved.revision.profile.units.forEach(function(unit) { known[unit.id] = true; });
    var requested = unitsText.split(',').map(function(value) { return value.trim(); }).filter(Boolean);
    if (!requested.length) issues.push('Project Profile affected-units is empty.');
    requested.forEach(function(unit) {
      if (unit !== 'project' && !known[unit]) issues.push('Project Profile references unknown affected unit: ' + unit + '.');
    });
  } catch (error) {
    issues.push('Project Profile reference is invalid: ' + (error.code || error.message) + '.');
  }
}

function run(projectDir, opts) {
  opts = opts || {};
  var docsRoot = common.getDocsRoot(projectDir);
  if (!fs.existsSync(docsRoot)) {
    console.error('[ERROR] Project not initialized. Run: sdd init <dir>');
    process.exit(1);
  }
  var specPath = resolveSpec(projectDir, opts);
  var result = validateSpec(specPath, { archiveReady: !!opts.archiveReady, projectDir: projectDir });
  console.log('[SDD Validate] ' + projectDir);
  console.log('SPEC: ' + (result.specPath || 'none'));
  if (result.ok) {
    console.log('RESULT: OK');
    if (opts.archiveReady) {
      console.log('COMPLETION_READY: yes');
      console.log('ARCHIVE_AUTHORIZATION: required-at-archive');
    }
    return;
  }
  console.log('RESULT: FAIL');
  result.issues.forEach(function(issue) { console.log('- ' + issue); });
  if (result.workflowState && result.workflowState.nextAction === 'run_challenge') {
    console.log('Run independent Challenge: sdd challenge "' + projectDir + '" --spec "' + result.specPath + '"');
    console.log('Record the reviewer result with --record-result, --summary and --executed-by.');
    reviewerGuidance.guidanceLines().forEach(function(line) { console.log('- ' + line); });
  }
  process.exit(1);
}

module.exports = run;
module.exports.validateSpec = validateSpec;
module.exports.resolveSpec = resolveSpec;
module.exports.visualContextStatus = visualContextStatus;
module.exports.visualContextSelectionIssue = visualContextSelectionIssue;
module.exports.profileUiImpact = profileUiImpact;
