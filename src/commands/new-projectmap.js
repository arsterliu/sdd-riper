var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function run(projectDir, opts) {
  var docsDir = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDir);
  if (!fs.existsSync(docsRoot)) { console.error('[ERROR] Not initialized.'); process.exit(1); }
  var pmFile = path.join(docsRoot, 'projectmap.md');
  if (fs.existsSync(pmFile) && !opts.force) { console.error('[ERROR] Already exists. Use --force.'); process.exit(2); }
  var repos = opts.repos ? opts.repos.split(',').map(function(s) { return '  - ' + s.trim(); }).join('\n') : '  - (fill me)';
  var content = '---\nname: (fill me)\nrepos:\n' + repos + '\nversion: v1.0\n---\n\n# ProjectMap\n\n## Repo Responsibilities\n\n## Boundaries\n\n## Workflow\n\n## Risks\n';
  fs.writeFileSync(pmFile, content, 'utf-8');
  console.log('[CREATE] ' + pmFile);
}
module.exports = run;
