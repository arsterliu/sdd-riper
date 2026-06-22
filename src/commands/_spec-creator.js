var fs = require('fs');
var path = require('path');
var execSync = require('child_process').execSync;
var common = require('../../lib/common');

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function yamlQuote(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getCurrentCommit(projectDir) {
  try {
    return execSync('git rev-parse HEAD', { cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return '';
  }
}

function replaceFirst(content, needle, replacement) {
  if (!replacement) return content;
  return content.replace(needle, replacement);
}

function fillInvocation(specContent, mode, opts) {
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
  var invocationContent = lines.join('\n');
  if (!invocationContent) return specContent;
  return specContent.replace('<!-- SDD_INVOCATION -->', invocationContent);
}

function workflowHint(mode) {
  if (mode === 'micro') {
    return '### AI: Run Plan with Acceptance/Verification -> Execute using the external Execute Log -> Review. Wait for Plan Approved before Execute.';
  }
  if (mode === 'lite') {
    return '### AI: Run Research -> Innovate or explicit skip -> Design Note file -> Acceptance Criteria -> Plan. Wait for Plan Approved before Execute.';
  }
  return '### AI: Run Research -> Innovate -> Technical Design file -> Acceptance Criteria -> Plan. Wait for Plan Approved before Execute.';
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

  var specTemplate = common.getSpecTemplate(projectDir, opts.mode || undefined);
  if (!fs.existsSync(specTemplate)) {
    console.error('[ERROR] spec template not found at: ' + specTemplate);
    process.exit(1);
  }

  var specsDir = path.join(docsRoot, 'specs');
  var designDir = path.join(docsRoot, 'design');
  var logsDir = path.join(docsRoot, 'logs');
  if (!opts.version) { console.error('[ERROR] --version/--spec-version is required'); process.exit(3); }
  if (!/^v\d+\.\d+$/.test(opts.version)) {
    console.error('[ERROR] Invalid version format. Expected: v{N}.{M}');
    process.exit(3);
  }
  if (common.versionExists(specsDir, taskName, opts.version)) {
    console.error('[ERROR] Spec already exists. Choose a different version.');
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
  specContent = specContent.replace(/task-name: "Task Name Placeholder"/g, 'task-name: "' + taskName + '"');
  specContent = specContent.replace(/date: YYYY-MM-DD/, 'date: ' + todayIso());
  specContent = specContent.replace(/^context-source:.*/m, 'context-source: "' + yamlQuote(opts.context || '') + '"');
  specContent = specContent.replace(/^diff-base:.*/m, 'diff-base: "' + yamlQuote(getCurrentCommit(projectDir)) + '"');
  specContent = specContent.replace(/^design-file:.*/gm, 'design-file: "' + yamlQuote(designRel) + '"');
  specContent = specContent.replace(/^execute-log-file:.*/gm, 'execute-log-file: "' + yamlQuote(logRel) + '"');
  specContent = fillInvocation(specContent, mode, opts);

  fs.writeFileSync(specOut, specContent, 'utf-8');
  if (designOut) {
    var designTemplate = path.join(common.SCAFFOLD_ROOT, 'templates', mode === 'lite' ? 'design-lite.md' : 'design-standard.md');
    fs.writeFileSync(designOut, fillArtifactTemplate(designTemplate, taskName, mode, specRel), 'utf-8');
  }
  var logTemplate = path.join(common.SCAFFOLD_ROOT, 'templates', 'execute-log.md');
  fs.writeFileSync(logOut, fillArtifactTemplate(logTemplate, taskName, mode, specRel), 'utf-8');

  var suggestion = common.shouldSuggestCodeMap(projectDir, docsDir);
  if (suggestion) console.log(suggestion);

  console.log('');
  console.log('## SPEC CREATION PROMPT');
  console.log('');
  console.log('### task-name: ' + taskName);
  console.log('### requirement: ' + (opts.requirement || '(not set)'));
  console.log('### goal: ' + (opts.goal || '(not set)'));
  console.log('### Spec file: ' + specOut);
  if (designOut) console.log('### Design file: ' + designOut);
  console.log('### Execute Log file: ' + logOut);
  console.log('');
  console.log(workflowHint(mode));
}

module.exports = { run: run };
