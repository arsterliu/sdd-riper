var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

var SECTION = {
  invocation: 'Invocation',
  confirmedRequirement: 'Confirmed Requirement',
  openQuestions: 'Open Questions',
  innovateOptions: 'Innovate Options',
  technicalDesign: 'Technical Design',
  designNote: 'Design Note',
  acceptanceCriteria: 'Acceptance Criteria',
  executeLog: 'Execute Log',
  review: 'Review (Verdict|Summary)'
};

function extractSectionText(filePath, pattern) {
  return common.extractSection(filePath, pattern, 400);
}

function firstRealLine(section) {
  var visible = stripHtmlComments(section);
  return visible.split(/\r?\n/).map(function(line) { return line.trim(); }).find(function(line) {
    return line &&
      !line.startsWith('|') &&
      !/^#+\s/.test(line) &&
      !/^[A-Za-z][A-Za-z0-9 /_-]*:\s*$/.test(line) &&
      !/^[-:]+$/.test(line);
  }) || '';
}

function sectionHasRealContent(filePath, pattern) {
  return !!firstRealLine(extractSectionText(filePath, pattern));
}

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

function planHasMicroAcceptance(filePath) {
  var plan = stripHtmlComments(extractSectionText(filePath, 'Plan'));
  return /(^|\n)Acceptance:[\s\S]*?(^|\n)Verification:/i.test(plan) &&
    /(^|\n)Verification:[\s\S]*\S/i.test(plan);
}

function artifactHasContent(projectDir, specPath, field, sectionPattern) {
  var ref = common.getFrontmatterField(specPath, field);
  if (!ref) return false;
  var artifactPath = common.resolveProjectPath(projectDir, ref);
  if (!fs.existsSync(artifactPath)) return false;
  return sectionHasRealContent(artifactPath, sectionPattern);
}

function run(projectDir) {
  var docsDir = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDir);
  var exitCode = 0;
  console.log('[SDD Status] ' + projectDir);

  var missingDirs = [];
  ['specs','design','logs','learnings','codemap','context','archive'].forEach(function(d) {
    if (!fs.existsSync(path.join(docsRoot, d))) missingDirs.push(docsDir + '/' + d);
  });
  if (missingDirs.length === 0) console.log('  Structure:    OK');
  else { console.log('  Structure:    MISSING (' + missingDirs.join(' ') + ')'); exitCode = 1; }

  var aiConfigs = ['AGENTS.md','CLAUDE.md','.cursorrules','.github/copilot-instructions.md'];
  var foundConfig = aiConfigs.find(function(f) { return fs.existsSync(path.join(projectDir, f)); });
  console.log('  AI Config:    ' + (foundConfig ? 'OK (' + foundConfig + ' found)' : 'WARN (none found)'));

  var pmFile = path.join(docsRoot, 'projectmap.md');
  if (fs.existsSync(pmFile)) {
    var pmContent = fs.readFileSync(pmFile, 'utf-8');
    if (/^name:/m.test(pmContent) && /^repos:/m.test(pmContent)) console.log('  ProjectMap:   OK');
    else { console.log('  ProjectMap:   ERROR (broken frontmatter)'); if (exitCode < 2) exitCode = 2; }
  } else console.log('  ProjectMap:   WARN (no projectmap.md found)');

  var codemapDir = path.join(docsRoot, 'codemap');
  if (!fs.existsSync(codemapDir)) console.log('  CodeMap:      WARN (codemap/ directory missing)');
  else {
    var cmFiles = fs.readdirSync(codemapDir).filter(function(f) { return f.endsWith('.md') && f !== '.gitkeep'; }).sort();
    if (cmFiles.length === 0) console.log('  CodeMap:      OK (none)');
    else {
      var cmNames = cmFiles.map(function(f) { return f.replace(/\.md$/, ''); });
      var missingReason = [];
      cmFiles.forEach(function(f) {
        var c = fs.readFileSync(path.join(codemapDir, f), 'utf-8');
        if (!/^last-reason:/m.test(c)) missingReason.push(f);
      });
      if (missingReason.length) console.log('  CodeMap:      WARN (' + cmFiles.length + ' modules: ' + cmNames.join(',') + '; missing last-reason in: ' + missingReason.join(' '));
      else console.log('  CodeMap:      OK (' + cmFiles.length + ' modules: ' + cmNames.join(',') + ')');
    }
  }

  var specsDir = path.join(docsRoot, 'specs');
  var total = 0, draft = 0;
  var warnResearch = [], warnInnovate = [], warnDesign = [], warnAcceptance = [], warnPlan = [], warnExecuteLog = [], warnReview = [];
  if (fs.existsSync(specsDir)) {
    fs.readdirSync(specsDir).forEach(function(f) {
      if (f === '.gitkeep' || !f.endsWith('.md')) return;
      var sp = path.join(specsDir, f);
      total++;
      var st = common.getFrontmatterField(sp, 'status') || 'draft';
      if (st !== 'archived') draft++;
      var sm = common.getFrontmatterField(sp, 'mode') || 'standard';
      var lw = 0;
      if (sm === 'lite') { if (common.sectionIsEmpty(sp, SECTION.invocation)) lw = 1; if (common.sectionIsEmpty(sp, SECTION.openQuestions)) lw = 1; }
      else if (sm === 'micro') { if (common.sectionIsEmpty(sp, SECTION.invocation)) lw = 1; }
      else { if (common.subsectionIsEmpty(sp, SECTION.confirmedRequirement)) lw = 1; if (common.subsectionIsEmpty(sp, SECTION.openQuestions)) lw = 1; }
      try { if (/\[待确认\]/.test(fs.readFileSync(sp, 'utf-8'))) lw = 1; } catch (e) {}
      if (lw) warnResearch.push(f);
      if (common.sectionIsEmpty(sp, SECTION.innovateOptions)) {
        try { var c = fs.readFileSync(sp, 'utf-8'); if (/^## Innovate Options/m.test(c) && !/Innovate: Skipped/.test(c)) warnInnovate.push(f); } catch (e) {}
      }
      if (sm === 'standard') {
        if (!artifactHasContent(projectDir, sp, 'design-file', SECTION.technicalDesign)) warnDesign.push(f);
        if (!sectionHasRealContent(sp, SECTION.acceptanceCriteria)) warnAcceptance.push(f);
      } else if (sm === 'lite') {
        if (!artifactHasContent(projectDir, sp, 'design-file', SECTION.designNote)) warnDesign.push(f);
        if (!sectionHasRealContent(sp, SECTION.acceptanceCriteria)) warnAcceptance.push(f);
      } else if (sm === 'micro') {
        if (!planHasMicroAcceptance(sp)) warnAcceptance.push(f);
      }
      if (!artifactHasContent(projectDir, sp, 'execute-log-file', SECTION.executeLog)) warnExecuteLog.push(f);
      try { var c2 = fs.readFileSync(sp, 'utf-8'); if (/Plan Approved By:/.test(c2) && /^Plan Approved By:[ \t]*$/m.test(c2)) warnPlan.push(f); } catch (e) {}
      if (common.sectionIsEmpty(sp, SECTION.review)) {
        try { var c3 = fs.readFileSync(sp, 'utf-8'); if (/^## Review (Verdict|Summary)/m.test(c3)) warnReview.push(f); } catch (e) {}
      }
    });
  }
  console.log('  Specs:        ' + total + ' total (' + draft + ' active)');
  console.log('  Research:     ' + (warnResearch.length ? 'WARN (empty/pending in: ' + warnResearch.join(' ') + ')' : 'OK'));
  console.log('  Innovate:     ' + (warnInnovate.length ? 'WARN (empty in: ' + warnInnovate.join(' ') + ')' : 'OK'));
  console.log('  Design:       ' + (warnDesign.length ? 'WARN (empty in: ' + warnDesign.join(' ') + ')' : 'OK'));
  console.log('  Acceptance:   ' + (warnAcceptance.length ? 'WARN (empty/incomplete in: ' + warnAcceptance.join(' ') + ')' : 'OK'));
  console.log('  Plan:         ' + (warnPlan.length ? 'WARN (missing approval in: ' + warnPlan.join(' ') + ')' : 'OK'));
  console.log('  Execute Log:  ' + (warnExecuteLog.length ? 'WARN (empty/missing in: ' + warnExecuteLog.join(' ') + ')' : 'OK'));
  console.log('  Review:       ' + (warnReview.length ? 'WARN (empty verdict in: ' + warnReview.join(' ') + ')' : 'OK'));
  process.exit(exitCode);
}
module.exports = run;
