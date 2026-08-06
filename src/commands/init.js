const fs = require('fs');
const path = require('path');
const { getDocsDir, isValidDocsDirName } = require('../../lib/common');
const governanceContract = require('../core/governance-contract');
const genAiConfigs = require('./_gen-ai-configs');

function run(projectDir, opts) {
  var mode = opts.mode || governanceContract.defaults.mode;
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

  ['specs','design','logs','learnings','runs','context','archive'].forEach(function(subdir) {
    var d = path.join(projectDir, docsDir, subdir);
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    var gk = path.join(d, '.gitkeep');
    if (!fs.existsSync(gk)) { fs.writeFileSync(gk, '', 'utf-8'); created++; }
  });
  var profileRevisions = path.join(projectDir, docsDir, 'profiles', 'revisions');
  if (!fs.existsSync(profileRevisions)) fs.mkdirSync(profileRevisions, { recursive: true });
  var profileKeep = path.join(profileRevisions, '.gitkeep');
  if (!fs.existsSync(profileKeep)) { fs.writeFileSync(profileKeep, '', 'utf-8'); created++; }

  var configFile = path.join(projectDir, '.sdd-config');
  var configContent = [
    'DOCS_DIR="' + docsDir + '"',
    'APPROVAL_POLICY="' + governanceContract.defaults.approvalPolicy + '"',
    'CRUISE_MAX_ITERATIONS="' + governanceContract.defaults.cruiseMaxIterations + '"',
    ''
  ].join('\n');

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

  console.log("Use 'sdd discover <dir> --task-name <name> --version <vN.M|vN.M.P> ...' to create your first spec.");
  console.log('SDD initialized in ' + projectDir + '. Created: ' + created + ' files, Skipped: ' + skipped + ' files.');
}

module.exports = run;
