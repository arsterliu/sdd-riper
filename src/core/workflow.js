var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var validate = require('../commands/validate');

var VERDICT_TO_TARGET = {
  PASS: 'Ready',
  PASS_WITH_CONCERNS: 'Review',
  FAIL_SPEC: 'Research',
  FAIL_DESIGN: 'Design',
  FAIL_ACCEPTANCE: 'Acceptance',
  FAIL_PLAN: 'Plan',
  FAIL_CODE: 'Execute / Debug',
  FAIL_LOG: 'Execute Log',
  FAIL_LEARNING: 'Learning Check'
};

var CRUISE_ENGINES = ['auto', 'prompt', 'local-loop', 'claude-code', 'codex', 'opencode'];

function normalizeCruiseEngine(value) {
  var raw = String(value || 'auto').trim().toLowerCase();
  var aliases = {
    claude: 'claude-code',
    'claude-workflow': 'claude-code',
    'dynamic-workflow': 'claude-code',
    local: 'local-loop',
    loop: 'local-loop'
  };
  var engine = aliases[raw] || raw;
  return CRUISE_ENGINES.indexOf(engine) !== -1 ? engine : '';
}

function sectionContent(specPath, pattern) {
  return common.extractSection(specPath, pattern, 400);
}

function labelValue(section, label) {
  var lines = String(section || '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  var escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var labelRegex = new RegExp('^' + escaped + ':[ \\t]*(.*)$', 'i');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var m = line.match(labelRegex);
    if (!m) continue;
    if (m[1] && m[1].trim()) return m[1].trim();
    for (var j = i + 1; j < lines.length; j++) {
      var next = lines[j].trim();
      if (!next || next.startsWith('<!--') || next.startsWith('|') || /^#+\s/.test(next)) continue;
      if (/^[A-Za-z][A-Za-z0-9 /_-]*:[ \t]*/.test(next)) break;
      return next;
    }
  }
  return '';
}

function explicitChallengeVerdict(content) {
  var verdict = labelValue(content, 'Challenge Verdict').toUpperCase();
  return VERDICT_TO_TARGET[verdict] ? verdict : '';
}

function classifyIssue(issue) {
  if (/Confirmed Requirement|Invocation|Spec file not found/i.test(issue)) return 'FAIL_SPEC';
  if (/Innovate/i.test(issue)) return 'FAIL_SPEC';
  if (/Technical Design|Design Note|design-file|Design file/i.test(issue)) return 'FAIL_DESIGN';
  if (/Acceptance Criteria|Verification|Automated Acceptance|E2E Acceptance|Manual Acceptance/i.test(issue)) return 'FAIL_ACCEPTANCE';
  if (/Plan Approved|Approved At|Gate Evidence|Micro Plan/i.test(issue)) return 'FAIL_PLAN';
  if (/Execute Log/i.test(issue)) return 'FAIL_LOG';
  if (/Learning Record|Learning/i.test(issue)) return 'FAIL_LEARNING';
  if (/Review Verdict|Review Summary|PASS verdict/i.test(issue)) return 'FAIL_CODE';
  return 'FAIL_SPEC';
}

function challengeVerdictFromIssues(issues) {
  if (!issues || !issues.length) return 'PASS';
  var priority = ['FAIL_SPEC', 'FAIL_DESIGN', 'FAIL_ACCEPTANCE', 'FAIL_PLAN', 'FAIL_CODE', 'FAIL_LOG', 'FAIL_LEARNING'];
  var found = issues.map(classifyIssue);
  for (var i = 0; i < priority.length; i++) {
    if (found.indexOf(priority[i]) !== -1) return priority[i];
  }
  return found[0] || 'FAIL_SPEC';
}

function riskFlags(content) {
  var text = String(content || '').replace(/<!--[\s\S]*?-->/g, '').toLowerCase();
  var flags = [];
  [
    ['security', /\bsecurity|auth|permission|credential|secret\b/],
    ['billing', /\bbilling|payment|invoice|charge\b/],
    ['migration', /\bmigration|migrate|backfill|schema\b/],
    ['public-api', /\bpublic api|api contract|external api\b/],
    ['irreversible', /\birreversible|destructive|delete data\b/]
  ].forEach(function(item) {
    if (item[1].test(text)) flags.push(item[0]);
  });
  return flags;
}

function nextAction(verdict) {
  if (verdict === 'PASS') return 'archive_ready';
  return 'repair_' + String(VERDICT_TO_TARGET[verdict] || 'Research')
    .toLowerCase()
    .replace(/ \/ /g, '_')
    .replace(/\s+/g, '_');
}

function analyzeSpec(projectDir, specPath, opts) {
  opts = opts || {};
  var gatePolicy = common.getGatePolicy(projectDir);
  var cruisePolicy = common.getCruisePolicy(projectDir);
  var maxIterations = common.getCruiseMaxIterations(projectDir);
  if (!specPath || !fs.existsSync(specPath)) {
    return {
      gatePolicy: gatePolicy,
      cruisePolicy: cruisePolicy,
      maxIterations: maxIterations,
      challengeVerdict: 'FAIL_SPEC',
      backtrackTarget: 'Research',
      nextAction: 'discover_spec',
      blockers: ['Spec file not found.'],
      riskFlags: []
    };
  }
  var content = fs.readFileSync(specPath, 'utf-8');
  var validation = opts.validation || validate.validateSpec(specPath, { archiveReady: true, projectDir: projectDir });
  var explicit = explicitChallengeVerdict(content);
  var validationVerdict = challengeVerdictFromIssues(validation.issues);
  var verdict = explicit && /^FAIL_/.test(explicit)
    ? explicit
    : (validation.issues && validation.issues.length ? validationVerdict : (explicit || validationVerdict));
  var target = VERDICT_TO_TARGET[verdict] || 'Research';
  return {
    gatePolicy: gatePolicy,
    cruisePolicy: cruisePolicy,
    maxIterations: maxIterations,
    challengeVerdict: verdict,
    backtrackTarget: target,
    nextAction: nextAction(verdict),
    blockers: validation.issues || [],
    riskFlags: riskFlags(content),
    gateEvidence: labelValue(content, 'Gate Evidence'),
    challengeSummary: labelValue(content, 'Challenge Summary'),
    specPath: specPath,
    reviewBrief: sectionContent(specPath, 'Review (Verdict|Summary)')
  };
}

function analyzeProject(projectDir, opts) {
  opts = opts || {};
  var specPath = validate.resolveSpec(projectDir, opts);
  return analyzeSpec(projectDir, specPath, opts);
}

module.exports = {
  VERDICT_TO_TARGET: VERDICT_TO_TARGET,
  CRUISE_ENGINES: CRUISE_ENGINES,
  normalizeCruiseEngine: normalizeCruiseEngine,
  analyzeSpec: analyzeSpec,
  analyzeProject: analyzeProject,
  challengeVerdictFromIssues: challengeVerdictFromIssues
};
