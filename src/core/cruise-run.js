var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function runsDir(projectDir) {
  return path.join(common.getDocsRoot(projectDir), 'runs');
}

function specRunName(specPath) {
  return path.basename(specPath || 'unknown-spec.md').replace(/\.md$/i, '');
}

function ledgerPath(projectDir, specPath) {
  return path.join(runsDir(projectDir), specRunName(specPath) + '.cruise.jsonl');
}

function stopReason(state, iteration) {
  if (state.riskFlags && state.riskFlags.length) return 'human_required';
  if (iteration >= state.maxIterations) return 'max_iterations';
  if (state.challengeVerdict === 'PASS') return 'pass';
  return 'continue';
}

function runEntry(projectDir, state, opts) {
  opts = opts || {};
  var iteration = parseInt(opts.iteration || 1, 10);
  if (!Number.isFinite(iteration) || iteration < 1) iteration = 1;
  return {
    timestamp: new Date().toISOString(),
    spec: state.specPath ? common.relativeToProject(projectDir, state.specPath) : '',
    iteration: iteration,
    engine: opts.engine || 'auto',
    gatePolicy: state.gatePolicy,
    cruisePolicy: state.cruisePolicy,
    maxIterations: state.maxIterations,
    challengeVerdict: state.challengeVerdict,
    backtrackTarget: state.backtrackTarget,
    nextAction: state.nextAction,
    riskFlags: state.riskFlags || [],
    blockers: state.blockers || [],
    stopReason: stopReason(state, iteration)
  };
}

function appendRun(projectDir, state, opts) {
  if (!state.specPath) throw new Error('Cannot record cruise run without an active spec.');
  var dir = runsDir(projectDir);
  fs.mkdirSync(dir, { recursive: true });
  var file = ledgerPath(projectDir, state.specPath);
  var entry = runEntry(projectDir, state, opts);
  fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf-8');
  return {
    path: file,
    relativePath: common.relativeToProject(projectDir, file),
    entry: entry
  };
}

function readLedger(projectDir, specPath) {
  var file = ledgerPath(projectDir, specPath);
  if (!fs.existsSync(file)) {
    return {
      ref: '',
      path: file,
      relativePath: common.relativeToProject(projectDir, file),
      exists: false,
      count: 0,
      malformedCount: 0,
      latest: null
    };
  }
  var lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/).filter(Boolean);
  var latest = null;
  var validCount = 0;
  var malformedCount = 0;
  for (var i = lines.length - 1; i >= 0; i--) {
    try {
      var parsed = JSON.parse(lines[i]);
      validCount++;
      if (!latest) latest = parsed;
    } catch (e) {
      malformedCount++;
    }
  }
  return {
    ref: common.relativeToProject(projectDir, file),
    path: file,
    relativePath: common.relativeToProject(projectDir, file),
    exists: true,
    count: validCount,
    malformedCount: malformedCount,
    latest: latest
  };
}

function claudePrompt(projectDir, state) {
  var project = path.resolve(projectDir);
  return [
    'ultracode: Run SDD autonomous cruise for this project using Claude Code Dynamic Workflows when appropriate.',
    '',
    'If the session should prefer workflows for every substantive task, first run `/effort ultracode`.',
    '',
    'Project:',
    project,
    '',
    'Use SDD as the control protocol and artifact truth chain. Do not replace Spec, Design, Plan, Execute Log, Learning, Review, or the run ledger with a workflow-local file.',
    '',
    'Loop contract:',
    '1. Run `sdd next "' + project + '"`.',
    '2. Repair only the artifact or code boundary indicated by `BACKTRACK_TARGET`.',
    '3. Run `sdd validate "' + project + '" --archive-ready`.',
    '4. Run `sdd review-execute "' + project + '"` when execution evidence changed.',
    '5. Run `sdd challenge "' + project + '"` with an independent adversarial reviewer.',
    '6. Record the run ledger with `sdd cruise "' + project + '" --engine claude-code --record-run --iteration <n>`.',
    '7. If the challenge verdict is `FAIL_*`, backtrack to the mapped target and continue.',
    '8. Stop on `PASS`, high-risk flags, or max iteration budget.',
    '',
    'Current SDD state:',
    '- SPEC: ' + (state.specPath ? common.relativeToProject(projectDir, state.specPath) : 'none'),
    '- NEXT_ACTION: ' + state.nextAction,
    '- BACKTRACK_TARGET: ' + state.backtrackTarget,
    '- CHALLENGE_VERDICT: ' + state.challengeVerdict,
    '- MAX_ITERATIONS: ' + state.maxIterations
  ].join('\n') + '\n';
}

function printClaudePrompt(projectDir, state, write) {
  write('[CLAUDE_PROMPT]');
  write(claudePrompt(projectDir, state).trim());
}

module.exports = {
  runsDir: runsDir,
  ledgerPath: ledgerPath,
  appendRun: appendRun,
  readLedger: readLedger,
  claudePrompt: claudePrompt,
  printClaudePrompt: printClaudePrompt
};
