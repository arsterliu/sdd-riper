const fs = require('fs');
const path = require('path');
const { getDocsDir, isValidDocsDirName, shouldSuggestCodeMap } = require('../../lib/common');
const genAiConfigs = require('./_gen-ai-configs');

var SDD_PROTOCOL_VERSION = '1.0';

function run(projectDir, opts) {
  var mode = opts.mode || 'standard';
  if (['standard','lite','micro'].indexOf(mode) === -1) {
    console.error('[ERROR] Invalid mode: ' + mode + ' (expected standard|lite|micro)');
    process.exit(3);
  }
  var docsDir = opts.docsDir || 'mydocs';
  var docsDirExplicit = !!opts.docsDir;
  var force = !!opts.force;

  if (!docsDirExplicit && fs.existsSync(path.join(projectDir, '.sdd-config')) && !force) {
    docsDir = getDocsDir(projectDir);
  }
  if (!isValidDocsDirName(docsDir)) {
    console.error('[ERROR] --docs-dir must be a plain directory name');
    process.exit(3);
  }
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

  var created = 0, skipped = 0;

  ['specs','design','logs','codemap','context','archive'].forEach(function(subdir) {
    var d = path.join(projectDir, docsDir, subdir);
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    var gk = path.join(d, '.gitkeep');
    if (!fs.existsSync(gk)) { fs.writeFileSync(gk, '', 'utf-8'); created++; }
  });

  var configFile = path.join(projectDir, '.sdd-config');
  var configContent = 'DOCS_DIR="' + docsDir + '"\nMODE="' + mode + '"\nSDD_VERSION="' + SDD_PROTOCOL_VERSION + '"\n';

  if (fs.existsSync(configFile) && !force) {
    var existingDocs = getDocsDir(projectDir);
    if (existingDocs === docsDir) {
      console.log('[SKIP] ' + configFile + ' already exists');
      skipped++;
    } else {
      fs.writeFileSync(configFile, configContent, 'utf-8');
      console.log('[CREATE] ' + configFile);
      created++;
    }
  } else {
    fs.writeFileSync(configFile, configContent, 'utf-8');
    console.log('[CREATE] ' + configFile);
    created++;
  }

  var aiResult = genAiConfigs.run(projectDir, mode, force);
  created += aiResult.created;
  skipped += aiResult.skipped;

  var suggestion = shouldSuggestCodeMap(projectDir, docsDir);
  if (suggestion) console.log(suggestion);

  console.log("Use 'sdd discover <dir> --task-name <name> --version v1.0 ...' to create your first spec.");
  console.log('SDD initialized in ' + projectDir + '. Created: ' + created + ' files, Skipped: ' + skipped + ' files.');
}

module.exports = run;
