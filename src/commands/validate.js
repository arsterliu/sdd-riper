var fs = require('fs');
var path = require('path');
var execSync = require('child_process').execSync;
var common = require('../../lib/common');

function firstRealLine(section) {
  var visible = section.replace(/<!--[\s\S]*?-->/g, '');
  return visible.split(/\r?\n/).map(function(line) { return line.trim(); }).find(function(line) {
    return line &&
      !line.startsWith('|') &&
      !/^#+\s/.test(line) &&
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
      if (/^[A-Za-z][A-Za-z ]+:[ \t]*/.test(next)) return false;
      return true;
    }
    return false;
  }
  return false;
}

function missingLabels(section, labels) {
  return labels.filter(function(label) { return !labelHasContent(section, label); });
}

function validateModeArtifacts(projectDir, specPath, mode, issues) {
  if (mode === 'standard') {
    if (common.subsectionIsEmpty(specPath, 'Confirmed Requirement')) {
      issues.push('Confirmed Requirement is empty.');
    }
    var innovate = sectionContent(specPath, 'Innovate Options');
    if (!firstRealLine(innovate)) {
      issues.push('Innovate Options is empty.');
    } else if (/Innovate:\s*Skipped/i.test(innovate)) {
      issues.push('Standard mode cannot skip Innovate Options.');
    }
    var standardDesignArtifact = artifactSection(projectDir, specPath, 'design-file', 'Technical Design', issues, 'Design', true);
    var standardDesign = standardDesignArtifact.content;
    if (!firstRealLine(standardDesign)) {
      issues.push('Technical Design is empty.');
    } else {
      var missingStandardDesign = missingLabels(standardDesign, ['Selected Option', 'Requirement Traceability', 'Test Strategy']);
      if (missingStandardDesign.length) {
        issues.push('Technical Design missing required fields: ' + missingStandardDesign.join(', ') + '.');
      }
    }
    var standardAc = sectionContent(specPath, 'Acceptance Criteria');
    if (!firstRealLine(standardAc)) {
      issues.push('Acceptance Criteria is empty.');
    } else if (!/\bAC-\d+\b/i.test(standardAc)) {
      issues.push('Standard Acceptance Criteria should include at least one AC-### item.');
    }
    return;
  }

  if (mode === 'lite') {
    if (common.sectionIsEmpty(specPath, 'Confirmed Requirement')) {
      issues.push('Confirmed Requirement is empty.');
    }
    var liteInnovate = sectionContent(specPath, 'Innovate Options');
    if (!firstRealLine(liteInnovate)) {
      issues.push('Innovate Options must contain options or an explicit skip reason.');
    } else if (/Innovate:\s*Skipped/i.test(liteInnovate) && !/Reason:\s*\S/i.test(liteInnovate)) {
      issues.push('Skipped Innovate Options must include Reason.');
    }
    var liteDesignArtifact = artifactSection(projectDir, specPath, 'design-file', 'Design Note', issues, 'Design', true);
    var liteDesign = liteDesignArtifact.content;
    if (!firstRealLine(liteDesign)) {
      issues.push('Design Note is empty.');
    } else {
      var missingLiteDesign = missingLabels(liteDesign, ['Approach', 'Impact Scope', 'Compatibility', 'Risks', 'Test Strategy']);
      if (missingLiteDesign.length) {
        issues.push('Design Note missing required fields: ' + missingLiteDesign.join(', ') + '.');
      }
    }
    if (!sectionHasContent(specPath, 'Acceptance Criteria')) {
      issues.push('Acceptance Criteria is empty.');
    }
    return;
  }

  if (mode === 'micro') {
    var plan = sectionContent(specPath, 'Plan');
    if (!labelHasContent(plan, 'Acceptance')) {
      issues.push('Micro Plan must include Acceptance.');
    }
    if (!labelHasContent(plan, 'Verification')) {
      issues.push('Micro Plan must include Verification.');
    }
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
  if (/<!-- \(not filled\) -->|<!-- \(未填充\) -->|\[待确认\]/.test(content)) {
    issues.push('Spec still contains unresolved placeholders.');
  }
  if (!/^[ \t]*Plan Approved By:[ \t]*[^\s].*/m.test(content)) {
    issues.push('Plan Approved By is empty.');
  }
  if (!/^[ \t]*Approved At:[ \t]*[^\s].*/m.test(content)) {
    issues.push('Approved At is empty.');
  }

  if (opts.archiveReady) {
    validateModeArtifacts(projectDir, specPath, mode, issues);
  }

  var logArtifact = artifactSection(projectDir, specPath, 'execute-log-file', 'Execute Log', issues, 'Execute Log', opts.archiveReady);
  var executeLog = logArtifact.content;
  if (!firstRealLine(executeLog)) {
    issues.push('Execute Log is empty.');
  }

  var review = common.extractSection(specPath, 'Review (Verdict|Summary)', 200);
  var reviewLine = firstRealLine(review);
  if (!reviewLine) {
    issues.push(reviewSectionName + ' is empty.');
  } else if (!/\bPASS\b/.test(reviewLine)) {
    issues.push(reviewSectionName + ' must contain a PASS verdict before archive.');
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
