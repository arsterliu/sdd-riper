var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;
var common = require('../../lib/common');

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function yamlQuote(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getCurrentCommit(projectDir) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return '';
  }
}

function replaceFirst(content, needle, replacement) {
  if (!replacement) return content;
  return content.replace(needle, replacement);
}

function fillIntake(specContent, mode, opts) {
  var req = opts.requirement || '';
  var goal = opts.goal || '';
  var constraints = opts.constraints || '';

  if (mode === 'standard') {
    var requirementText = [];
    if (req) requirementText.push('requirement: ' + req);
    if (goal) requirementText.push('goal: ' + goal);
    specContent = replaceFirst(specContent, '<!-- SDD_REQUIREMENT -->', requirementText.join('\n'));
    specContent = replaceFirst(specContent, '<!-- SDD_CONSTRAINTS -->', constraints ? 'constraints: ' + constraints : '');
    return specContent;
  }

  var lines = [];
  if (req) lines.push('requirement: ' + req);
  if (goal) lines.push('goal: ' + goal);
  if (constraints) lines.push('constraints: ' + constraints);
  var intakeContent = lines.join('\n');
  if (!intakeContent) return specContent;
  return specContent.replace('<!-- SDD_INTAKE -->', intakeContent);
}

// Advisory nudge toward the mode-selection rubric. Does not change --mode
// behavior; just reminds the chooser that micro is the default and standard
// must be earned. See protocols/mode-selection.md.
function modeAdvisory(mode, explicit) {
  var lines = ['[MODE] ' + mode + (explicit ? ' (from --mode)' : ' (default micro)') +
    ' — rubric: protocols/mode-selection.md (default micro; escalate only on a named signal).'];
  if (mode === 'standard') {
    lines.push('  standard is the heaviest mode: confirm a real signal earns it (interface contract, irreversibility, risk, or 3+ stacked signals); otherwise prefer lite/micro.');
  }
  return lines.join('\n');
}

function workflowHint(mode) {
  if (mode === 'micro') {
    return '### AI: Follow Plan -> Execute Log (with AC Coverage) -> Completion Verification -> Challenge -> Learning Check. Micro Plan must include Impact Scope, Data Impact, Interface Impact, Acceptance, and Verification. Keep template headings/labels in English, but write filled narrative content in Chinese. Do not enter Execute before Plan approval.';
  }
  if (mode === 'lite') {
    return '### AI: Follow Research -> Innovate/Skip -> Design Note -> Acceptance Criteria -> Plan -> Execute (with AC Coverage) -> Completion Verification -> Challenge -> Learning Check. Confirmed Requirement must fill all five structured fields: Scope Boundary, Irreversibility, Impact Radius, Dependencies & Constraints, Acceptance Intent. Research Gate requires Research Reviewed By and Research Reviewed At before Innovate. Lite Design Note must cover Approach, Impact Scope, Interface / Data Impact, Compatibility, Risks, and Test Strategy. Keep template headings/labels in English, but write filled narrative content in Chinese. Do not enter Execute before Plan approval.';
  }
  return '### AI: Follow Research -> Innovate -> Technical Design -> Acceptance Criteria -> Plan -> Execute (with AC Coverage) -> Completion Verification -> Challenge -> Learning Check. Confirmed Requirement must fill all five structured fields: Scope Boundary, Irreversibility, Impact Radius, Dependencies & Constraints, Acceptance Intent. Research Gate requires Research Reviewed By and Research Reviewed At before Innovate. Standard Technical Design is a design contract: fill Impact Scope, Architecture View, Data Model / Schema, Interface Contract, Compatibility / Rollback, and Test Strategy before Plan. Keep template headings/labels in English, but write filled narrative content in Chinese. Do not enter Execute before Plan approval.';
}

function fillArtifactTemplate(templatePath, taskName, mode, specRelPath) {
  var content = fs.readFileSync(templatePath, 'utf-8');
  content = content.replace(/date: YYYY-MM-DD/, 'date: ' + todayIso());
  content = content.replace(/task-name: "Task Name Placeholder"/g, 'task-name: "' + taskName + '"');
  content = content.replace(/^mode:.*/m, 'mode: ' + mode);
  content = content.replace(/^source-spec:.*/m, 'source-spec: "' + yamlQuote(specRelPath) + '"');
  return content;
}

function run(projectDir, opts) {
  var docsDir = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDir);

  if (!fs.existsSync(docsRoot)) {
    console.error('[ERROR] Project not initialized. Run: sdd init <dir>');
    process.exit(1);
  }

  var taskName = opts.taskName;
  if (!taskName) { console.error('[ERROR] --task-name is required'); process.exit(3); }
  if (!/^[A-Za-z0-9_-]+$/.test(taskName)) {
    console.error('[ERROR] Invalid --task-name: use only letters, numbers, hyphens, and underscores');
    process.exit(3);
  }

  var mode = common.getMode(projectDir);
  if (opts.mode) {
    if (['standard','lite','micro'].indexOf(opts.mode) === -1) {
      console.error('[ERROR] Invalid --mode value');
      process.exit(3);
    }
    mode = opts.mode;
  }

  var specTemplate = common.getSpecTemplate(projectDir, mode);
  if (!fs.existsSync(specTemplate)) {
    console.error('[ERROR] spec template not found at: ' + specTemplate);
    process.exit(1);
  }

  var specsDir = path.join(docsRoot, 'specs');
  var designDir = path.join(docsRoot, 'design');
  var logsDir = path.join(docsRoot, 'logs');
  if (!opts.version) { console.error('[ERROR] --version/--spec-version is required'); process.exit(3); }
  if (!common.isValidSpecVersion(opts.version)) {
    console.error('[ERROR] Invalid version format. Expected: v{N}.{M} or v{N}.{M}.{P}');
    process.exit(3);
  }
  if (common.versionExists(specsDir, taskName, opts.version)) {
    console.error('[ERROR] Spec already exists: task-name must be unique within version ' + opts.version + '.');
    process.exit(1);
  }

  var specOut = path.join(specsDir, opts.version + '-' + taskName + '.md');
  var specRel = common.relativeToProject(projectDir, specOut);
  var designOut = mode === 'micro' ? '' : path.join(designDir, opts.version + '-' + taskName + '.design.md');
  var designRel = designOut ? common.relativeToProject(projectDir, designOut) : '';
  var logOut = path.join(logsDir, opts.version + '-' + taskName + '.execute.md');
  var logRel = common.relativeToProject(projectDir, logOut);
  [designDir, logsDir].forEach(function(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });
  if (designOut && fs.existsSync(designOut)) {
    console.error('[ERROR] Design artifact already exists. Choose a different version.');
    process.exit(1);
  }
  if (fs.existsSync(logOut)) {
    console.error('[ERROR] Execute Log artifact already exists. Choose a different version.');
    process.exit(1);
  }

  var specContent = fs.readFileSync(specTemplate, 'utf-8');
  // Auto-detect context/<task-name>/ directory
  var contextSource = opts.context || '';
  if (!contextSource) {
    var contextCandidate = path.join(docsRoot, 'context', taskName);
    if (fs.existsSync(contextCandidate)) {
      contextSource = docsDir + '/context/' + taskName;
    }
  }
  specContent = specContent.replace(/task-name: "Task Name Placeholder"/g, 'task-name: "' + taskName + '"');
  specContent = specContent.replace(/date: YYYY-MM-DD/, 'date: ' + todayIso());
  specContent = specContent.replace(/^mode:.*/m, 'mode: ' + mode);
  specContent = specContent.replace(/^context-source:.*/m, 'context-source: "' + yamlQuote(contextSource) + '"');
  specContent = specContent.replace(/^diff-base:.*/m, 'diff-base: "' + yamlQuote(getCurrentCommit(projectDir)) + '"');
  specContent = specContent.replace(/^design-file:.*/gm, 'design-file: "' + yamlQuote(designRel) + '"');
  specContent = specContent.replace(/^execute-log-file:.*/gm, 'execute-log-file: "' + yamlQuote(logRel) + '"');
  specContent = fillIntake(specContent, mode, opts);

  fs.writeFileSync(specOut, specContent, 'utf-8');
  if (designOut) {
    var designTemplate = path.join(common.SCAFFOLD_ROOT, 'templates', mode === 'lite' ? 'design-lite.md' : 'design-standard.md');
    fs.writeFileSync(designOut, fillArtifactTemplate(designTemplate, taskName, mode, specRel), 'utf-8');
  }
  var logTemplate = path.join(common.SCAFFOLD_ROOT, 'templates', 'execute-log.md');
  fs.writeFileSync(logOut, fillArtifactTemplate(logTemplate, taskName, mode, specRel), 'utf-8');

  console.log(modeAdvisory(mode, !!opts.mode));

  console.log('');
  console.log('## SPEC CREATION PROMPT');
  console.log('');
  console.log('### task-name: ' + taskName);
  console.log('### requirement: ' + (opts.requirement || '(not set)'));
  console.log('### goal: ' + (opts.goal || '(not set)'));
  console.log('### Spec file: ' + specOut);
  if (contextSource) console.log('### Context source: ' + contextSource);
  if (designOut) console.log('### Design file: ' + designOut);
  console.log('### Execute Log file: ' + logOut);
  console.log('');
  console.log(workflowHint(mode));
}

module.exports = { run: run };
