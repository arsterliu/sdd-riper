var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function run(projectDir, opts) {
  var docsDir = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDir);
  if (!fs.existsSync(docsRoot)) { console.error('[ERROR] Not initialized.'); process.exit(1); }
  var pmFile = path.join(docsRoot, 'projectmap.md');
  if (fs.existsSync(pmFile) && !opts.force) { console.error('[ERROR] projectmap.md exists. Use --force.'); process.exit(2); }
  var repos = opts.repos ? opts.repos.split(',').map(function(s) { return s.trim(); }) : [];
  console.log('## CREATE PROJECTMAP PROMPT');
  console.log('### Target: ' + pmFile);
  console.log('### Repos: ' + (repos.length ? repos.join(', ') : '(not specified)'));
  console.log('### AI: Fill ProjectMap with repo responsibilities, boundaries, contracts.');
}
module.exports = run;
