var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function run(projectDir, specName, opts) {
  var docsRoot = common.getDocsRoot(projectDir);
  var specsDir = path.join(docsRoot, 'specs');
  var archiveDir = path.join(docsRoot, 'archive');
  var force = !!opts.force;
  if (!fs.existsSync(specsDir)) { console.error('[ERROR] ' + specsDir + ' not found.'); process.exit(1); }
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  var specSlug = common.normalizeSlug(specName);
  var sourceSpec = common.findSourceSpec(specsDir, specSlug);
  if (!sourceSpec) {
    console.error('[ERROR] No versioned spec matching ' + specSlug + ' found.');
    process.exit(1);
  }
  var sourceBname = path.basename(sourceSpec);
  var specVersion = 'v1.0';
  var vm = sourceBname.match(/^(v\d+\.\d+)-.+\.md$/);
  if (vm) specVersion = vm[1];
  var archiveFile = path.join(archiveDir, specVersion + '-' + specSlug + '.md');
  if (fs.existsSync(archiveFile) && !force) { console.error('[ERROR] Archive already exists. Use --force.'); process.exit(1); }
  var dateIso = new Date().toISOString().slice(0, 10);
  var sourceContent = fs.readFileSync(sourceSpec, 'utf-8');
  sourceContent = sourceContent.replace(/^status:[ \t]*[^\s#]*/m, 'status: archived');
  var summary = '\n---\n<!-- Archive summary on ' + dateIso + ' -->\n\n## 目标摘要\n<!-- (not filled) -->\n\n## 最终方案\n<!-- (not filled) -->\n\n## 关键约束\n<!-- (not filled) -->\n\n## 坑点与风险\n<!-- (not filled) -->\n';
  fs.writeFileSync(archiveFile, sourceContent + summary, 'utf-8');
  fs.unlinkSync(sourceSpec);
  var indexFile = path.join(archiveDir, 'index.md');
  if (!fs.existsSync(indexFile)) {
    fs.writeFileSync(indexFile, '# Archive Index\n| File | Date | Task | Verdict |\n|---|---|---|---|\n');
  }
  var taskNameVal = common.getFrontmatterField(archiveFile, 'task-name') || specSlug;
  var verdictVal = '—';
  try {
    var vc = common.extractSection(archiveFile, 'Review (Verdict|Summary)', 5);
    if (vc) { var vlines = vc.split(/\r?\n/); for (var i = 0; i < vlines.length; i++) { var t = vlines[i].trim(); if (t && !t.startsWith('<!--')) { verdictVal = t; break; } } }
  } catch (e) {}
  fs.appendFileSync(indexFile, '| ' + path.basename(archiveFile) + ' | ' + dateIso + ' | ' + taskNameVal + ' | ' + verdictVal + ' |\n');
  console.log('[ARCHIVE] ' + archiveFile);
  console.log('[INDEX]   ' + indexFile);
  console.log('[MOVED] ' + sourceBname + ' -> archive/' + path.basename(archiveFile));
}
module.exports = run;
