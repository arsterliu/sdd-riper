var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var workflow = require('../core/workflow');

function run(projectDir) {
  var docsDir = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDir);
  var exitCode = 0;
  console.log('[SDD Status] ' + projectDir);

  var missingDirs = [];
  ['specs', 'design', 'logs', 'learnings', 'runs', 'context', 'archive'].forEach(function(dir) {
    if (!fs.existsSync(path.join(docsRoot, dir))) missingDirs.push(docsDir + '/' + dir);
  });
  if (missingDirs.length === 0) console.log('  Structure:    OK');
  else {
    console.log('  Structure:    MISSING (' + missingDirs.join(' ') + ')');
    exitCode = 1;
  }

  var aiConfigs = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.github/copilot-instructions.md'];
  var foundConfig = aiConfigs.find(function(file) { return fs.existsSync(path.join(projectDir, file)); });
  console.log('  AI Config:    ' + (foundConfig ? 'OK (' + foundConfig + ' found)' : 'WARN (none found)'));

  var specsDir = path.join(docsRoot, 'specs');
  var total = 0;
  var draft = 0;
  var warnResearch = [];
  var warnInnovate = [];
  var warnDesign = [];
  var warnAcceptance = [];
  var warnPlan = [];
  var warnExecuteLog = [];
  var warnChallenge = [];
  var blockerDetails = [];

  if (fs.existsSync(specsDir)) {
    fs.readdirSync(specsDir).forEach(function(file) {
      if (file === '.gitkeep' || !file.endsWith('.md')) return;
      var specPath = path.join(specsDir, file);
      total++;
      if ((common.getFrontmatterField(specPath, 'status') || 'draft') !== 'archived') draft++;

      var state = workflow.analyzeSpec(projectDir, specPath);
      if (state.gates.research.state !== 'pass') warnResearch.push(file);
      if (state.gates.innovate.state !== 'pass') warnInnovate.push(file);
      if (state.gates.design.state !== 'pass') warnDesign.push(file);
      if (state.gates.acceptance.state !== 'pass') warnAcceptance.push(file);
      if (state.gates.plan.state !== 'pass') warnPlan.push(file);
      if (state.gates.execute.state !== 'pass' || state.gates.completion.state !== 'pass') warnExecuteLog.push(file);
      if (state.gates.challenge.state !== 'pass') warnChallenge.push(file);
      state.blockerDetails.forEach(function(blocker) {
        blockerDetails.push({ file: file, blocker: blocker });
      });
    });
  }

  console.log('  Specs:        ' + total + ' total (' + draft + ' active)');
  console.log('  Research:     ' + (warnResearch.length ? 'WARN (empty/pending in: ' + warnResearch.join(' ') + ')' : 'OK'));
  console.log('  Innovate:     ' + (warnInnovate.length ? 'WARN (empty in: ' + warnInnovate.join(' ') + ')' : 'OK'));
  console.log('  Design:       ' + (warnDesign.length ? 'WARN (empty in: ' + warnDesign.join(' ') + ')' : 'OK'));
  console.log('  Acceptance:   ' + (warnAcceptance.length ? 'WARN (empty/incomplete in: ' + warnAcceptance.join(' ') + ')' : 'OK'));
  console.log('  Plan:         ' + (warnPlan.length ? 'WARN (missing approval in: ' + warnPlan.join(' ') + ')' : 'OK'));
  console.log('  Execute Log:  ' + (warnExecuteLog.length ? 'WARN (empty/missing in: ' + warnExecuteLog.join(' ') + ')' : 'OK'));
  console.log('  Challenge:    ' + (warnChallenge.length ? 'WARN (blocked/failed in: ' + warnChallenge.join(' ') + ')' : 'OK'));
  console.log('  BLOCKERS:');
  if (!blockerDetails.length) console.log('  - none');
  blockerDetails.forEach(function(item) {
    console.log('  - [' + item.blocker.code + '] ' + item.file + ': ' + item.blocker.message);
  });
  var latestSpec = common.findLatestSpec(specsDir);
  if (latestSpec) {
    var profileRevision = common.getFrontmatterField(latestSpec, 'project-profile-revision');
    if (profileRevision) {
      console.log('PROJECT_PROFILE_REVISION: ' + profileRevision);
      console.log('PROJECT_PROFILE_DIGEST: ' + common.getFrontmatterField(latestSpec, 'project-profile-digest'));
      console.log('AFFECTED_UNITS: ' + common.getFrontmatterField(latestSpec, 'affected-units'));
    }
  }
  process.exit(exitCode);
}

module.exports = run;
