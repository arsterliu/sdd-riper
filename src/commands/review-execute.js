var execSync = require('child_process').execSync;
var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function resolveDiffBase(projectDir, explicitBase) {
  if (explicitBase) return explicitBase;
  try {
    var headCommit = execSync('git rev-parse HEAD', { cwd: projectDir, encoding: 'utf-8' }).trim();
    var currentBranch = '';
    try { currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectDir, encoding: 'utf-8' }).trim(); } catch (e) {}
    var candidates = ['origin/main','origin/master','main','master','trunk'];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] === currentBranch) continue;
      try {
        execSync('git rev-parse --verify ' + candidates[i], { cwd: projectDir, stdio: 'ignore' });
        var mb = execSync('git merge-base HEAD ' + candidates[i], { cwd: projectDir, encoding: 'utf-8' }).trim();
        if (mb && mb !== headCommit) return mb;
      } catch (e) {}
    }
    var cc = parseInt(execSync('git rev-list --count HEAD', { cwd: projectDir, encoding: 'utf-8' }).trim(), 10);
    if (cc > 1) {
      try { execSync('git rev-parse --verify HEAD~1', { cwd: projectDir, stdio: 'ignore' }); return 'HEAD~1'; } catch (e) {}
    }
  } catch (e) {}
  return '';
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
  var invocationContent = '(section not found)';
  var axis0Note = '';
  if (specPath && fs.existsSync(specPath)) { var ic = common.extractSection(specPath, 'Invocation', 80); if (ic) invocationContent = ic; }
  if (!invocationContent || invocationContent === '(section not found)') axis0Note = '[WARN] Invocation not found.';
  var planContent = '(no spec)';
  if (specPath && fs.existsSync(specPath)) { var pc = common.extractSection(specPath, 'Plan', 100); planContent = pc || '(empty)'; }
  var diffBase = resolveDiffBase(projectDir, opts.diffBase || '');
  var diffContent = '(no git diff)';
  var diffSource = 'unavailable';
  if (diffBase) {
    try { diffContent = execSync('git diff ' + diffBase + ' HEAD', { cwd: projectDir, encoding: 'utf-8' }); diffSource = diffBase + '..HEAD'; } catch (e) {}
  }
  var diffLines = diffContent.split(/\r?\n/).length;
  if (diffLines > 500) {
    var dlines = diffContent.split(/\r?\n/);
    diffContent = dlines.slice(0, 500).join('\n') + '\n[TRUNCATED: 500/' + diffLines + ' lines]';
  }
  var executeLog = '(no Execute Log)';
  if (specPath && fs.existsSync(specPath)) { var el = common.extractSection(specPath, 'Execute Log', 100); if (el) executeLog = el; }

  console.log('## REVIEW EXECUTE PROMPT (4-Axis)');
  console.log('> Diff source: ' + diffSource);
  if (axis0Note) console.log(axis0Note);
  console.log('<!-- AXIS 0 BRIEF START -->');
  console.log('### Axis 0 — Invocation Integrity [CONFIRMATION]');
  console.log(invocationContent);
  console.log('Finding: ALIGNED | DRIFTED | VIOLATED | UNVERIFIABLE');
  console.log('<!-- AXIS 0 BRIEF END -->');
  console.log('<!-- AXIS 1 BRIEF START -->');
  console.log('### Axis 1 — Spec Plan Coverage [CONFIRMATION]');
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
  console.log('### Verdict: PASS | PASS_WITH_CONCERNS | FAIL_CODE | FAIL_PLAN | FAIL_SPEC');
}
module.exports = run;
