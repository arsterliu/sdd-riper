var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;
var common = require('../../lib/common');
var profileStore = require('../profile/store');
var ProfileError = require('../profile/errors').ProfileError;

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

function fillIntake(specContent, mode, opts) {
  var req = opts.requirement || '';
  var goal = opts.goal || '';
  var constraints = opts.constraints || '';

  specContent = specContent.replace(/^Requirement:$/m, 'Requirement: ' + req);
  return specContent.replace(/^Scope:$/m, 'Scope: ' + [goal, constraints].filter(Boolean).join('；'));
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

function workflowHint() {
  return '### AI: Fill Risk Signals and the current Spec contract. The risk tier determines whether Design, Execute Log and independent reviews are required. Plan approval, fresh verification, dedicated human stops and archive authorization remain mandatory.';
}

function fillArtifactTemplate(templatePath, taskName, mode, specRelPath) {
  var content = fs.readFileSync(templatePath, 'utf-8');
  content = content.replace(/date: YYYY-MM-DD/, 'date: ' + todayIso());
  content = content.replace(/task-name: "Task Name Placeholder"/g, 'task-name: "' + taskName + '"');
  content = content.replace(/^mode:.*/m, 'mode: ' + mode);
  content = content.replace(/^source-spec:.*/m, 'source-spec: "' + yamlQuote(specRelPath) + '"');
  return content;
}

function profileContext(projectDir, units) {
  var resolved = profileStore.resolveCurrent(projectDir);
  if (!resolved) return { revision: '', digest: '', units: '' };
  var requested = Array.isArray(units) ? units : units ? [units] : [];
  requested = requested.map(function(value) { return String(value).trim(); }).filter(Boolean);
  requested = Array.from(new Set(requested)).sort();
  if (!requested.length) {
    throw new ProfileError('SDD_PROFILE_AFFECTED_UNITS_REQUIRED', 'confirmed profile requires --unit <id...> or --unit project', {}, 3);
  }
  var known = {};
  resolved.revision.profile.units.forEach(function(unit) { known[unit.id] = true; });
  var unknown = requested.filter(function(unit) { return unit !== 'project' && !known[unit]; });
  if (unknown.length) {
    throw new ProfileError('SDD_PROFILE_UNIT_UNKNOWN', 'unknown affected unit: ' + unknown.join(', '), { units: unknown }, 3);
  }
  return { revision: resolved.current.revision, digest: resolved.current.profileDigest, units: requested.join(',') };
}

function run(projectDir, opts) {
  var docsDir = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDir);
  var projectAutonomy = common.readProjectAutonomy(projectDir);
  if (!projectAutonomy.ok) {
    console.error('[' + projectAutonomy.code + '] Project autonomy config requires explicit migration: ' + projectAutonomy.issue);
    process.exit(3);
  }
  var autonomyMode = opts.autonomyMode || projectAutonomy.mode;
  if (require('../core/governance-contract').autonomyModes.indexOf(autonomyMode) === -1) {
    console.error('[SDD_AUTONOMY_MODE_INVALID] --autonomy-mode must be auto, supervised, or human');
    process.exit(3);
  }

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

  var specTemplate = path.join(common.SCAFFOLD_ROOT, 'templates', 'spec-streamlined.md');
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
  if (common.versionExists(path.join(docsRoot, 'archive'), taskName, opts.version)) {
    console.error('[ERROR] Archived tasks are read-only. Choose a new version/task identity.');
    process.exit(1);
  }

  var projectProfile;
  try { projectProfile = profileContext(projectDir, opts.unit); }
  catch (error) {
    if (error instanceof ProfileError) {
      console.error('[' + error.code + '] ' + error.message.replace(error.code + ': ', ''));
      process.exit(error.exitCode);
    }
    throw error;
  }

  var specOut = path.join(specsDir, opts.version + '-' + taskName + '.md');
  var specRel = common.relativeToProject(projectDir, specOut);
  var designPath = path.join(designDir, opts.version + '-' + taskName + '.design.md');
  var logPath = path.join(logsDir, opts.version + '-' + taskName + '.execute.md');
  var designOut = mode === 'standard' ? designPath : '';
  var logOut = mode !== 'micro' ? logPath : '';
  var designRel = common.relativeToProject(projectDir, designPath);
  var logRel = common.relativeToProject(projectDir, logPath);
  try {
    [specOut, designOut, logOut].filter(Boolean).forEach(function(file) {
      require('../core/workflow-policy').assertWritableArtifact(projectDir, file);
    });
  } catch (error) { console.error('[' + error.code + '] ' + error.message); process.exit(3); }
  [designDir, logsDir].forEach(function(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });
  if (designOut && fs.existsSync(designOut)) {
    console.error('[ERROR] Design artifact already exists. Choose a different version.');
    process.exit(1);
  }
  if (logOut && fs.existsSync(logOut)) {
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
  specContent = specContent.replace(/^autonomy-mode:.*/m, 'autonomy-mode: "' + autonomyMode + '"');
  specContent = specContent.replace(/^autonomy-mode-source:.*/m, 'autonomy-mode-source: "' + (opts.autonomyMode ? 'discover-override' : 'project-default') + '"');
  specContent = specContent.replace(/^context-source:.*/m, 'context-source: "' + yamlQuote(contextSource) + '"');
  specContent = specContent.replace(/^diff-base:.*/m, 'diff-base: "' + yamlQuote(getCurrentCommit(projectDir)) + '"');
  specContent = specContent.replace(/^design-file:.*/gm, 'design-file: "' + yamlQuote(designRel) + '"');
  specContent = specContent.replace(/^execute-log-file:.*/gm, 'execute-log-file: "' + yamlQuote(logRel) + '"');
  specContent = specContent.replace(/^project-profile-revision:.*/m, 'project-profile-revision: "' + yamlQuote(projectProfile.revision) + '"');
  specContent = specContent.replace(/^project-profile-digest:.*/m, 'project-profile-digest: "' + yamlQuote(projectProfile.digest) + '"');
  specContent = specContent.replace(/^affected-units:.*/m, 'affected-units: "' + yamlQuote(projectProfile.units) + '"');
  specContent = fillIntake(specContent, mode, opts);

  fs.writeFileSync(specOut, specContent, 'utf-8');
  if (designOut) {
    var designTemplate = path.join(common.SCAFFOLD_ROOT, 'templates', 'design-streamlined.md');
    fs.writeFileSync(designOut, fillArtifactTemplate(designTemplate, taskName, mode, specRel), 'utf-8');
  }
  if (logOut) {
    var logTemplate = path.join(common.SCAFFOLD_ROOT, 'templates', 'execute-log-streamlined.md');
    fs.writeFileSync(logOut, fillArtifactTemplate(logTemplate, taskName, mode, specRel), 'utf-8');
  }

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
  if (logOut) console.log('### Execute Log file: ' + logOut);
  if (projectProfile.revision) {
    console.log('### Project Profile revision: ' + projectProfile.revision);
    console.log('### Affected units: ' + projectProfile.units);
  }
  console.log('');
  console.log(workflowHint());
}

module.exports = { run: run, _private: { profileContext: profileContext } };
