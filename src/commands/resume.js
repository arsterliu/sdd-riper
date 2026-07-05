var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var learning = require('../core/learning');

function executeCompletionDone(projectDir, specPath) {
  var ref = common.getFrontmatterField(specPath, 'execute-log-file');
  if (!ref) return false;
  var logPath = common.resolveProjectPath(projectDir, ref);
  if (!logPath || !fs.existsSync(logPath)) return false;
  var content = fs.readFileSync(logPath, 'utf-8');
  return common.completionVerificationDone(content);
}

function challengeRecorded(content) {
  return /^[ \t]*Challenge Executed By:[ \t]*\S/m.test(content || '') &&
    /^[ \t]*Challenge Executed At:[ \t]*\S/m.test(content || '') &&
    /^[ \t]*Challenge Evidence:[ \t]*\S/m.test(content || '');
}

function labelValue(content, label) {
  var escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var m = String(content || '').match(new RegExp('^' + escaped + ':[ \\t]*(.+)$', 'mi'));
  return m ? m[1].trim() : '';
}

function challengeStale(projectDir, specPath, content) {
  var executedAt = labelValue(content, 'Challenge Executed At');
  if (!executedAt) return false;
  var challengeTime = new Date(executedAt);
  if (Number.isNaN(challengeTime.getTime())) return false;
  var ref = common.getFrontmatterField(specPath, 'execute-log-file');
  if (!ref) return false;
  var logPath = common.resolveProjectPath(projectDir, ref);
  if (!logPath || !fs.existsSync(logPath)) return false;
  var lastStepTime = common.extractLastStepTimestamp(fs.readFileSync(logPath, 'utf-8'));
  return !!(lastStepTime && challengeTime <= lastStepTime);
}

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
      var content = fs.readFileSync(latestSpec, 'utf-8');
      if (/^[ \t]*Plan Approved By:[ \t]*[^\s].*/m.test(content)) {
        if (!executeCompletionDone(projectDir, latestSpec)) {
          phaseHint = 'execute';
        } else if (!challengeRecorded(content) || challengeStale(projectDir, latestSpec, content)) {
          phaseHint = 'challenge';
        } else {
          phaseHint = 'archive';
        }
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
