var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var validate = require('../commands/validate');

var VERDICT_TO_TARGET = {
  PASS: 'Ready',
  PASS_WITH_CONCERNS: 'Learning Check',
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

function executeCompletionDone(projectDir, specPath) {
  var ref = common.getFrontmatterField(specPath, 'execute-log-file');
  if (!ref) return false;
  var logPath = common.resolveProjectPath(projectDir, ref);
  if (!logPath || !fs.existsSync(logPath)) return false;
  var content = fs.readFileSync(logPath, 'utf-8');
  return common.completionVerificationDone(content);
}

function challengeRequiredAfterCompletion(projectDir, specPath, specContent, issues) {
  if (!executeCompletionDone(projectDir, specPath)) return false;
  var challengeStale = (issues || []).some(function(issue) {
    return /Challenge Executed At must be after the last Execute Log step timestamp/i.test(issue);
  });
  if (challengeStale) return 'stale';
  var explicit = explicitChallengeVerdict(specContent);
  var challengePartial = (issues || []).some(function(issue) {
    return /Challenge Executed At is empty|Challenge Evidence is required/i.test(issue);
  });
  if (challengePartial) return 'partial';
  var challengeMissing = (issues || []).some(function(issue) {
    return /Challenge has not been executed|Challenge Executed By is empty/i.test(issue);
  });
  if (challengeMissing) return explicit ? 'partial' : 'missing';
  return '';
}

function classifyIssue(issue) {
  var failedChallenge = String(issue || '').match(/Adversarial Challenge failed:\s*(FAIL_[A-Z_]+)/i);
  if (failedChallenge) return failedChallenge[1].toUpperCase();
  if (/Challenge has not been executed/i.test(issue)) return 'FAIL_LOG';
  if (/Challenge Executed At must be after the last Execute Log step timestamp/i.test(issue)) return 'FAIL_LOG';
  if (/hardcoded secret|injection risk|missing input validation|dead code|code duplication|Code Challenge/i.test(issue)) return 'FAIL_CODE';
  if (/Confirmed Requirement|Intake|Spec file not found/i.test(issue)) return 'FAIL_SPEC';
  if (/Innovate/i.test(issue)) return 'FAIL_SPEC';
  if (/Technical Design|Design Note|design-file|Design file/i.test(issue)) return 'FAIL_DESIGN';
  if (/Acceptance Criteria|Verification|Automated Acceptance|E2E Acceptance|Manual Acceptance|AC Coverage/i.test(issue)) return 'FAIL_ACCEPTANCE';
  if (/Plan Approved|Approved At|Gate Evidence|Micro Plan/i.test(issue)) return 'FAIL_PLAN';
  if (/Execute Log/i.test(issue)) return 'FAIL_LOG';
  if (/Learning Record|Learning/i.test(issue)) return 'FAIL_LEARNING';
  if (/Challenge Executed|Challenge Evidence/i.test(issue)) return 'FAIL_LOG';
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

// Strip a leading "Label:" prefix from each line so keyword scanning sees the
// filled values, not the template field names (the standard design template's
// own labels — "Security / Permission", "Data Migration / Backfill",
// "Data Model / Schema" — otherwise flag every standard spec).
function stripLeadingLabels(text) {
  return String(text || '').split(/\r?\n/).map(function(line) {
    return line.replace(/^\s*[A-Za-z][A-Za-z0-9 /_-]*:\s*/, '');
  }).join('\n');
}

// The "action region" of a spec: what the work will actually do (Plan + the
// Design contract), with field labels stripped. Risk is judged from intended
// actions, not from narrative that merely discusses risk in Research/Findings.
function actionText(projectDir, specPath) {
  var parts = [];
  var plan = common.extractSection(specPath, 'Plan', 400);
  if (plan) parts.push(plan);
  var designRef = common.getFrontmatterField(specPath, 'design-file');
  var designContent = '';
  if (designRef) {
    var dp = common.resolveProjectPath(projectDir, designRef);
    if (dp && fs.existsSync(dp)) {
      designContent = common.extractSection(dp, 'Technical Design', 400) || common.extractSection(dp, 'Design Note', 400) || '';
    }
  }
  if (!designContent) {
    designContent = common.extractSection(specPath, 'Technical Design', 400) || common.extractSection(specPath, 'Design Note', 400) || '';
  }
  if (designContent) parts.push(designContent);
  return stripLeadingLabels(parts.join('\n'));
}

function riskFlags(content) {
  var text = String(content || '').replace(/<!--[\s\S]*?-->/g, '').toLowerCase();
  var flags = [];
  [
    ['security', /\b(security|auth|permission|credential|secret)\b/],
    ['billing', /\b(billing|payment|invoice|charge)\b/],
    ['migration', /\b(migration|migrate|backfill|schema)\b/],
    ['public-api', /\b(public api|api contract|external api)\b/],
    ['irreversible', /\b(irreversible|destructive|delete data)\b/],
    // Chinese keyword counterparts — no word-boundary anchors (CJK has no \b)
    ['security', /权限|认证|授权|密钥|凭证/],
    ['billing', /计费|支付|账单|扣费|收费/],
    ['migration', /迁移|数据迁移|回填|schema/],
    ['public-api', /公开接口|外部接口|api契约/],
    ['irreversible', /不可逆|破坏性|删除数据|清空数据/]
  ].forEach(function(item) {
    if (item[1].test(text)) flags.push(item[0]);
  });
  return flags;
}

// Advisory method router: maps mode + riskFlags to the Design fields worth
// emphasizing and the techniques worth applying. Advisory only — the
// orchestrator decides. Deterministic so cruise/console/challenge can consume it.
var DESIGN_RISK_MAP = {
  migration: { fields: ['Data Model / Schema', 'Data Migration / Backfill'], note: 'migration risk: detail schema changes and a backfill/rollback path.' },
  'public-api': { fields: ['Interface Contract', 'Compatibility / Rollback'], note: 'public-api risk: pin the interface contract and a versioning/compatibility strategy.' },
  security: { fields: ['Security / Permission'], note: 'security risk: add a threat / permission-boundary pass (consider a STRIDE-style review).' },
  billing: { fields: ['Data Model / Schema', 'Failure Modes'], note: 'billing risk: model money/state carefully and enumerate failure modes.' },
  irreversible: { fields: ['Compatibility / Rollback', 'Failure Modes'], note: 'irreversible risk: require an explicit rollback/abort plan before Execute.' }
};

function designMethodHint(mode, flags) {
  mode = mode || 'standard';
  flags = flags || [];
  if (mode === 'micro') {
    return { applies: false, adr: false, methods: [], focusFields: [], notes: ['micro mode keeps design intent inside Plan; no standalone design methodology.'] };
  }
  var hint = { applies: true, adr: true, methods: [], focusFields: [], notes: [] };
  if (mode === 'lite') {
    hint.methods = ['ADR (lightweight option record)'];
    hint.notes.push('lite: record the selected option as an ADR; keep the Design Note focused on Approach and Impact.');
  } else {
    hint.methods = ['ADR', 'arc42 field structure', 'C4 context/container for Architecture View'];
    hint.notes.push('standard: anchor the Technical Design on its required fields; use C4 context/container views for Architecture View and an ADR for the selected option.');
  }
  flags.forEach(function(flag) {
    var r = DESIGN_RISK_MAP[flag];
    if (!r) return;
    r.fields.forEach(function(f) { if (hint.focusFields.indexOf(f) === -1) hint.focusFields.push(f); });
    hint.notes.push(r.note);
  });
  if (mode === 'standard') {
    hint.notes.push('if the domain has multiple bounded contexts or a rich model, consider DDD (advisory; orchestrator decides).');
  }
  return hint;
}

function formatDesignMethodLines(dm) {
  if (!dm || !dm.applies) {
    return ['DESIGN_METHOD: n/a' + (dm && dm.notes && dm.notes[0] ? ' (' + dm.notes[0] + ')' : '')];
  }
  var lines = [
    'DESIGN_METHOD: ' + (dm.methods.join('; ') || 'baseline'),
    'DESIGN_FOCUS_FIELDS: ' + (dm.focusFields.length ? dm.focusFields.join('; ') : 'required Technical Design fields (no extra emphasis)')
  ];
  dm.notes.forEach(function(n) { lines.push('- ' + n); });
  return lines;
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
      riskFlags: [],
      designMethod: { applies: false, adr: false, methods: [], focusFields: [], notes: ['no active spec; run discover first.'] }
    };
  }
  var content = fs.readFileSync(specPath, 'utf-8');
  var mode = common.getFrontmatterField(specPath, 'mode') || 'standard';
  var contextSource = common.getFrontmatterField(specPath, 'context-source') || '';
  var action = actionText(projectDir, specPath);
  var flags = riskFlags(action && action.trim() ? action : content);
  var validation = opts.validation || validate.validateSpec(specPath, { archiveReady: true, projectDir: projectDir });
  var explicit = explicitChallengeVerdict(content);
  var challengeRequired = challengeRequiredAfterCompletion(projectDir, specPath, content, validation.issues);
  var validationVerdict = challengeVerdictFromIssues(validation.issues);
  // Challenge Verdict from Spec is the authoritative independent quality gate.
  // Validation issues are separate blockers — they should not override an
  // explicit Challenge PASS. Only when no Challenge Verdict exists do we
  // derive one from validation issues for routing purposes.
  var verdict = explicit
    ? explicit
    : (validation.issues && validation.issues.length ? validationVerdict : 'PASS');
  var target = VERDICT_TO_TARGET[verdict] || 'Research';
  // If Challenge passed but validation blockers remain, the task is not
  // truly archive-ready — blockers must be resolved first.
  var action = nextAction(verdict);
  if (challengeRequired && (challengeRequired !== 'missing' || validationVerdict === 'FAIL_CODE' || validationVerdict === 'FAIL_LOG')) {
    target = 'Challenge';
    action = 'run_challenge';
  }
  if (action === 'archive_ready' && validation.issues && validation.issues.length) {
    action = 'repair_' + (VERDICT_TO_TARGET[validationVerdict] || 'Research')
      .toLowerCase()
      .replace(/ \/ /g, '_')
      .replace(/\s+/g, '_');
  }
  return {
    gatePolicy: gatePolicy,
    cruisePolicy: cruisePolicy,
    maxIterations: maxIterations,
    challengeVerdict: verdict,
    backtrackTarget: target,
    nextAction: action,
    blockers: validation.issues || [],
    riskFlags: flags,
    designMethod: designMethodHint(mode, flags),
    gateEvidence: labelValue(content, 'Gate Evidence'),
    challengeSummary: labelValue(content, 'Challenge Summary'),
    specPath: specPath,
    contextSource: contextSource || undefined,
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
  challengeVerdictFromIssues: challengeVerdictFromIssues,
  designMethodHint: designMethodHint,
  formatDesignMethodLines: formatDesignMethodLines,
  riskFlags: riskFlags,
  actionText: actionText
};
