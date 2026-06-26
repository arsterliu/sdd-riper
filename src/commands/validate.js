var fs = require('fs');
var path = require('path');
var execSync = require('child_process').execSync;
var common = require('../../lib/common');
var learning = require('../core/learning');

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

function firstRealLine(section) {
  var visible = section.replace(/<!--[\s\S]*?-->/g, '');
  return visible.split(/\r?\n/).map(function(line) { return line.trim(); }).find(function(line) {
    return line &&
      !line.startsWith('|') &&
      !/^#+\s/.test(line) &&
      !/^[A-Za-z][A-Za-z0-9 /_-]*:\s*$/.test(line) &&
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
      if (/^[A-Za-z][A-Za-z0-9 /_-]*:[ \t]*/.test(next)) break;
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
      if (/^[A-Za-z][A-Za-z0-9 /_-]*:[ \t]*/.test(next)) break;
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

function validateChallengeVerdict(content, issues) {
  var verdict = labelValue(content, 'Challenge Verdict');
  if (/^FAIL_/i.test(verdict)) {
    issues.push('Adversarial Challenge failed: ' + verdict.toUpperCase() + '.');
  }
}

function validateModeArtifacts(projectDir, specPath, mode, issues) {
  if (mode === 'standard') {
    if (common.subsectionIsEmpty(specPath, SECTION.confirmedRequirement)) {
      issues.push('Confirmed Requirement is empty.');
    }
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
    if (common.sectionIsEmpty(specPath, SECTION.confirmedRequirement)) {
      issues.push('Confirmed Requirement is empty.');
    }
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
    var found = common.findSourceSpec(specsDir, common.normalizeSlug(opts.name));
    if (found) return found;
  }
  return common.findLatestSpec(specsDir);
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
  var reviewSectionName = mode === 'standard' ? 'Review Verdict' : 'Review Summary';
  var projectDir = opts.projectDir || path.dirname(path.dirname(path.dirname(specPath)));
  var isGitRepo = false;
  try {
    isGitRepo = execSync('git rev-parse --is-inside-work-tree', { cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true';
  } catch (e) {}

  if (isGitRepo && !/^diff-base:[ \t]*"[^"]+"/m.test(content)) {
    issues.push('Missing diff-base frontmatter; Review cannot reliably know the task diff range.');
  }
  if (/<!-- \(not filled\) -->|\[TBD\]/.test(content)) {
    issues.push('Spec still contains unresolved placeholders.');
  }
  validatePlanGate(content, common.getGatePolicy(projectDir), !!opts.archiveReady, issues);
  validateChallengeVerdict(content, issues);

  if (opts.archiveReady) {
    validateModeArtifacts(projectDir, specPath, mode, issues);
  }

  var logArtifact = artifactSection(projectDir, specPath, 'execute-log-file', SECTION.executeLog, issues, 'Execute Log', opts.archiveReady);
  var executeLog = logArtifact.content;
  if (!firstRealLine(executeLog)) {
    issues.push('Execute Log is empty.');
  }

  var review = common.extractSection(specPath, SECTION.review, 200);
  var reviewLine = firstRealLine(review);
  if (!reviewLine) {
    issues.push(reviewSectionName + ' is empty.');
  } else if (!/\bPASS\b|\bPASS_WITH_CONCERNS\b/.test(reviewLine)) {
    issues.push(reviewSectionName + ' must contain a PASS verdict before archive.');
  }

  if (opts.archiveReady) {
    validateLearningRecord(projectDir, specPath, learning.learningTriggers(content, executeLog, reviewLine), issues);
  }

  if (status === 'archived' && opts.archiveReady) {
    issues.push('Spec is already archived.');
  }

  return { ok: issues.length === 0, issues: issues, specPath: specPath };
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
