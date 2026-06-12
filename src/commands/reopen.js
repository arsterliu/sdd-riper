var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function run(projectDir, specName, opts) {
  var defectSummary = opts.defect || '';
  var patchMode = opts.mode || 'micro';
  if (['standard','lite','micro'].indexOf(patchMode) === -1) { console.error('[ERROR] Invalid --mode'); process.exit(3); }
  var docsDirName = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDirName);
  var specsDir = path.join(docsRoot, 'specs');
  var archiveDir = path.join(docsRoot, 'archive');
  if (!fs.existsSync(docsRoot) || !fs.existsSync(specsDir)) { console.error('[ERROR] Not initialized.'); process.exit(1); }
  var specTemplate = common.getSpecTemplate(projectDir, patchMode);
  if (!fs.existsSync(specTemplate)) { console.error('[ERROR] Template not found.'); process.exit(1); }
  var specSlug = common.normalizeSlug(specName);
  var sourceSpec = common.findSourceSpec(specsDir, specSlug, true) || common.findSourceSpec(archiveDir, specSlug, true);
  if (!sourceSpec) { console.error('[ERROR] No archived spec found.'); process.exit(1); }
  var sourceBname = path.basename(sourceSpec);
  var vm = sourceBname.match(/^(v\d+\.\d+)-(.+)\.md$/);
  if (!vm) { console.error('[ERROR] Invalid versioned naming.'); process.exit(1); }
  var sourceVersion = vm[1], taskSlug = vm[2];
  var archiveFile = path.join(archiveDir, sourceVersion + '-' + taskSlug + '.md');
  if (!fs.existsSync(archiveFile)) { console.error('[ERROR] Archive file not found: ' + archiveFile); process.exit(1); }
  var newSpec = path.join(specsDir, sourceVersion + '-' + taskSlug + '.md');
  if (fs.existsSync(newSpec)) { console.error('[ERROR] Patch spec already exists.'); process.exit(1); }
  var todayIso = new Date().toISOString().slice(0, 10);
  var contextRelative = archiveFile;
  if (archiveFile.indexOf(projectDir) === 0) contextRelative = archiveFile.slice(projectDir.length + 1);
  var templateContent = fs.readFileSync(specTemplate, 'utf-8');
  templateContent = templateContent.replace(/date: YYYY-MM-DD/, 'date: ' + todayIso);
  templateContent = templateContent.replace(/task-name: "Task Name Placeholder"/, 'task-name: "' + taskSlug + '"');
  templateContent = templateContent.replace(/^reopened-from:.*/m, 'reopened-from: "' + sourceVersion + '"');
  templateContent = templateContent.replace(/^context-source:.*/m, 'context-source: "' + contextRelative + '"');
  var archiveNote = '<!-- Reopened from archived context: ' + contextRelative + (defectSummary ? ' | defect: ' + defectSummary : '') + ' -->';
  var lines = templateContent.split(/\r?\n/);
  var resultLines = [], fmCount = 0, injected = false;
  lines.forEach(function(line) {
    resultLines.push(line);
    if (!injected && line === '---') { fmCount++; if (fmCount === 2) { resultLines.push(''); resultLines.push(archiveNote); injected = true; } }
  });
  var output = resultLines.join('\n') + '\n<!-- Source Spec: ' + sourceBname + ' -->\n';
  fs.writeFileSync(newSpec, output, 'utf-8');
  console.log('[CREATE] ' + newSpec);
  console.log('Reopened from: ' + sourceBname);
  console.log('Archive context: ' + archiveFile);
  console.log('Run: sdd resume "' + projectDir + '"');
}
module.exports = run;
