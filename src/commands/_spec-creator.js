var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

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
  if (!opts.version) { console.error('[ERROR] --spec-version is required'); process.exit(3); }
  if (!/^v\d+\.\d+$/.test(opts.version)) {
    console.error('[ERROR] Invalid --spec-version format. Expected: v{N}.{M}');
    process.exit(3);
  }
  if (common.versionExists(specsDir, taskName, opts.version)) {
    console.error('[ERROR] Spec already exists. Choose a different version.');
    process.exit(1);
  }

  var specOut = path.join(specsDir, opts.version + '-' + taskName + '.md');
  var specContent = fs.readFileSync(specTemplate, 'utf-8');

  specContent = specContent.replace(/task-name: "Task Name Placeholder"/g, 'task-name: "' + taskName + '"');

  var invocationLines = '';
  if (opts.requirement) invocationLines += 'requirement: ' + opts.requirement + '\n';
  if (opts.goal) invocationLines += 'goal: ' + opts.goal + '\n';
  if (opts.constraints) invocationLines += 'constraints: ' + opts.constraints + '\n';
  if (opts.context) invocationLines += '<!-- context: ' + opts.context + ' -->\n';

  var invocationPlaceholder = '\x3C\x21\x2D\x2D \xE6\xA0\xB8\xE5\xBF\x83\xE7\x9B\xAE\xE6\xA0\x87 \x2D\x2D\x3E';
  var invocationContent = invocationLines || invocationPlaceholder;
  specContent = specContent.replace(invocationPlaceholder, invocationContent);

  fs.writeFileSync(specOut, specContent, 'utf-8');

  var suggestion = common.shouldSuggestCodeMap(projectDir, docsDir);
  if (suggestion) console.log(suggestion);

  console.log('');
  console.log('## SPEC CREATION PROMPT');
  console.log('');
  console.log('### task-name: ' + taskName);
  console.log('### requirement: ' + (opts.requirement || '(not set)'));
  console.log('### goal: ' + (opts.goal || '(not set)'));
  console.log('### Spec file: ' + specOut);
  console.log('');
  console.log('### AI: Run Research -> Innovate -> Plan. Wait for Plan Approved before Execute.');
}

module.exports = { run: run };
