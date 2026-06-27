var execFileSync = require('child_process').execFileSync;
var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var learning = require('../core/learning');

// A git revision/ref safe to pass as an argument. Rejects shell metacharacters,
// whitespace, and leading '-' (which git would treat as an option).
function isSafeGitRef(ref) {
  return typeof ref === 'string' && /^[A-Za-z0-9_./~^@-]+$/.test(ref) && !/^-/.test(ref);
}

function git(projectDir, args, capture) {
  var opts = capture
    ? { cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    : { cwd: projectDir, stdio: 'ignore' };
  return execFileSync('git', args, opts);
}

var SECTION = {
  intake: 'Intake',
  technicalDesign: 'Technical Design',
  designNote: 'Design Note',
  acceptanceCriteria: 'Acceptance Criteria',
  plan: 'Plan',
  executeLog: 'Execute Log'
};

function learningBrief(projectDir, queryText) {
  var files = learning.recallLearnings(projectDir, queryText || '', 5);
  if (!files.length) return '(no Learning Records found)';
  var header = (queryText && queryText.trim())
    ? '(relevance-ranked against the current spec; falls back to recency when no lexical match)'
    : '(most recent)';
  return header + '\n\n' + files.map(function(filePath) {
    var rel = common.relativeToProject(projectDir, filePath);
    var content = common.extractSection(filePath, 'Learning Record', 80) || '(empty Learning Record)';
    return '### ' + rel + '\n' + content;
  }).join('\n\n');
}

function resolveDiffBase(projectDir, explicitBase) {
  if (explicitBase) {
    if (isSafeGitRef(explicitBase)) return explicitBase;
    console.error('[WARN] Ignoring unsafe diff-base value: ' + explicitBase);
  }
  try {
    var headCommit = git(projectDir, ['rev-parse', 'HEAD'], true).trim();
    var currentBranch = '';
    try { currentBranch = git(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD'], true).trim(); } catch (e) {}
    var candidates = ['origin/main','origin/master','main','master','trunk'];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] === currentBranch) continue;
      try {
        git(projectDir, ['rev-parse', '--verify', candidates[i]], false);
        var mb = git(projectDir, ['merge-base', 'HEAD', candidates[i]], true).trim();
        if (mb && mb !== headCommit) return mb;
      } catch (e) {}
    }
    var cc = parseInt(git(projectDir, ['rev-list', '--count', 'HEAD'], true).trim(), 10);
    if (cc > 1) {
      try {
        var root = git(projectDir, ['rev-list', '--max-parents=0', 'HEAD'], true).trim().split(/\r?\n/).pop();
        if (root && root !== headCommit) return root;
      } catch (e) {}
      try { git(projectDir, ['rev-parse', '--verify', 'HEAD~1'], false); return 'HEAD~1'; } catch (e) {}
    }
  } catch (e) {}
  return '';
}

// Read-only diff of the working tree against HEAD (model B: a spec is committed
// only after archive, so its work lives uncommitted in the working tree during
// Review). Covers tracked changes (git diff HEAD) plus untracked files (which
// git diff HEAD omits) rendered as added-file diffs. Never mutates index/tree.
// Returns '' when not a git repo or HEAD is unusable.
function workingTreeDiff(projectDir) {
  var parts = [];
  try {
    var tracked = git(projectDir, ['diff', 'HEAD'], true);
    if (tracked && tracked.trim()) parts.push(tracked);
  } catch (e) {
    return '';
  }
  var untracked = '';
  try {
    untracked = git(projectDir, ['ls-files', '--others', '--exclude-standard'], true);
  } catch (e) {}
  untracked.split(/\r?\n/).forEach(function(f) {
    f = f.trim();
    if (!f) return;
    var out = '';
    // `git diff --no-index` exits 1 when files differ; the diff is on stdout
    // either way. /dev/null is a git-recognized sentinel on all platforms.
    try {
      out = execFileSync('git', ['diff', '--no-index', '--', '/dev/null', f], { cwd: projectDir, encoding: 'utf-8' });
    } catch (e) {
      out = e && e.stdout ? e.stdout : '';
    }
    if (out && out.trim()) parts.push(out);
  });
  return parts.join('\n');
}

function isInsideGitRepo(projectDir) {
  try { git(projectDir, ['rev-parse', '--is-inside-work-tree'], false); return true; } catch (e) { return false; }
}

function run(projectDir, opts) {
  var docsRoot = common.getDocsRoot(projectDir);
  if (!fs.existsSync(docsRoot)) { console.error('[ERROR] Not initialized.'); process.exit(1); }
  var specPath = opts.spec || '';
  if (!specPath) {
    specPath = common.findLatestSpec(path.join(docsRoot, 'specs'));
    if (!specPath) {
      try {
        var sd = path.join(docsRoot, 'specs');
        var files = fs.readdirSync(sd).filter(function(f) { return f.endsWith('.md') && f !== '.gitkeep'; });
        files.sort(function(a, b) { return fs.statSync(path.join(sd, b)).mtimeMs - fs.statSync(path.join(sd, a)).mtimeMs; });
        specPath = files[0] ? path.join(sd, files[0]) : '';
      } catch (e) {}
    }
  }
  var mode = specPath && fs.existsSync(specPath) ? common.getFrontmatterField(specPath, 'mode') || 'standard' : 'standard';
  var intakeContent = '(section not found)';
  var axis0Note = '';
  if (specPath && fs.existsSync(specPath)) { var ic = common.extractSection(specPath, SECTION.intake, 80); if (ic) intakeContent = ic; }
  if (!intakeContent || intakeContent === '(section not found)') axis0Note = '[WARN] Intake not found.';
  var designContent = '(not applicable)';
  if (specPath && fs.existsSync(specPath)) {
    var designRef = common.getFrontmatterField(specPath, 'design-file');
    var designPath = designRef ? common.resolveProjectPath(projectDir, designRef) : '';
    if (mode === 'standard') {
      designContent = designPath && fs.existsSync(designPath)
        ? common.extractSection(designPath, SECTION.technicalDesign, 120) || '(empty Technical Design)'
        : common.extractSection(specPath, SECTION.technicalDesign, 120) || '(missing Technical Design file)';
    } else if (mode === 'lite') {
      designContent = designPath && fs.existsSync(designPath)
        ? common.extractSection(designPath, SECTION.designNote, 80) || '(empty Design Note)'
        : common.extractSection(specPath, SECTION.designNote, 80) || '(missing Design Note file)';
    } else {
      designContent = '(micro mode: design and acceptance are embedded in Plan)';
    }
  }
  var acceptanceContent = '(not applicable)';
  if (specPath && fs.existsSync(specPath)) {
    if (mode === 'standard' || mode === 'lite') {
      acceptanceContent = common.extractSection(specPath, SECTION.acceptanceCriteria, 120) || '(empty Acceptance Criteria)';
    } else {
      acceptanceContent = '(micro mode: verify Impact Scope, Data Impact, Interface Impact, Acceptance, and Verification labels in Plan)';
    }
  }
  var planContent = '(no spec)';
  if (specPath && fs.existsSync(specPath)) { var pc = common.extractSection(specPath, SECTION.plan, 100); planContent = pc || '(empty)'; }
  var diffContent = '(no git diff)';
  var diffSource = 'unavailable';
  if (opts.diffBase) {
    // Branch model (opt-in): diff committed history base..HEAD.
    var diffBase = resolveDiffBase(projectDir, opts.diffBase);
    if (diffBase && isSafeGitRef(diffBase)) {
      try { diffContent = execFileSync('git', ['diff', diffBase, 'HEAD'], { cwd: projectDir, encoding: 'utf-8' }); diffSource = diffBase + '..HEAD'; } catch (e) {}
    }
  } else {
    // Working-tree model (default, model B): show this spec's uncommitted work.
    var wt = workingTreeDiff(projectDir);
    if (wt && wt.trim()) { diffContent = wt; diffSource = 'working tree'; }
    else if (isInsideGitRepo(projectDir)) { diffSource = 'working tree'; }
  }
  var diffLines = diffContent.split(/\r?\n/).length;
  if (diffLines > 500) {
    var dlines = diffContent.split(/\r?\n/);
    diffContent = dlines.slice(0, 500).join('\n') + '\n[TRUNCATED: 500/' + diffLines + ' lines]';
  }
  var executeLog = '(no Execute Log)';
  if (specPath && fs.existsSync(specPath)) {
    var logRef = common.getFrontmatterField(specPath, 'execute-log-file');
    var logPath = logRef ? common.resolveProjectPath(projectDir, logRef) : '';
    var el = logPath && fs.existsSync(logPath)
      ? common.extractSection(logPath, SECTION.executeLog, 100)
      : common.extractSection(specPath, SECTION.executeLog, 100);
    if (el) executeLog = el;
  }
  var learningQuery = [
    (specPath && fs.existsSync(specPath)) ? (common.getFrontmatterField(specPath, 'task-name') || '') : '',
    intakeContent === '(section not found)' ? '' : intakeContent,
    planContent
  ].join(' ');
  var learningContent = learningBrief(projectDir, learningQuery);

  console.log('## REVIEW EXECUTE PROMPT (4-Axis)');
  console.log('> Diff source: ' + diffSource);
  if (axis0Note) console.log(axis0Note);
  console.log('<!-- AXIS 0 BRIEF START -->');
  console.log('### Axis 0 — Intake Alignment [CONFIRMATION]');
  console.log(intakeContent);
  console.log('Finding: ALIGNED | DRIFTED | VIOLATED | UNVERIFIABLE');
  console.log('<!-- AXIS 0 BRIEF END -->');
  console.log('<!-- AXIS 1 BRIEF START -->');
  console.log('### Axis 1 — Design / Acceptance / Plan Coverage [CONFIRMATION]');
  console.log('#### Design Brief');
  console.log(designContent);
  console.log('#### Acceptance Brief');
  console.log(acceptanceContent);
  console.log('#### Plan Brief');
  console.log(planContent);
  console.log('Finding: FULL | PARTIAL | MISSING');
  console.log('<!-- AXIS 1 BRIEF END -->');
  console.log('<!-- AXIS 2 BRIEF START -->');
  console.log('### Axis 2 — Code Diff Scope [PRIMARY]');
  console.log(diffContent);
  console.log('Finding: IN_SCOPE | OUT_OF_SCOPE_MINOR | OUT_OF_SCOPE_MAJOR');
  console.log('<!-- AXIS 2 BRIEF END -->');
  console.log('<!-- AXIS 3 BRIEF START -->');
  console.log('### Axis 3 — Execute Log Fidelity [CONFIRMATION]');
  console.log(executeLog);
  console.log('Finding: FAITHFUL | DISCREPANCY');
  console.log('<!-- AXIS 3 BRIEF END -->');
  console.log('<!-- LEARNING BRIEF START -->');
  console.log('### Learning Brief');
  console.log(learningContent);
  console.log('Finding: NEW_LESSON_REQUIRED | EXISTING_RULE_APPLIES | NO_REUSABLE_LESSON');
  console.log('<!-- LEARNING BRIEF END -->');
  console.log('### Verdict: PASS | PASS_WITH_CONCERNS | FAIL_CODE | FAIL_PLAN | FAIL_SPEC');
}
module.exports = run;
