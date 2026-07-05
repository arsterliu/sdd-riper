var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function yamlQuote(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function fillArtifactTemplate(templatePath, taskSlug, mode, todayIso, specRel) {
  var content = fs.readFileSync(templatePath, 'utf-8');
  content = content.replace(/date: YYYY-MM-DD/, 'date: ' + todayIso);
  content = content.replace(/task-name: "Task Name Placeholder"/g, 'task-name: "' + taskSlug + '"');
  content = content.replace(/^mode:.*/m, 'mode: ' + mode);
  content = content.replace(/^source-spec:.*/m, 'source-spec: "' + yamlQuote(specRel) + '"');
  return content;
}

function run(projectDir, specName, opts) {
  var defectSummary = opts.defect || '';
  var patchMode = opts.mode || 'micro';
  if (['standard','lite','micro'].indexOf(patchMode) === -1) { console.error('[ERROR] Invalid --mode'); process.exit(3); }
  var docsDirName = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDirName);
  var specsDir = path.join(docsRoot, 'specs');
  var designDir = path.join(docsRoot, 'design');
  var logsDir = path.join(docsRoot, 'logs');
  var archiveDir = path.join(docsRoot, 'archive');
  if (!fs.existsSync(docsRoot) || !fs.existsSync(specsDir)) { console.error('[ERROR] Not initialized.'); process.exit(1); }
  var specTemplate = common.getSpecTemplate(projectDir, patchMode);
  if (!fs.existsSync(specTemplate)) { console.error('[ERROR] Template not found.'); process.exit(1); }
  var sourceSpec = common.findSourceSpecByRef(specsDir, specName, true) || common.findSourceSpecByRef(archiveDir, specName, true);
  if (!sourceSpec) { console.error('[ERROR] No archived spec found.'); process.exit(1); }
  var sourceBname = path.basename(sourceSpec);
  var parsed = common.parseSpecFileName(sourceBname);
  if (!parsed) { console.error('[ERROR] Invalid versioned naming.'); process.exit(1); }
  var sourceVersion = parsed.version, taskSlug = parsed.slug;
  var archiveFile = path.join(archiveDir, sourceVersion + '-' + taskSlug + '.md');
  if (!fs.existsSync(archiveFile)) { console.error('[ERROR] Archive file not found: ' + archiveFile); process.exit(1); }
  var newSpec = path.join(specsDir, sourceVersion + '-' + taskSlug + '.md');
  if (fs.existsSync(newSpec)) { console.error('[ERROR] Patch spec already exists.'); process.exit(1); }
  if (!fs.existsSync(designDir)) fs.mkdirSync(designDir, { recursive: true });
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  var specRel = common.relativeToProject(projectDir, newSpec);
  var designOut = patchMode === 'micro' ? '' : path.join(designDir, sourceVersion + '-' + taskSlug + '.design.md');
  var designRel = designOut ? common.relativeToProject(projectDir, designOut) : '';
  var logOut = path.join(logsDir, sourceVersion + '-' + taskSlug + '.execute.md');
  var logRel = common.relativeToProject(projectDir, logOut);
  if (designOut && fs.existsSync(designOut)) { console.error('[ERROR] Patch design artifact already exists.'); process.exit(1); }
  if (fs.existsSync(logOut)) { console.error('[ERROR] Patch execute log artifact already exists.'); process.exit(1); }
  var todayIso = new Date().toISOString().slice(0, 10);
  var contextRelative = archiveFile;
  if (archiveFile.indexOf(projectDir) === 0) contextRelative = archiveFile.slice(projectDir.length + 1);
  var templateContent = fs.readFileSync(specTemplate, 'utf-8');
  templateContent = templateContent.replace(/date: YYYY-MM-DD/, 'date: ' + todayIso);
  templateContent = templateContent.replace(/task-name: "Task Name Placeholder"/, 'task-name: "' + taskSlug + '"');
  templateContent = templateContent.replace(/^reopened-from:.*/m, 'reopened-from: "' + sourceVersion + '"');
  templateContent = templateContent.replace(/^context-source:.*/m, 'context-source: "' + contextRelative + '"');
  templateContent = templateContent.replace(/^design-file:.*/gm, 'design-file: "' + yamlQuote(designRel) + '"');
  templateContent = templateContent.replace(/^execute-log-file:.*/gm, 'execute-log-file: "' + yamlQuote(logRel) + '"');
  var archiveNote = '<!-- Reopened from archived context: ' + contextRelative + (defectSummary ? ' | defect: ' + defectSummary : '') + ' -->';
  var lines = templateContent.split(/\r?\n/);
  var resultLines = [], fmCount = 0, injected = false;
  lines.forEach(function(line) {
    resultLines.push(line);
    if (!injected && line === '---') { fmCount++; if (fmCount === 2) { resultLines.push(''); resultLines.push(archiveNote); injected = true; } }
  });
  var output = resultLines.join('\n') + '\n<!-- Source Spec: ' + sourceBname + ' -->\n';
  fs.writeFileSync(newSpec, output, 'utf-8');
  if (designOut) {
    var designTemplate = path.join(common.SCAFFOLD_ROOT, 'templates', patchMode === 'lite' ? 'design-lite.md' : 'design-standard.md');
    fs.writeFileSync(designOut, fillArtifactTemplate(designTemplate, taskSlug, patchMode, todayIso, specRel), 'utf-8');
  }
  var logTemplate = path.join(common.SCAFFOLD_ROOT, 'templates', 'execute-log.md');
  fs.writeFileSync(logOut, fillArtifactTemplate(logTemplate, taskSlug, patchMode, todayIso, specRel), 'utf-8');
  console.log('[CREATE] ' + newSpec);
  if (designOut) console.log('[DESIGN] ' + designOut);
  console.log('[LOG] ' + logOut);
  console.log('Reopened from: ' + sourceBname);
  console.log('Archive context: ' + archiveFile);
  console.log('Run: sdd resume "' + projectDir + '"');
}
module.exports = run;
