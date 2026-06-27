var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var learning = require('../core/learning');

function snippet(text, n) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  if (!text) return '(empty)';
  return text.length > n ? text.slice(0, n) + '…' : text;
}

// `sdd learnings <dir>`           -> project-level aggregation of every learning
// `sdd learnings <dir> --for <s>` -> relevance-ranked recall for one spec
function run(projectDir, opts) {
  opts = opts || {};
  var docsRoot = common.getDocsRoot(projectDir);
  if (!fs.existsSync(docsRoot)) { console.error('[ERROR] Not initialized.'); process.exit(1); }

  if (opts.for) {
    var specPath = common.resolveProjectPath(projectDir, opts.for);
    if (!fs.existsSync(specPath)) specPath = path.join(docsRoot, 'specs', opts.for);
    if (!fs.existsSync(specPath)) { console.error('[ERROR] Spec not found: ' + opts.for); process.exit(1); }
    var query = [
      common.getFrontmatterField(specPath, 'task-name') || '',
      common.extractSection(specPath, 'Intake', 80),
      common.extractSection(specPath, 'Plan', 100)
    ].join(' ');
    var hits = learning.recallLearnings(projectDir, query, parseInt(opts.limit, 10) || 5);
    console.log('## LEARNING RECALL (relevance-ranked)');
    console.log('> for spec: ' + common.relativeToProject(projectDir, specPath));
    if (!hits.length) { console.log('(no Learning Records found)'); return; }
    hits.forEach(function(filePath) {
      console.log('');
      console.log('### ' + common.relativeToProject(projectDir, filePath));
      console.log(common.extractSection(filePath, 'Learning Record', 80) || '(empty Learning Record)');
    });
    return;
  }

  var index = learning.buildLearningIndex(projectDir);
  console.log('## PROJECT LEARNINGS (' + index.length + ')');
  if (!index.length) { console.log('(no Learning Records found)'); return; }
  index.forEach(function(item) {
    console.log('');
    console.log('### ' + item.taskName + '  —  ' + item.relativePath);
    console.log('Applies When: ' + snippet(item.appliesWhen, 160));
    console.log('Decision Rule: ' + snippet(item.decisionRule, 160));
  });
}

module.exports = run;
