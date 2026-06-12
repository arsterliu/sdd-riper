var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function run(projectDir, moduleName, opts) {
  var docsDir = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDir);
  if (!fs.existsSync(docsRoot)) { console.error('[ERROR] Not initialized.'); process.exit(1); }
  var codemapDir = path.join(docsRoot, 'codemap');
  if (!fs.existsSync(codemapDir)) fs.mkdirSync(codemapDir, { recursive: true });
  var version = opts.version || 'v1.0';
  var outFile = path.join(codemapDir, moduleName + '.md');
  if (fs.existsSync(outFile) && !opts.force) { console.error('[ERROR] Already exists. Use --force.'); process.exit(2); }
  var content = '---\nmodule: ' + moduleName + '\nversion: ' + version + '\nlast-reason: (fill me)\n---\n\n# ' + moduleName + ' CodeMap\n\n## Entry Points\n\n## Core Call Chain\n\n## External Dependencies\n\n## Risks\n';
  fs.writeFileSync(outFile, content, 'utf-8');
  console.log('[CREATE] ' + outFile);
}
module.exports = run;
