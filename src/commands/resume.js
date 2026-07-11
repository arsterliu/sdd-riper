var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var learning = require('../core/learning');
var workflow = require('../core/workflow');

function run(projectDir) {
  var docsDir = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDir);
  if (!fs.existsSync(docsRoot)) {
    console.error('[ERROR] Project not initialized. Run: sdd init <dir>');
    process.exit(1);
  }
  var specsDir = path.join(docsRoot, 'specs');
  var allFiles = fs.existsSync(specsDir)
    ? fs.readdirSync(specsDir).filter(function(f) { return f.endsWith('.md') && f !== '.gitkeep'; })
    : [];
  var specCount = allFiles.length;
  var latestSpec = common.findLatestSpec(specsDir);
  if (!latestSpec && allFiles.length > 0) {
    var bestMtime = 0;
    allFiles.forEach(function(f) {
      var fp = path.join(specsDir, f);
      try { var st = fs.statSync(fp); if (st.mtimeMs > bestMtime) { bestMtime = st.mtimeMs; latestSpec = fp; } } catch (e) {}
    });
  }
  var specStatus = 'none', phaseHint = 'unknown';
  if (latestSpec && fs.existsSync(latestSpec)) {
    specStatus = common.getFrontmatterField(latestSpec, 'status') || 'none';
    if (specStatus === 'archived') {
      phaseHint = 'new_task';
    } else {
      var state = workflow.analyzeSpec(projectDir, latestSpec);
      var action = state.nextAction || '';
      if (action === 'archive_ready') {
        phaseHint = 'archive';
      } else if (action === 'run_challenge') {
        phaseHint = 'challenge';
      } else if (/^repair_(research|design|acceptance|plan|spec)/.test(action)) {
        phaseHint = 'research_or_plan';
      } else if (/^repair_(execute|execute_log|code|log)/.test(action)) {
        phaseHint = 'execute';
      } else if (/^repair_learning_check/.test(action)) {
        phaseHint = 'archive';
      } else {
        phaseHint = 'research_or_plan';
      }
    }
  } else {
    phaseHint = 'new_task';
  }
  var learningCount = learning.listLearningFiles(projectDir, 10000).length;
  var hasLearnings = learningCount > 0 ? 'yes' : 'no';
  var relevantLearnings = [];
  if (hasLearnings === 'yes' && latestSpec) {
    var specContent = fs.readFileSync(latestSpec, 'utf-8');
    relevantLearnings = learning.recallLearnings(projectDir, specContent, 3);
  }
  var sectionsHint;
  switch (phaseHint) {
    case 'new_task': sectionsHint = '(none)'; break;
    case 'research_or_plan': sectionsHint = 'Summary,Intake,Research,Innovate Options,Design Reference,Acceptance Criteria,Plan'; break;
    case 'execute': sectionsHint = 'Summary,Plan,Execute Log Reference'; break;
    case 'challenge': sectionsHint = 'Summary,Design Reference,Execute Log Reference,Completion Verification,Challenge Verdict'; break;
    case 'archive': sectionsHint = 'Summary,Design Reference,Execute Log Reference,Completion Verification,Challenge Verdict'; break;
    default: sectionsHint = 'Summary,Intake,Plan'; break;
  }
  console.log('[SDD Resume] ' + projectDir);
  console.log('DOCS_DIR: ' + docsDir);
  console.log('ACTIVE_SPECS: ' + specCount);
  console.log('LATEST_SPEC: ' + (latestSpec || 'none'));
  console.log('SPEC_STATUS: ' + specStatus);
  console.log('HAS_LEARNINGS: ' + hasLearnings);
  if (hasLearnings === 'yes') console.log('LEARNING_RECORDS: ' + learningCount);
  if (relevantLearnings.length) {
    console.log('RELEVANT_LEARNINGS:');
    relevantLearnings.forEach(function(lp) {
      console.log('- ' + lp);
    });
  }
  console.log('PHASE_HINT: ' + phaseHint);
  console.log('SECTIONS_HINT: ' + sectionsHint);
  if (latestSpec && fs.existsSync(latestSpec)) {
    var ctxSrc = common.getFrontmatterField(latestSpec, 'context-source');
    if (ctxSrc) console.log('CONTEXT_SOURCE: ' + ctxSrc);
  }
}
module.exports = run;
