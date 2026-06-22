var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function run(projectDir, opts) {
  var docsDir = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDir);
  if (!fs.existsSync(docsRoot)) { console.error('[ERROR] Not initialized.'); process.exit(1); }
  var contextDir = path.join(docsRoot, 'context');
  if (!fs.existsSync(contextDir)) fs.mkdirSync(contextDir, { recursive: true });
  if (!opts.version) { console.error('[ERROR] --spec-version/--version is required'); process.exit(3); }
  if (!/^v\d+\.\d+$/.test(opts.version)) {
    console.error('[ERROR] Invalid version format. Expected: v{N}.{M}');
    process.exit(3);
  }
  var bundleVersion = opts.version;
  var bundleName = opts.out || 'context-bundle';
  var outFile = path.join(contextDir, bundleVersion + '-' + bundleName + '.md');
  console.log('SDD_OUTPUT_PATH: ' + outFile);
  var sourcesList = '';
  if (opts.sources && fs.existsSync(opts.sources)) {
    try {
      var files = fs.readdirSync(opts.sources).filter(function(f) { return !f.startsWith('.') && fs.statSync(path.join(opts.sources, f)).isFile(); });
      sourcesList = files.map(function(f) { return path.join(opts.sources, f); }).join('\n');
    } catch (e) {}
  }
  console.log('## BUILD CONTEXT BUNDLE PROMPT');
  console.log('### Target: ' + outFile);
  console.log('### Sources: ' + (opts.sources || '(none)'));
  if (sourcesList) console.log('### Source files:\n' + sourcesList);
  console.log('### AI: Extract key info from sources, combine with project docs, write to target.');
}
module.exports = run;
