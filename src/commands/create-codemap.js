var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function run(projectDir, opts) {
  var docsDir = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDir);
  if (!fs.existsSync(docsRoot)) { console.error('[ERROR] Not initialized.'); process.exit(1); }
  var codemapDir = path.join(docsRoot, 'codemap');
  if (!fs.existsSync(codemapDir)) fs.mkdirSync(codemapDir, { recursive: true });
  var moduleName = opts.module || 'main';
  var codemapFile = path.join(codemapDir, moduleName + '.md');
  var existing = fs.existsSync(codemapFile) ? fs.readFileSync(codemapFile, 'utf-8') : '';
  console.log('## CREATE CODEMAP PROMPT');
  console.log('### Module: ' + moduleName);
  console.log('### Target: ' + codemapFile);
  if (existing) { console.log('### Existing (UPDATE mode):'); console.log(existing); }
  console.log('### AI: Fill CodeMap with entry points, module boundaries, key components, call chains, dependencies, risks.');
}
module.exports = run;
