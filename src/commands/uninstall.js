const fs = require('fs');
const uninstall = require('../core/uninstall');

function run(projectDir) {
  if (!fs.existsSync(projectDir)) {
    console.error('[ERROR] Project directory does not exist: ' + projectDir);
    process.exit(3);
  }
  const result = uninstall.run(projectDir);
  result.removed.forEach(function(file) { console.log('[REMOVE] ' + file); });
  result.updated.forEach(function(file) { console.log('[UPDATE] ' + file); });
  result.skipped.forEach(function(file) { console.log('[KEEP] ' + file); });
  console.log('SDD uninstalled from ' + projectDir + '. Removed: ' + result.removed.length + ', Updated: ' + result.updated.length + ', Kept: ' + result.skipped.length + '.');
}

module.exports = run;
