var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;
var common = require('../../lib/common');
var learning = require('../core/learning');

var gitRepoCache = new Map();

function isInsideGitRepo(projectDir) {
  var key = path.resolve(projectDir);
  if (gitRepoCache.has(key)) return gitRepoCache.get(key);
  var result = false;
  try {
    result = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim() === 'true';
  } catch (e) {}
  gitRepoCache.set(key, result);
  return result;
}

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

// A verdict line counts as PASS only when it carries a PASS token and no FAIL_
// token, so a failing line that merely mentions the word "PASS" is not archived.
function isPassVerdict(line) {
  var s = String(line || '');
  if (/\bFAIL_/i.test(s)) return false;
  return /\bPASS\b|\bPASS_WITH_CONCERNS\b/.test(s);
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

function labelValue(section, label) {
  var lines = section.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  var labelRegex = new RegExp('^' + escapeRegExp(label) + ':[ \\t]*(.*)$', 'i');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var m = line.match(labelRegex);
    if (!m) continue;
    if (m[1] && m[1].trim()) return m[1].trim();
    for (var j = i + 1; j < lines.length; j++) {
      var next = lines[j].trim();
      if (!next || next.startsWith('<!--') || next.startsWith('|') || /^#+\s/.test(next)) continue;
      if (/^[A-Za-z][A-Za-z0-9 /&_-]*:[ \t]*/.test(next)) break;
      return next;
    }
    continue;
  }
  return '';
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

function validateLearningRecord(projectDir, specPath, triggers, issues) {
  if (!triggers.length) return;
  var artifact = learning.learningArtifact(projectDir, specPath);
  if (!artifact.ref) {
    issues.push('Learning Record is required because: ' + triggers.join(', ') + '. Run: sdd new-learning <project-dir> <spec-name>.');
    return;
  }
  if (!artifact.exists) {
    issues.push('Learning Record file not found: ' + artifact.ref);
    return;
  }
  learning.validateLearningContent(artifact.content).forEach(function(issue) {
    issues.push(issue);
  });
}

function validatePlanGate(content, gatePolicy, archiveReady, issues) {
  var approvedBy = labelValue(content, 'Plan Approved By');
  var approvedAt = labelValue(content, 'Approved At');
  var gateEvidence = labelValue(content, 'Gate Evidence');
  if (!approvedBy) {
    if (gatePolicy !== 'advisory' || archiveReady) issues.push('Plan Approved By is empty.');
    return;
  }
  if (!approvedAt) {
    if (gatePolicy !== 'advisory' || archiveReady) issues.push('Approved At is empty.');
  }
  if (/^auto-gate$/i.test(approvedBy)) {
    if (gatePolicy === 'manual') {
      issues.push('Manual gate policy requires human Plan Approved By.');
    }
    if (!gateEvidence) {
      issues.push('Gate Evidence is required for auto-gate approval.');
    }
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

function validateResearchGate(content, mode, gatePolicy, archiveReady, issues) {
  if (mode === 'micro') return; // micro skips Research entirely
  var reviewedBy = labelValue(content, 'Research Reviewed By');
  var reviewedAt = labelValue(content, 'Research Reviewed At');
  if (!reviewedBy) {
    if (gatePolicy !== 'advisory' || archiveReady) issues.push('Research Reviewed By is empty.');
    return;
  }
  if (!reviewedAt) {
    if (gatePolicy !== 'advisory' || archiveReady) issues.push('Research Reviewed At is empty.');
  }
  if (/^auto-gate$/i.test(reviewedBy)) {
    if (gatePolicy === 'manual') {
      issues.push('Manual gate policy requires human Research Reviewed By.');
    }
    if (!labelValue(content, 'Gate Evidence')) {
      issues.push('Gate Evidence is required for auto-gate Research review.');
    }
  }
}

function validateChallengeVerdict(content, issues) {
  var verdict = labelValue(content, 'Challenge Verdict');
  if (/^FAIL_/i.test(verdict)) {
    issues.push('Adversarial Challenge failed: ' + verdict.toUpperCase() + '.');
  }
}

function validateChallengeEvidence(content, mode, gatePolicy, archiveReady, issues) {
  var executedBy = labelValue(content, 'Challenge Executed By');
  var executedAt = labelValue(content, 'Challenge Executed At');
  var challengeEvidence = labelValue(content, 'Challenge Evidence');
  var challengeTime = null;
  if (!executedBy) {
    if (gatePolicy !== 'advisory' || archiveReady) {
      issues.push('Challenge has not been executed: Challenge Executed By is empty. Run: sdd challenge <project-dir>, then record the independent result with: sdd challenge <project-dir> --record-result "VERDICT" --summary "..." --executed-by "subagent".');
    }
    return challengeTime;
  }
  if (!executedAt) {
    if (gatePolicy !== 'advisory' || archiveReady) {
      issues.push('Challenge Executed At is empty. Run: sdd challenge <project-dir>, then record the independent result with: sdd challenge <project-dir> --record-result "VERDICT" --summary "..." --executed-by "subagent".');
    }
  }
  if (!challengeEvidence) {
    if (gatePolicy !== 'advisory' || archiveReady) {
      issues.push('Challenge Evidence is required for challenge execution. Run: sdd challenge <project-dir>, then record the independent result with: sdd challenge <project-dir> --record-result "VERDICT" --summary "..." --executed-by "subagent".');
    }
  }
  if (/^auto-gate$/i.test(executedBy)) {
    if (gatePolicy === 'manual') {
      issues.push('Manual gate policy requires human Challenge Executed By.');
    }
  }
  if (mode === 'standard' || mode === 'lite') {
    if (!/subagent/i.test(executedBy)) {
      issues.push('Standard and lite modes require subagent Challenge execution.');
    }
  }
  // Challenge Executed At must be a valid ISO-8601 timestamp.
  // Temporal ordering against Execute Log is checked separately in validateSpec.
  if (executedAt && archiveReady) {
    challengeTime = new Date(executedAt);
    if (Number.isNaN(challengeTime.getTime())) {
      issues.push('Challenge Executed At is not a valid ISO-8601 timestamp.');
      challengeTime = null;
    }
  }
  return challengeTime;
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
  var records = [];
  var lines = String(executeLogContent || '').split(/\r?\n/);
  // Match lines like "  - AC-001: PASS" or "  - AC-001: FAIL" or "  - AC-001: SKIPPED"
  var acLine = /^\s*-\s*(AC-\d+)\s*:\s*(PASS|FAIL|SKIPPED)\b/i;
  var scenarioLine = /^\s*-\s*"([^"]+)"\s*:\s*(PASS|FAIL)\b/i;
  var testLine = /^\s*Test:\s*(.+)$/i;
  var methodLine = /^\s*Method:\s*(.+)$/i;
  var reasonLine = /^\s*Reason:\s*(.+)$/i;
  var approvedByLine = /^\s*Approved By:\s*(.+)$/i;
  var approvedAtLine = /^\s*Approved At:\s*(.+)$/i;
  var current = null;
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(acLine);
    if (m) {
      current = {
        id: m[1].toUpperCase(),
        result: m[2].toUpperCase(),
        scenarios: [],
        test: '',
        method: '',
        reason: '',
        approvedBy: '',
        approvedAt: ''
      };
      records.push(current);
      continue;
    }
    if (!current) continue;
    // Check for sub-fields (indented under the AC Coverage entry)
    var sm = lines[i].match(scenarioLine);
    if (sm) { current.scenarios.push({ name: sm[1], result: sm[2].toUpperCase() }); continue; }
    var tm = lines[i].match(testLine);
    if (tm) { current.test = tm[1].trim(); continue; }
    var mm = lines[i].match(methodLine);
    if (mm) { current.method = mm[1].trim(); continue; }
    var rm = lines[i].match(reasonLine);
    if (rm) { current.reason = rm[1].trim(); continue; }
    var abm = lines[i].match(approvedByLine);
    if (abm) { current.approvedBy = abm[1].trim(); continue; }
    var aam = lines[i].match(approvedAtLine);
    if (aam) { current.approvedAt = aam[1].trim(); continue; }
    // A new top-level AC line or a non-indented line ends the current record
    if (/^\s*-\s*AC-\d+/i.test(lines[i]) || /^[A-Za-z]/.test(lines[i].trim())) {
      current = null;
    }
  }
  return records;
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

// Validate AC Coverage against Spec declarations (L1-L4).
// L1: every AC in Spec has a Coverage record in Execute Log
// L2: all Coverage results are PASS (SKIPPED with approval is OK)
// L3: Test path files exist (when projectDir is provided)
// L4 (limited): Scenario names in Coverage appear in Spec (warning only)
function validateAcCoverage(specPath, projectDir, executeLogContent, archiveReady, issues) {
  if (!archiveReady) return;
  var acceptanceSection = sectionContent(specPath, SECTION.acceptanceCriteria);
  if (!firstRealLine(acceptanceSection)) return; // no AC, skip
  var declarations = parseAcDeclarations(acceptanceSection);
  if (!declarations.length) return;
  var coverageRecords = parseAcCoverage(executeLogContent);
  // If no coverage records at all, skip (gradual enforcement for old logs)
  if (!coverageRecords.length) return;
  // Build a map of coverage by AC id, merging per-step and summary entries
  // (summary entries may lack Test paths; per-step entries have them)
  var coverageMap = {};
  coverageRecords.forEach(function(r) {
    var existing = coverageMap[r.id];
    if (!existing) {
      coverageMap[r.id] = r;
    } else {
      // Merge: prefer PASS/SKIPPED over FAIL, preserve Test path if available
      if (r.result !== 'FAIL' && existing.result === 'FAIL') {
        coverageMap[r.id] = r;
      } else if (r.test && !existing.test) {
        // Keep the entry that has a Test path
        existing.test = r.test;
      }
      // Merge scenarios
      r.scenarios.forEach(function(s) {
        if (!existing.scenarios.some(function(es) { return es.name === s.name; })) {
          existing.scenarios.push(s);
        }
      });
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
      } else if (/^auto-gate$/i.test(cov.approvedBy)) {
        issues.push('AC Coverage: ' + decl.id + ' is SKIPPED; Approved By cannot be auto-gate.');
      }
      if (!cov.approvedAt) {
        issues.push('AC Coverage: ' + decl.id + ' is SKIPPED but missing Approved At.');
      }
      if (!cov.reason) {
        issues.push('AC Coverage: ' + decl.id + ' is SKIPPED but missing Reason.');
      }
      return;
    }
    // PASS — L3: check test path exists
    if (cov.test && projectDir) {
      var testPath = common.resolveProjectPath(projectDir, cov.test);
      if (testPath && !fs.existsSync(testPath)) {
        issues.push('AC Coverage: ' + decl.id + ' Test file not found: ' + cov.test);
      }
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
  var status = common.getFrontmatterField(specPath, 'status') || 'draft';
  var projectDir = opts.projectDir || path.dirname(path.dirname(path.dirname(specPath)));
  var isGitRepo = isInsideGitRepo(projectDir);

  if (isGitRepo && !/^diff-base:[ \t]*"[^"]+"/m.test(content)) {
    issues.push('Missing diff-base frontmatter; Review cannot reliably know the task diff range.');
  }
  if (/<!-- \(not filled\) -->|\[TBD\]/.test(content)) {
    issues.push('Spec still contains unresolved placeholders.');
  }
  validatePlanGate(content, common.getGatePolicy(projectDir), !!opts.archiveReady, issues);
  validateResearchGate(content, mode, common.getGatePolicy(projectDir), !!opts.archiveReady, issues);
  validateChallengeVerdict(content, issues);

  var challengeTime = null;

  if (opts.archiveReady) {
    validateModeArtifacts(projectDir, specPath, mode, !!opts.archiveReady, issues);
  } else {
    // Non archive-ready: check CR structured fields as WARNING only
    validateConfirmedRequirement(specPath, mode, false, issues);
  }

  var logArtifact = artifactSection(projectDir, specPath, 'execute-log-file', SECTION.executeLog, issues, 'Execute Log', opts.archiveReady);
  var executeLog = logArtifact.content;
  if (!firstRealLine(executeLog)) {
    issues.push('Execute Log is empty.');
  }

  var fullExecuteLog = '';
  if (opts.archiveReady && logArtifact.path && fs.existsSync(logArtifact.path)) {
    fullExecuteLog = fs.readFileSync(logArtifact.path, 'utf-8');
    var completionStatus = common.completionVerificationStatus(fullExecuteLog);
    if (completionStatus !== 'DONE') {
      issues.push('Execute Log completion-verification is not DONE.');
    } else {
      challengeTime = validateChallengeEvidence(content, mode, common.getGatePolicy(projectDir), true, issues);
    }
  }

  // Challenge Executed At must be after the last Execute Log step timestamp
  if (opts.archiveReady && challengeTime && logArtifact.path) {
    var lastStepTime = common.extractLastStepTimestamp(fullExecuteLog || fs.readFileSync(logArtifact.path, 'utf-8'));
    if (lastStepTime && challengeTime <= lastStepTime) {
      issues.push('Challenge Executed At must be after the last Execute Log step timestamp. Run: sdd challenge <project-dir>, then record the refreshed independent result with: sdd challenge <project-dir> --record-result "VERDICT" --summary "..." --executed-by "subagent".');
    }
  }

  // AC Coverage cross-check (L1-L4) — only when archiveReady and Execute Log has coverage records
  if (opts.archiveReady && logArtifact.path) {
    if (!fullExecuteLog) fullExecuteLog = fs.readFileSync(logArtifact.path, 'utf-8');
    validateAcCoverage(specPath, projectDir, fullExecuteLog, true, issues);
  }

  if (opts.archiveReady) {
    validateLearningRecord(projectDir, specPath, learning.learningTriggers(content, executeLog, labelValue(content, 'Challenge Verdict')), issues);
  }

  if (status === 'archived' && opts.archiveReady) {
    issues.push('Spec is already archived.');
  }

  return { ok: issues.filter(function(i) { return !/^WARNING:/i.test(i); }).length === 0, issues: issues, specPath: specPath };
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
    return;
  }
  console.log('RESULT: FAIL');
  result.issues.forEach(function(issue) { console.log('- ' + issue); });
  process.exit(1);
}

module.exports = run;
module.exports.validateSpec = validateSpec;
module.exports.resolveSpec = resolveSpec;
