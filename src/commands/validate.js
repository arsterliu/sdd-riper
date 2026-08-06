var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var reviewerGuidance = require('../core/reviewer-guidance');
var specState = require('../core/spec-state');
var visualEvidence = require('../visual-evidence/contract');

var SECTION = {
  confirmedRequirement: 'Confirmed Requirement',
  innovateOptions: 'Innovate Options',
  technicalDesign: 'Technical Design',
  designNote: 'Design Note',
  acceptanceCriteria: 'Acceptance Criteria',
  plan: 'Plan',
  executeLog: 'Execute Log',
  review: 'Review (Verdict|Summary)'
};

var STANDARD_DESIGN_REQUIRED = [
  'Selected Option / ADR',
  'Requirement Traceability',
  'Impact Scope',
  'Architecture View',
  'Data Model / Schema',
  'Interface Contract',
  'Compatibility / Rollback',
  'Test Strategy'
];

var LITE_DESIGN_REQUIRED = [
  'Approach',
  'Impact Scope',
  'Interface / Data Impact',
  'Compatibility',
  'Risks',
  'Test Strategy'
];

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

var MICRO_PLAN_REQUIRED = [
  'Impact Scope',
  'Data Impact',
  'Interface Impact',
  'Acceptance',
  'Verification'
];

var CONFIRMED_REQ_REQUIRED = [
  'Scope Boundary',
  'Irreversibility',
  'Impact Radius',
  'Dependencies & Constraints',
  'Acceptance Intent'
];

function firstRealLine(section) {
  var visible = section.replace(/<!--[\s\S]*?-->/g, '');
  return visible.split(/\r?\n/).map(function(line) { return line.trim(); }).find(function(line) {
    return line &&
      !line.startsWith('|') &&
      !/^#+\s/.test(line) &&
      !/^[A-Za-z][A-Za-z0-9 /&_-]*:\s*$/.test(line) &&
      !/^[-:]+$/.test(line);
  }) || '';
}

function sectionContent(specPath, pattern) {
  return common.extractSection(specPath, pattern, 400);
}

function artifactSection(projectDir, specPath, field, pattern, issues, label, required) {
  var ref = common.getFrontmatterField(specPath, field);
  if (!ref) {
    if (required) issues.push('Missing ' + field + ' frontmatter.');
    return { ref: '', path: '', content: '' };
  }
  var artifactPath = common.resolveProjectPath(projectDir, ref);
  if (!fs.existsSync(artifactPath)) {
    issues.push(label + ' file not found: ' + ref);
    return { ref: ref, path: artifactPath, content: '' };
  }
  return { ref: ref, path: artifactPath, content: common.extractSection(artifactPath, pattern, 500) };
}

function sectionHasContent(specPath, pattern) {
  return !!firstRealLine(sectionContent(specPath, pattern));
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelHasContent(section, label) {
  var lines = section.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  var labelRegex = new RegExp('^' + escapeRegExp(label) + ':[ \\t]*(.*)$', 'i');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var m = line.match(labelRegex);
    if (!m) continue;
    if (m[1] && m[1].trim()) return true;
    for (var j = i + 1; j < lines.length; j++) {
      var next = lines[j].trim();
      if (!next || next.startsWith('<!--') || next.startsWith('|') || /^#+\s/.test(next)) continue;
      if (/^[A-Za-z][A-Za-z0-9 /&_-]*:[ \t]*/.test(next)) break;
      return true;
    }
    continue;
  }
  return false;
}

function missingLabels(section, labels) {
  return labels.filter(function(label) { return !labelHasContent(section, label); });
}

var labelValue = require('../core/artifact-snapshot').labelValue;

function isAgentApproval(value) {
  return /^agent:[^:\s]+$/i.test(value || '');
}

function isHumanApproval(value) {
  return /^human:[^:\s]+$/i.test(value || '');
}

function isPlanApproval(value) {
  return isAgentApproval(value) || isHumanApproval(value);
}

function isAuditableReviewer(value, mode) {
  var reviewer = String(value || '').trim();
  if (!reviewer) return false;
  if (mode === 'micro' && /^inline$/i.test(reviewer)) return true;
  if (/^subagent:[^:\s]+$/i.test(reviewer)) return true;
  if (/^external-agent:[^:\s]+$/i.test(reviewer)) return true;
  if (/^human:[^:\s]+$/i.test(reviewer)) return true;
  return false;
}

function independentReviewerMessage(label) {
  return label + ' requires independent reviewer evidence (use subagent:<id>, external-agent:<id>, or human:<name>). ' + reviewerGuidance.inlineGuidance();
}

function acceptanceBlocks(section) {
  var lines = section.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  var blocks = [];
  var current = null;
  var acHeader = /^(?:#{2,6}\s+|[-*]\s*)?(AC-\d+)\b/i;
  lines.forEach(function(rawLine) {
    var line = rawLine.trim();
    var m = line.match(acHeader);
    if (m) {
      current = { id: m[1].toUpperCase(), lines: [rawLine] };
      blocks.push(current);
      return;
    }
    if (current) current.lines.push(rawLine);
  });
  return blocks;
}

function validateAcceptanceCriteria(section, modeLabel, issues) {
  if (!firstRealLine(section)) {
    issues.push('Acceptance Criteria is empty.');
    return;
  }
  var blocks = acceptanceBlocks(section);
  if (!blocks.length) {
    issues.push(modeLabel + ' Acceptance Criteria should include at least one AC-### item.');
    return;
  }
  blocks.forEach(function(block) {
    var text = block.lines.join('\n');
    if (!labelHasContent(text, 'Verification')) {
      issues.push(modeLabel + ' Acceptance Criteria missing Verification for: ' + block.id + '.');
      return;
    }
    var verification = labelValue(text, 'Verification');
    var automated = labelValue(text, 'Automated');
    if (/^yes$/i.test(automated) && !labelHasContent(text, 'Test')) {
      issues.push(modeLabel + ' Automated Acceptance Criteria require Test for: ' + block.id + '.');
    }
    if (/\be2e\b/i.test(verification) && !labelHasContent(text, 'Test') && !labelHasContent(text, 'Manual Evidence')) {
      issues.push(modeLabel + ' E2E Acceptance Criteria require Test or Manual Evidence for: ' + block.id + '.');
    }
    if (/\bmanual\b/i.test(verification) && !labelHasContent(text, 'Manual Evidence')) {
      issues.push(modeLabel + ' Manual Acceptance Criteria require Manual Evidence for: ' + block.id + '.');
    }
  });
}

function validatePlanGate(content, approvalPolicy, archiveReady, issues) {
  var approvedBy = labelValue(content, 'Plan Approved By');
  var approvedAt = labelValue(content, 'Approved At');
  var gateEvidence = labelValue(content, 'Gate Evidence');
  if (!approvedBy) {
    issues.push('Plan Approved By is empty.');
    return;
  }
  if (!approvedAt) {
    issues.push('Approved At is empty.');
  }
  if (!isPlanApproval(approvedBy)) {
    issues.push('Plan Approved By must be agent:<id> or human:<name>.');
    return;
  }
  if (approvalPolicy === 'human' && !isHumanApproval(approvedBy)) {
    issues.push('Human approval policy requires Plan Approved By: human:<name>.');
  }
  if (isAgentApproval(approvedBy) && !gateEvidence) {
    issues.push('Gate Evidence is required for agent approval.');
  }
}

function extractSubsectionContent(filePath, parentPattern, subPattern) {
  // Extract content of a ### subsection within a ## section
  var parentSection = common.extractSection(filePath, parentPattern, 800);
  if (!parentSection) return '';
  var lines = parentSection.split(/\r?\n/);
  var found = false;
  var result = [];
  var subRegex = new RegExp('^###\\s+' + subPattern);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^###/.test(line)) {
      if (found) break;
      if (subRegex.test(line)) { found = true; }
      continue;
    }
    if (found) {
      result.push(line);
    }
  }
  return result.join('\n');
}

function validateConfirmedRequirement(specPath, mode, archiveReady, issues) {
  if (mode === 'micro') return; // micro skips Research entirely
  var crSection;
  if (mode === 'standard') {
    // In standard, Confirmed Requirement is a ### subsection under ## Research
    crSection = extractSubsectionContent(specPath, 'Research', SECTION.confirmedRequirement);
  } else {
    // In lite, Confirmed Requirement is a ## section
    crSection = common.extractSection(specPath, SECTION.confirmedRequirement, 400);
  }
  if (!firstRealLine(crSection)) {
    issues.push('Confirmed Requirement is empty.');
    return;
  }
  var missing = missingLabels(crSection, CONFIRMED_REQ_REQUIRED);
  if (missing.length) {
    if (archiveReady) {
      issues.push('Confirmed Requirement missing required fields: ' + missing.join(', ') + '.');
    } else {
      issues.push('WARNING: Confirmed Requirement missing recommended fields: ' + missing.join(', ') + '.');
    }
  }
}

function validateResearchGate(content, mode, archiveReady, issues) {
  if (mode === 'micro') return; // micro skips Research entirely
  var reviewedBy = labelValue(content, 'Research Reviewed By');
  var reviewedAt = labelValue(content, 'Research Reviewed At');
  if (!reviewedBy) {
    issues.push('Research Reviewed By is empty. ' + reviewerGuidance.inlineGuidance());
    return;
  }
  if (!reviewedAt) {
    issues.push('Research Reviewed At is empty.');
  }
  if (!isAuditableReviewer(reviewedBy, mode)) {
    issues.push(independentReviewerMessage('Research Gate'));
  }
}

function validateChallengeVerdict(content, issues) {
  var facts = specState.challengeFacts(content);
  var verdict = facts.verdict;
  if (verdict && !facts.allowed) {
    issues.push('Challenge Verdict is invalid; allowed values: ' + specState.VERDICTS.join(', ') + '.');
    return;
  }
  if (/^FAIL_/i.test(verdict)) {
    issues.push('Adversarial Challenge failed: ' + verdict.toUpperCase() + '.');
  }
}

function validateModeArtifacts(projectDir, specPath, mode, archiveReady, issues) {
  if (mode === 'standard') {
    validateConfirmedRequirement(specPath, mode, archiveReady, issues);
    var innovate = sectionContent(specPath, SECTION.innovateOptions);
    if (!firstRealLine(innovate)) {
      issues.push('Innovate Options is empty.');
    } else if (/Innovate:\s*Skipped/i.test(innovate)) {
      issues.push('Standard mode cannot skip Innovate Options.');
    }
    var standardDesignArtifact = artifactSection(projectDir, specPath, 'design-file', SECTION.technicalDesign, issues, 'Design', true);
    var standardDesign = standardDesignArtifact.content;
    if (!firstRealLine(standardDesign)) {
      issues.push('Technical Design is empty.');
    } else {
      var missingStandardDesign = missingLabels(standardDesign, STANDARD_DESIGN_REQUIRED);
      if (missingStandardDesign.length) {
        issues.push('Technical Design missing required fields: ' + missingStandardDesign.join(', ') + '.');
      }
    }
    var standardAc = sectionContent(specPath, SECTION.acceptanceCriteria);
    validateAcceptanceCriteria(standardAc, 'Standard', issues);
    return;
  }

  if (mode === 'lite') {
    validateConfirmedRequirement(specPath, mode, archiveReady, issues);
    var liteInnovate = sectionContent(specPath, SECTION.innovateOptions);
    if (!firstRealLine(liteInnovate)) {
      issues.push('Innovate Options must contain options or an explicit skip reason.');
    } else if (/Innovate:\s*Skipped/i.test(liteInnovate) && !/Reason:\s*\S/i.test(liteInnovate)) {
      issues.push('Skipped Innovate Options must include Reason.');
    }
    var liteDesignArtifact = artifactSection(projectDir, specPath, 'design-file', SECTION.designNote, issues, 'Design', true);
    var liteDesign = liteDesignArtifact.content;
    if (!firstRealLine(liteDesign)) {
      issues.push('Design Note is empty.');
    } else {
      var missingLiteDesign = missingLabels(liteDesign, LITE_DESIGN_REQUIRED);
      if (missingLiteDesign.length) {
        issues.push('Design Note missing required fields: ' + missingLiteDesign.join(', ') + '.');
      }
    }
    validateAcceptanceCriteria(sectionContent(specPath, SECTION.acceptanceCriteria), 'Lite', issues);
    return;
  }

  if (mode === 'micro') {
    var plan = sectionContent(specPath, SECTION.plan);
    MICRO_PLAN_REQUIRED.forEach(function(label) {
      if (!labelHasContent(plan, label)) {
        issues.push('Micro Plan must include ' + label + '.');
      }
    });
  }
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

// Parse AC Coverage records from Execute Log content.
// Returns an array of { id, result, scenarios, test, method, reason, approvedBy, approvedAt }
function parseAcCoverage(executeLogContent) {
  return specState.acCoverageRecords(executeLogContent);
}

// Parse AC IDs from Spec Acceptance Criteria section.
// Returns an array of { id, verification, test, scenarios }
function parseAcDeclarations(acceptanceSection) {
  var declarations = [];
  var blocks = acceptanceBlocks(acceptanceSection);
  blocks.forEach(function(block) {
    var text = block.lines.join('\n');
    var verification = labelValue(text, 'Verification');
    var test = labelValue(text, 'Test');
    // Extract scenario names from Given/When/Then blocks (multiple scenarios per AC)
    var scenarios = [];
    var scenarioRegex = /^Scenario:\s*(.+)$/gim;
    var sm;
    while ((sm = scenarioRegex.exec(text)) !== null) {
      scenarios.push(sm[1].trim());
    }
    declarations.push({
      id: block.id,
      verification: verification,
      test: test,
      scenarios: scenarios
    });
  });
  return declarations;
}

// Validate AC Coverage against Spec declarations (L1-L2 and advisory L4).
// L1: every AC in Spec has a Coverage record in Execute Log
// L2: all Coverage results are PASS (SKIPPED with approval is OK)
// L3: Test path existence is owned by the central spec-state evaluator
// L4 (limited): Scenario names in Coverage appear in Spec (warning only)
function validateAcCoverage(specPath, projectDir, executeLogContent, archiveReady, issues) {
  if (!archiveReady) return;
  var acceptanceSection = sectionContent(specPath, SECTION.acceptanceCriteria);
  if (!firstRealLine(acceptanceSection)) return; // no AC, skip
  var declarations = parseAcDeclarations(acceptanceSection);
  if (!declarations.length) return;
  var coverageRecords = parseAcCoverage(executeLogContent);
  if (!coverageRecords.length) {
    declarations.forEach(function(decl) {
      issues.push('AC Coverage: ' + decl.id + ' has no execution evidence in Execute Log.');
    });
    return;
  }
  // Build a map of coverage by AC id. The latest record is authoritative;
  // older records may only contribute non-decision evidence omitted by a summary.
  var coverageMap = {};
  coverageRecords.forEach(function(r) {
    var existing = coverageMap[r.id];
    if (!existing) {
      coverageMap[r.id] = r;
    } else {
      var latest = Object.assign({}, r);
      if (!latest.test) latest.test = existing.test;
      if (!latest.method) latest.method = existing.method;
      latest.scenarios = (existing.scenarios || []).slice();
      r.scenarios.forEach(function(s) {
        if (!latest.scenarios.some(function(es) { return es.name === s.name; })) {
          latest.scenarios.push(s);
        }
      });
      coverageMap[r.id] = latest;
    }
  });
  // L1 + L2: check each declaration has coverage and result is PASS/SKIPPED-with-approval
  declarations.forEach(function(decl) {
    var cov = coverageMap[decl.id];
    if (!cov) {
      issues.push('AC Coverage: ' + decl.id + ' has no execution evidence in Execute Log.');
      return;
    }
    if (cov.result === 'FAIL') {
      issues.push('AC Coverage: ' + decl.id + ' verification failed.');
      return;
    }
    if (cov.result === 'SKIPPED') {
      // SKIPPED requires human approval three-element gate
      if (!cov.approvedBy) {
        issues.push('AC Coverage: ' + decl.id + ' is SKIPPED but missing Approved By.');
      } else if (!isHumanApproval(cov.approvedBy)) {
        issues.push('AC Coverage: ' + decl.id + ' is SKIPPED; Approved By must be human:<name>.');
      }
      if (!cov.approvedAt) {
        issues.push('AC Coverage: ' + decl.id + ' is SKIPPED but missing Approved At.');
      }
      if (!cov.reason) {
        issues.push('AC Coverage: ' + decl.id + ' is SKIPPED but missing Reason.');
      }
      return;
    }
  });
  // L4 (limited): check scenario names in coverage appear in spec declarations (warning only)
  // Warnings use a "WARNING:" prefix so they don't block archive readiness
  declarations.forEach(function(decl) {
    var cov = coverageMap[decl.id];
    if (!cov || !cov.scenarios.length || !decl.scenarios.length) return;
    cov.scenarios.forEach(function(covScenario) {
      var found = decl.scenarios.some(function(declScenario) {
        return declScenario.toLowerCase().indexOf(covScenario.name.toLowerCase()) !== -1 ||
               covScenario.name.toLowerCase().indexOf(declScenario.toLowerCase()) !== -1;
      });
      if (!found) {
        issues.push('WARNING: AC Coverage: ' + decl.id + ' scenario "' + covScenario.name + '" not found in Spec acceptance criteria (may need review).');
      }
    });
  });
}

function validateSpec(specPath, opts) {
  opts = opts || {};
  var issues = [];
  if (!specPath || !fs.existsSync(specPath)) {
    return { ok: false, issues: ['Spec file not found.'], specPath: specPath || '' };
  }

  var content = fs.readFileSync(specPath, 'utf-8');
  var mode = common.getFrontmatterField(specPath, 'mode') || 'standard';
  var projectDir = opts.projectDir || path.dirname(path.dirname(path.dirname(specPath)));
  var isGitRepo = require('../core/artifact-snapshot').isInsideGitRepo(projectDir);

  validateProfileReference(projectDir, specPath, issues);

  if (!opts.archiveReady) {
    var visualContext = visualContextStatus(specPath, projectDir);
    var selectionIssue = visualContextSelectionIssue(visualContext);
    if (selectionIssue) issues.push(selectionIssue);
    var visual = visualEvidence.inspect(specPath, projectDir);
    if (visual.planReadiness === 'blocked') {
      visual.diagnostics.forEach(function(diagnostic) {
        issues.push('Visual evidence is not ready for Plan: ' + diagnostic.code + '.');
      });
    }
  }

  if (!opts.archiveReady) {
    if (isGitRepo && !/^diff-base:[ \t]*"[^"]+"/m.test(content)) {
      issues.push('Missing diff-base frontmatter; Review cannot reliably know the task diff range.');
    }
    if (/<!-- \(not filled\) -->|\[TBD\]/.test(content)) {
      issues.push('Spec still contains unresolved placeholders.');
    }
  }
  if (!opts.archiveReady) {
    validatePlanGate(content, common.getApprovalPolicy(projectDir), false, issues);
    validateResearchGate(content, mode, false, issues);
    validateChallengeVerdict(content, issues);
  }

  if (opts.archiveReady) {
    validateModeArtifacts(projectDir, specPath, mode, !!opts.archiveReady, issues);
  } else {
    // Non archive-ready: check CR structured fields as WARNING only
    validateConfirmedRequirement(specPath, mode, false, issues);
  }

  var logArtifact = artifactSection(projectDir, specPath, 'execute-log-file', SECTION.executeLog, issues, 'Execute Log', opts.archiveReady);
  var executeLog = logArtifact.content;
  if (!opts.archiveReady && !firstRealLine(executeLog)) {
    issues.push('Execute Log is empty.');
  }

  var fullExecuteLog = '';
  if (opts.archiveReady && logArtifact.path && fs.existsSync(logArtifact.path)) {
    fullExecuteLog = fs.readFileSync(logArtifact.path, 'utf-8');
  }

  // AC Coverage cross-check (L1-L4) — only when archiveReady and Execute Log has coverage records
  if (opts.archiveReady && logArtifact.path && common.completionVerificationDone(fullExecuteLog)) {
    if (!fullExecuteLog) fullExecuteLog = fs.readFileSync(logArtifact.path, 'utf-8');
    validateAcCoverage(specPath, projectDir, fullExecuteLog, true, issues);
  }

  var blockingIssues = issues.filter(function(i) { return !/^WARNING:/i.test(i); });
  var workflowState = specState.evaluate(specState.readSnapshot(projectDir, specPath), {
    validationIssues: blockingIssues
  });
  if (opts.archiveReady) {
    var warnings = issues.filter(function(i) { return /^WARNING:/i.test(i); });
    issues = warnings.concat(workflowState.blockers.map(function(blocker) { return blocker.message; }));
    issues = issues.filter(function(issue, index, all) { return all.indexOf(issue) === index; });
  }
  return {
    ok: opts.archiveReady ? workflowState.completionReady : blockingIssues.length === 0,
    issues: issues,
    specPath: specPath,
    workflowState: workflowState
  };
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
  process.exit(1);
}

module.exports = run;
module.exports.validateSpec = validateSpec;
module.exports.resolveSpec = resolveSpec;
module.exports.visualContextStatus = visualContextStatus;
module.exports.visualContextSelectionIssue = visualContextSelectionIssue;
module.exports.profileUiImpact = profileUiImpact;
