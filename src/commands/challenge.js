var workflow = require('../core/workflow');
var common = require('../../lib/common');
var reviewerGuidance = require('../core/reviewer-guidance');
var governanceContract = require('../core/governance-contract');
var fs = require('fs');
var path = require('path');

function isAuditableExecutedBy(value, mode) {
  return governanceContract.isAuditableReviewer(mode, String(value || '').trim());
}

function allowedVerdicts(separator) {
  return governanceContract.verdicts.join(separator);
}

function reviewerTypes() {
  return governanceContract.auditableReviewerTypes.join('|');
}

function reviewerRequirement(mode) {
  var types = 'subagent:<id>, external-agent:<id>, or human:<name>';
  return types + (governanceContract.isAuditableReviewer(mode, 'inline') ? ' (inline is also allowed for ' + mode + ').' : '.');
}

function isWithin(parent, candidate) {
  var relative = path.relative(parent, candidate);
  return !!relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function failTarget(message) {
  console.error('[ERROR] ' + message);
  process.exit(3);
}

function activeSpecCandidates(specsDir) {
  var candidates = [];
  candidates.hasInvalidSpecEntry = false;
  if (!fs.existsSync(specsDir)) return candidates;
  fs.readdirSync(specsDir).forEach(function(file) {
    var parsed = common.parseSpecFileName(file);
    if (!parsed) return;
    var filePath = path.join(specsDir, file);
    try {
      var stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        candidates.hasInvalidSpecEntry = true;
        return;
      }
      if (common.isAuxiliarySpecName(file)) return;
      if (common.getFrontmatterField(filePath, 'status') === 'archived') return;
      candidates.push({
        path: filePath,
        parsed: parsed,
        date: common.getFrontmatterField(filePath, 'date') || '',
        mtime: stat.mtimeMs
      });
    } catch (error) {
      candidates.hasInvalidSpecEntry = true;
    }
  });
  return candidates;
}

function compareSpecVersions(a, b) {
  if (a.parsed.major !== b.parsed.major) return b.parsed.major - a.parsed.major;
  if (a.parsed.minor !== b.parsed.minor) return b.parsed.minor - a.parsed.minor;
  return b.parsed.patch - a.parsed.patch;
}

function findActiveSpecByName(specsDir, name) {
  var ref = common.parseSpecRef(name);
  var candidates = activeSpecCandidates(specsDir);
  if (ref) {
    return candidates.filter(function(candidate) {
      return candidate.parsed.version === ref.version && candidate.parsed.slug === ref.slug;
    }).map(function(candidate) { return candidate.path; })[0] || '';
  }
  var slug = common.normalizeSlug(name);
  return candidates.filter(function(candidate) {
    return candidate.parsed.slug === slug;
  }).sort(compareSpecVersions).map(function(candidate) { return candidate.path; })[0] || '';
}

function findLatestActiveSpec(specsDir) {
  var candidates = activeSpecCandidates(specsDir);
  if (candidates.hasInvalidSpecEntry) return '';
  return candidates.sort(function(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    var versionOrder = compareSpecVersions(a, b);
    return versionOrder || b.mtime - a.mtime;
  }).map(function(candidate) { return candidate.path; })[0] || '';
}

function resolveSpec(projectDir, opts) {
  opts = opts || {};
  if (opts.spec && opts.name) return failTarget('--spec and --name cannot be used together.');

  var root = path.resolve(projectDir);
  var specsDir = path.resolve(common.getDocsRoot(root), 'specs');
  var specPath = opts.spec
    ? path.resolve(root, opts.spec)
    : opts.name
      ? findActiveSpecByName(specsDir, opts.name)
      : findLatestActiveSpec(specsDir);

  if (!specPath || !fs.existsSync(specPath) || !common.parseSpecFileName(path.basename(specPath)) || common.isAuxiliarySpecName(path.basename(specPath))) return failTarget('Selected target is not an active project Spec.');
  if (!isWithin(specsDir, specPath)) return failTarget('Selected target is not an active project Spec.');

  var realRoot;
  var realSpecsDir;
  var realSpecPath;
  var stat;
  try {
    stat = fs.statSync(specPath);
    realRoot = fs.realpathSync(root);
    realSpecsDir = fs.realpathSync(specsDir);
    realSpecPath = fs.realpathSync(specPath);
  } catch (error) {
    return failTarget('Selected target is not an active project Spec.');
  }
  if (!stat.isFile() || !isWithin(realRoot, realSpecsDir) || !isWithin(realSpecsDir, realSpecPath) || common.getFrontmatterField(specPath, 'status') === 'archived') {
    return failTarget('Selected target is not an active project Spec.');
  }
  return specPath;
}

function run(projectDir, opts) {
  opts = opts || {};

  // --record-result mode: write challenge evidence into the spec
  if (opts.recordResult) {
    var verdict = String(opts.recordResult || '').toUpperCase();
    if (!governanceContract.isKnownVerdict(verdict)) {
      console.error('[ERROR] Invalid verdict: ' + verdict + '. Allowed: ' + allowedVerdicts(', '));
      process.exit(1);
    }
    var specPath = resolveSpec(projectDir, opts);
    if (!specPath || !fs.existsSync(specPath)) {
      console.error('[ERROR] No active spec found.');
      process.exit(1);
    }
    if (!opts.executedBy) {
      console.error('[ERROR] --executed-by is required with --record-result (use ' + reviewerTypes() + ').');
      process.exit(3);
    }
    var content = fs.readFileSync(specPath, 'utf-8');
    var mode = common.getFrontmatterField(specPath, 'mode') || 'standard';
    var summary = String(opts.summary || '').trim();
    if (!summary) {
      console.error('[ERROR] --summary is required with --record-result and must contain evidence-backed text.');
      process.exit(3);
    }
    var executedBy = opts.executedBy;
    if (!isAuditableExecutedBy(executedBy, mode)) {
      console.error('[ERROR] --executed-by must be ' + reviewerRequirement(mode));
      process.exit(3);
    }
    var now = new Date().toISOString();
    var backtrack = governanceContract.backtrackTarget(verdict) || 'Research';
    // Function-form replacement only: a string replacement argument would
    // interpret $'/$&/$` sequences inside summary/executedBy as replacement
    // patterns and silently corrupt the spec.
    var challengeLabels = [
      ['Challenge Verdict', verdict],
      ['Backtrack Target', backtrack],
      ['Challenge Summary', summary],
      ['Challenge Executed By', executedBy],
      ['Challenge Executed At', now],
      ['Challenge Evidence', verdict + ' - ' + summary]
    ];
    var missingLabels = challengeLabels.filter(function(pair) {
      return !new RegExp('^' + pair[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':', 'm').test(content);
    }).map(function(pair) { return pair[0]; });
    if (missingLabels.length) {
      console.error('[ERROR] Spec template is missing Challenge label line(s): ' + missingLabels.join(', ') + '. Result not recorded.');
      process.exit(1);
    }
    challengeLabels.forEach(function(pair) {
      var escaped = pair[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      content = content.replace(new RegExp('^' + escaped + ':.*$', 'm'), function() {
        return pair[0] + ': ' + pair[1];
      });
    });
    fs.writeFileSync(specPath, content, 'utf-8');
    console.log('[SDD Challenge] Result recorded in spec: ' + path.basename(specPath));
    console.log('  Verdict: ' + verdict);
    console.log('  Backtrack: ' + backtrack);
    console.log('  Executed By: ' + executedBy);
    console.log('  Executed At: ' + now);
    return;
  }

  var specPath = resolveSpec(projectDir, opts);
  var state = workflow.analyzeSpec(projectDir, specPath, opts);
  console.log('## ADVERSARIAL REVIEW PROMPT');
  console.log('');
  console.log('Role: independent challenge agent. Do not modify code or artifacts.');
  console.log('Output labels must stay in English; evidence and explanation may be written in Chinese.');
  console.log('');
  console.log('SPEC: ' + (state.specPath || 'none'));
  if (state.specPath && fs.existsSync(state.specPath)) {
    var specContent = fs.readFileSync(state.specPath, 'utf-8');
    var execLogRef = common.getFrontmatterField(state.specPath, 'execute-log-file');
    var designRef = common.getFrontmatterField(state.specPath, 'design-file');
    if (execLogRef) console.log('EXECUTE_LOG: ' + execLogRef);
    if (designRef) console.log('DESIGN: ' + designRef);
    // Extract changed file paths from Execute Log for Code Challenge
    if (execLogRef) {
      var execLogPath = common.resolveProjectPath(projectDir, execLogRef);
      if (execLogPath && fs.existsSync(execLogPath)) {
        var execLogContent = fs.readFileSync(execLogPath, 'utf-8');
        var fileMatches = execLogContent.match(/^Files:\s*(.+)$/gm);
        if (fileMatches && fileMatches.length) {
          var codeFiles = [];
          fileMatches.forEach(function(m) {
            m.replace(/^Files:\s*/, '').split(/,\s*/).forEach(function(f) {
              f = f.trim();
              if (f && codeFiles.indexOf(f) === -1) codeFiles.push(f);
            });
          });
          if (codeFiles.length) console.log('CODE_FILES: ' + codeFiles.join(', '));
        }
      }
    }
    var diffBase = common.getFrontmatterField(state.specPath, 'diff-base');
    if (diffBase) console.log('DIFF_BASE: ' + diffBase);
  }
  console.log('AUTONOMY_MODE: ' + (state.autonomyMode || 'unresolved'));
  console.log('AUTONOMY_MODE_SOURCE: ' + (state.autonomyModeSource || 'unresolved'));
  console.log('AUTHORIZATION_STATE: ' + (state.authorizationState || 'unresolved'));
  console.log('AUTHORIZED_ACTORS: ' + (state.authorizedActors && state.authorizedActors.length ? state.authorizedActors.join(',') : 'none'));
  console.log('AUTHORIZED_SCOPE_DIGEST: ' + (state.authorizedScopeDigest || state.scopeDigest || 'none'));
  console.log('AUTHORIZED_RISK_SNAPSHOT: ' + (state.authorizedRiskSnapshot || state.riskSnapshot || 'none'));
  console.log('ACTIVE_PLAN_DIGEST: ' + (state.activePlanDigest || state.planDigest || 'none'));
  console.log('STOP_REASON: ' + (state.stopReason || 'none'));
  console.log('NEXT_ACTION: ' + state.nextAction);
  console.log('CURRENT_VERDICT_HINT: ' + state.challengeVerdict);
  console.log('BACKTRACK_TARGET_HINT: ' + state.backtrackTarget);
  console.log('ALLOWED_VERDICTS: ' + allowedVerdicts(' | '));
  console.log('');
  console.log('### Reviewer Evidence');
  reviewerGuidance.guidanceLines().forEach(function(line) {
    console.log('- ' + line);
  });
  console.log('');
  console.log('### Research Challenge');
  console.log('- Challenge whether the confirmed requirement matches the original goal and whether hidden assumptions remain.');
  console.log('- Challenge whether all five structured elements (Scope Boundary, Irreversibility, Impact Radius, Dependencies & Constraints, Acceptance Intent) are accurately captured.');
  console.log('- Challenge whether Research Reviewed By and Research Reviewed At are properly recorded.');
  console.log('');
  console.log('### Design Challenge');
  console.log('- Challenge architecture, data model, interface contract, impact scope, compatibility, rollback, and failure modes.');
  console.log('- Methodology the task should be using (advisory router; challenge under-use of these):');
  workflow.formatDesignMethodLines(state.designMethod).forEach(function(line) {
    console.log('  ' + line);
  });
  console.log('');
  console.log('### Acceptance Challenge');
  console.log('- Challenge whether AC-### items are observable, verifiable, and traceable to requirements.');
  console.log('');
  console.log('### Plan Challenge');
  console.log('- Challenge whether Plan steps are executable, bounded, and derived from Design and Acceptance.');
  console.log('');
  console.log('### Code Challenge');
  console.log('- Challenge code quality: duplication, dead code, unclear naming, pattern violations.');
  console.log('- Challenge security: hardcoded secrets, injection risks, missing input validation.');
  console.log('- Challenge correctness: does the code actually implement what the Spec/Design/Plan prescribe?');
  console.log('- Challenge test quality: do tests verify behavior or just mock it? Are edge cases covered?');
  console.log('- Verdict guidance: if the code faithfully implements a flawed Design, the correct verdict is FAIL_DESIGN (not FAIL_CODE). FAIL_CODE applies when the code itself has defects; FAIL_DESIGN applies when the code is correct but the upstream artifact is wrong.');
  console.log('');
  console.log('### Execute Challenge');
  console.log('- Challenge whether implementation evidence stayed inside Plan and whether tests prove the ACs.');
  console.log('');
  console.log('### Archive Challenge');
  console.log('- Challenge whether archive would hide drift, failed verification, missing Learning, or a failed challenge verdict.');
  console.log('');
  console.log('### Required Output');
  console.log('Challenge Verdict: <' + allowedVerdicts('|') + '>');
  console.log('Backtrack Target: <Research|Design|Acceptance|Plan|Execute / Debug|Execute Log|Learning Check|Ready>');
  console.log('Challenge Summary: <evidence-backed summary>');
  console.log('');
  console.log('After the challenge agent returns, record the result with:');
  console.log('  sdd challenge <project-dir> --spec ' + common.relativeToProject(projectDir, specPath) + ' --record-result "VERDICT" --summary "summary text" --executed-by "subagent:<id>|external-agent:<id>|human:<name>|inline"');
  console.log('');
  console.log('Reviewer authorization reminder: ' + reviewerGuidance.inlineGuidance());
}

module.exports = run;
