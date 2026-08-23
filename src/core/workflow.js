var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var validate = require('../commands/validate');
var specState = require('./spec-state');
var risk = require('./risk');
var visualEvidenceContract = require('../visual-evidence/contract');
var autonomyState = require('./autonomy-state');

var VERDICT_TO_TARGET = specState.VERDICT_TO_TARGET;

var CRUISE_DRIVERS = ['auto', 'prompt', 'local-loop', 'claude-code', 'codex', 'opencode'];

function normalizeCruiseDriver(value) {
  var raw = String(value || 'auto').trim().toLowerCase();
  return CRUISE_DRIVERS.indexOf(raw) !== -1 ? raw : '';
}

function sectionContent(specPath, pattern) {
  return common.extractSection(specPath, pattern, 400);
}

var labelValue = require('./artifact-snapshot').labelValue;

function challengeVerdictFromIssues(issues) {
  return specState.verdictFromIssues(issues);
}

// Strip a leading "Label:" prefix from each line so keyword scanning sees the
// filled values, not the template field names (the standard design template's
// own labels — "Security / Permission", "Data Migration / Backfill",
// "Data Model / Schema" — otherwise flag every standard spec).
function stripLeadingLabels(text) {
  return String(text || '').split(/\r?\n/).map(function(line) {
    return line.replace(/^\s*[A-Za-z][A-Za-z0-9 /&_-]*:\s*/, '');
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

function riskFlags(content, crSection) {
  // Phase 1: extract signals from Confirmed Requirement structured fields
  // (more precise than full-text keyword scanning).
  var flags = [];
  var crText = String(crSection || '').replace(/<!--[\s\S]*?-->/g, '');
  var hasStructuredFields = crText && /Scope Boundary:|Irreversibility:|Impact Radius:|Dependencies & Constraints:|Acceptance Intent:/i.test(crText);

  if (hasStructuredFields) {
    var irreversibility = labelValue(crText, 'Irreversibility');
    var impactRadius = labelValue(crText, 'Impact Radius');
    var depsConstraints = labelValue(crText, 'Dependencies & Constraints');
    var scopeBoundary = labelValue(crText, 'Scope Boundary');

    // Irreversibility → irreversible flag
    if (risk.classifyIrreversibility(irreversibility) === 'irreversible') {
      flags.push('irreversible');
    }
    // Impact Radius → public-api flag
    if (impactRadius && /\b(public|external|公开|外部|api)\b/i.test(impactRadius)) {
      flags.push('public-api');
    }
    // Dependencies & Constraints → security / billing / migration flags
    if (depsConstraints) {
      var dcLower = depsConstraints.toLowerCase();
      if (/\b(security|auth|permission|credential|secret)\b/i.test(depsConstraints) || /权限|认证|授权|密钥|凭证/.test(depsConstraints)) flags.push('security');
      if (/\b(billing|payment|invoice|charge)\b/i.test(depsConstraints) || /计费|支付|账单|扣费|收费/.test(depsConstraints)) flags.push('billing');
      if (/\b(migration|migrate|backfill|schema)\b/i.test(depsConstraints) || /迁移|数据迁移|回填/.test(depsConstraints)) flags.push('migration');
    }
    // Scope Boundary → migration flag (if mentions schema/migration)
    if (scopeBoundary && flags.indexOf('migration') === -1) {
      if (/\b(schema|migration|migrate)\b/i.test(scopeBoundary) || /迁移|schema/.test(scopeBoundary)) flags.push('migration');
    }
  }

  // Phase 2: fallback to full-text keyword scanning when no structured fields
  // or to catch signals not present in Confirmed Requirement.
  var text = String(content || '').replace(/<!--[\s\S]*?-->/g, '').toLowerCase();
  [
    ['security', /\b(security|auth|permission|credential|secret)\b/],
    ['billing', /\b(billing|payment|invoice|charge)\b/],
    ['migration', /\b(migration|migrate|backfill|schema)\b/],
    ['public-api', /\b(public api|api contract|external api)\b/],
    // Chinese keyword counterparts — no word-boundary anchors (CJK has no \b)
    ['security', /权限|认证|授权|密钥|凭证/],
    ['billing', /计费|支付|账单|扣费|收费/],
    ['migration', /迁移|数据迁移|回填|schema/],
    ['public-api', /公开接口|外部接口|api契约/]
  ].forEach(function(item) {
    if (flags.indexOf(item[0]) === -1 && item[1].test(text)) flags.push(item[0]);
  });
  if (!hasStructuredFields && flags.indexOf('irreversible') === -1 && risk.classifyIrreversibility(text) === 'irreversible') {
    flags.push('irreversible');
  }
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

function confirmedRequirement(specPath, mode) {
  if (mode === 'standard') {
    var researchSection = sectionContent(specPath, 'Research');
    var crLines = String(researchSection || '').split(/\r?\n/);
    var crFound = false;
    var crResult = [];
    for (var ci = 0; ci < crLines.length; ci++) {
      if (/^###\s+Confirmed Requirement/.test(crLines[ci])) { crFound = true; continue; }
      if (crFound && /^###/.test(crLines[ci])) break;
      if (crFound) crResult.push(crLines[ci]);
    }
    return crResult.join('\n');
  }
  return sectionContent(specPath, 'Confirmed Requirement');
}

function computeRiskFlags(projectDir, specPath, content) {
  var mode = common.getFrontmatterField(specPath, 'mode') || 'standard';
  var action = actionText(projectDir, specPath);
  return riskFlags(action && action.trim() ? action : content, confirmedRequirement(specPath, mode));
}

function requiredHumanGate(evaluated) {
  evaluated = evaluated || {};
  var action = evaluated.nextAction || '';
  if (evaluated.gates && evaluated.gates.challenge && evaluated.gates.challenge.state === 'failed' && /^repair_/.test(action)) return 'Repair';
  if (action === 'repair_innovate') return 'Research';
  if (action === 'repair_design' || action === 'repair_acceptance' || action === 'repair_plan') return 'Innovate';
  if (action === 'run_challenge') return 'Completion';
  if (action === 'request_archive_authorization') return 'Challenge';
  return '';
}

function dedicatedStopReason(blockers, executeLogContent, options) {
  options = options || {};
  var joined = (blockers || []).filter(function(issue) { return !/^WARNING:/i.test(issue); }).join('\n');
  if (options.platformPermissionRequired || /platform permission|平台权限/i.test(joined)) return 'platform_permission_required';
  if (/Project Profile/i.test(joined)) return 'profile_digest_required';
  if (/AC Coverage:.*SKIPPED.*(?:Approved By|Approved At|Reason)/i.test(joined)) return 'e2e_skip_authorization_required';
  var log = String(executeLogContent || '');
  var majorAt = '';
  log.split(/^---\s*$/m).forEach(function(block) {
    if (!/^Status:\s*DEVIATED_MAJOR\s*$/m.test(block)) return;
    var match = block.match(/^Timestamp:\s*(\S+)\s*$/m);
    if (match && (!majorAt || Date.parse(match[1]) > Date.parse(majorAt))) majorAt = match[1];
  });
  if (majorAt && (!options.authorizationAt || !Number.isFinite(Date.parse(options.authorizationAt)) || Date.parse(options.authorizationAt) <= Date.parse(majorAt))) {
    return 'major_deviation_required';
  }
  return '';
}

function analyzeSpec(projectDir, specPath, opts) {
  opts = opts || {};
  var projectAutonomy = common.readProjectAutonomy(projectDir);
  var maxIterations = common.getCruiseMaxIterations(projectDir);
  if (!specPath || !fs.existsSync(specPath)) {
    return {
      autonomyMode: projectAutonomy.mode,
      autonomyModeSource: 'project',
      authorizationState: 'not-applicable',
      authorizedActors: [],
      scopeDigest: '',
      riskSnapshot: '',
      planDigest: '',
      authorizedScopeDigest: '',
      authorizedRiskSnapshot: '',
      activePlanDigest: '',
      stopReason: projectAutonomy.ok ? '' : 'migration_required',
      maxIterations: maxIterations,
      challengeVerdict: 'FAIL_SPEC',
      backtrackTarget: 'Research',
      nextAction: projectAutonomy.ok ? 'discover_spec' : 'migrate_autonomy_config',
      blockers: projectAutonomy.ok ? ['Spec file not found.'] : [projectAutonomy.code + ': run sdd autonomy migrate <project-dir> --mode auto|supervised|human.'],
      riskFlags: [],
      designMethod: { applies: false, adr: false, methods: [], focusFields: [], notes: ['no active spec; run discover first.'] }
    };
  }
  var content = fs.readFileSync(specPath, 'utf-8');
  var mode = common.getFrontmatterField(specPath, 'mode') || 'standard';
  var contextSource = common.getFrontmatterField(specPath, 'context-source') || '';
  var visualEvidence = visualEvidenceContract.inspect(specPath, projectDir);
  var visualContext = validate.visualContextStatus(specPath, projectDir);
  var profileRevision = common.getFrontmatterField(specPath, 'project-profile-revision') || '';
  var profileDigest = common.getFrontmatterField(specPath, 'project-profile-digest') || '';
  var affectedUnits = (common.getFrontmatterField(specPath, 'affected-units') || '').split(',').map(function(value) { return value.trim(); }).filter(Boolean);
  var action = actionText(projectDir, specPath);
  var flags = computeRiskFlags(projectDir, specPath, content);
  var autonomy = autonomyState.resolve(content, { riskSnapshot: autonomyState.riskFlagsSnapshot(flags) });
  var validation = opts.validation || validate.validateSpec(specPath, { archiveReady: true, projectDir: projectDir });
  var visualContextIssue = validate.visualContextSelectionIssue(visualContext);
  if (!opts.archiveReady && visualContextIssue && (validation.issues || []).indexOf(visualContextIssue) === -1) {
    validation = Object.assign({}, validation, {
      workflowState: null,
      issues: (validation.issues || []).concat([visualContextIssue])
    });
  }
  if (!opts.archiveReady && visualEvidence.planReadiness === 'blocked') {
    validation = Object.assign({}, validation, {
      workflowState: null,
      issues: (validation.issues || []).concat(visualEvidence.diagnostics.map(function(diagnostic) {
        return 'Visual evidence is not ready for Plan: ' + diagnostic.code + '.';
      }))
    });
  }
  // Challenge Verdict from Spec is the authoritative independent quality gate.
  // Validation issues are separate blockers — they should not override an
  // explicit Challenge PASS. Only when no Challenge Verdict exists do we
  // derive one from validation issues for routing purposes.
  var evaluated = validation.workflowState || specState.evaluate(specState.readSnapshot(projectDir, specPath), {
    validationIssues: (validation.issues || []).filter(function(issue) { return !/^WARNING:/i.test(issue); })
  });
  // If Challenge passed but validation blockers remain, the task is not
  // truly archive-ready — blockers must be resolved first.
  var nextAction = evaluated.nextAction;
  var stopReason = autonomy.stopReason;
  var blockers = (validation.issues || []).slice();
  var executeLogContent = '';
  var executeLogRef = common.getFrontmatterField(specPath, 'execute-log-file') || '';
  if (executeLogRef) {
    var executeLogPath = common.resolveProjectPath(projectDir, executeLogRef);
    if (executeLogPath && fs.existsSync(executeLogPath)) executeLogContent = fs.readFileSync(executeLogPath, 'utf-8');
  }
  if (!projectAutonomy.ok || !autonomy.mode) {
    nextAction = 'migrate_autonomy_config';
    stopReason = 'migration_required';
    blockers.unshift((projectAutonomy.code || 'SDD_AUTONOMY_MIGRATION_REQUIRED') + ': run sdd autonomy migrate <project-dir> --mode auto|supervised|human.');
  } else if (autonomy.mode === 'auto' && autonomy.authorizationState !== 'active') {
    nextAction = 'request_task_authorization';
    stopReason = autonomy.stopReason;
  } else if (autonomy.mode === 'supervised' && autonomy.authorizationState !== 'active' &&
      ['execute_plan', 'run_challenge', 'repair_and_retry'].indexOf(evaluated.nextAction) !== -1) {
    nextAction = 'request_plan_automation_authorization';
    stopReason = autonomy.stopReason;
  }
  var requiredGate = autonomy.mode === 'human' ? requiredHumanGate(evaluated) : '';
  if (requiredGate && autonomy.approvedGates.indexOf(requiredGate) === -1) {
    nextAction = 'request_human_gate';
    stopReason = 'human_gate_required';
  }
  if (flags.indexOf('irreversible') !== -1 && nextAction !== 'request_archive_authorization') {
    nextAction = 'request_irreversible_authorization';
    stopReason = 'irreversible_action_required';
  }
  var stopOptions = Object.assign({}, opts, {
    authorizationAt: autonomy.authorizationAt
  });
  var dedicatedStop = dedicatedStopReason(blockers, executeLogContent, stopOptions);
  if (dedicatedStop) stopReason = dedicatedStop;
  if (nextAction === 'request_archive_authorization') stopReason = 'archive_authorization';
  return {
    autonomyMode: autonomy.mode,
    autonomyModeSource: autonomy.modeSource,
    authorizationState: autonomy.authorizationState,
    authorizedActors: autonomy.authorizedActors,
    scopeDigest: autonomy.scopeDigest,
    riskSnapshot: autonomy.riskSnapshot,
    planDigest: autonomy.planDigest,
    authorizedScopeDigest: autonomy.scopeDigest,
    authorizedRiskSnapshot: autonomy.riskSnapshot,
    activePlanDigest: autonomy.planDigest,
    authorizationAt: autonomy.authorizationAt,
    stopReason: stopReason,
    requiredGate: requiredGate,
    maxIterations: maxIterations,
    challengeVerdict: evaluated.challengeVerdict,
    backtrackTarget: evaluated.backtrackTarget,
    nextAction: nextAction,
    blockers: blockers,
    blockerDetails: evaluated.blockers,
    gates: evaluated.gates,
    phase: evaluated.phase,
    completionReady: evaluated.completionReady,
    riskFlags: flags,
    designMethod: designMethodHint(mode, flags),
    gateEvidence: labelValue(content, 'Gate Evidence'),
    challengeSummary: labelValue(content, 'Challenge Summary'),
    specPath: specPath,
    contextSource: contextSource || undefined,
    visualContext: visualContext,
    visualEvidence: visualEvidence,
    profileRevision: profileRevision || undefined,
    profileDigest: profileDigest || undefined,
    affectedUnits: affectedUnits,
    profileAdvisory: affectedUnits.length > 1 ? {
      kind: 'cross-unit',
      focusFields: ['Interface Contract', 'Compatibility / Rollback'],
      note: 'Cross-unit scope: explicitly review interface contracts and compatibility; mode remains unchanged.'
    } : undefined,
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
  CRUISE_DRIVERS: CRUISE_DRIVERS,
  normalizeCruiseDriver: normalizeCruiseDriver,
  analyzeSpec: analyzeSpec,
  analyzeProject: analyzeProject,
  challengeVerdictFromIssues: challengeVerdictFromIssues,
  designMethodHint: designMethodHint,
  formatDesignMethodLines: formatDesignMethodLines,
  riskFlags: riskFlags,
  computeRiskFlags: computeRiskFlags,
  dedicatedStopReason: dedicatedStopReason,
  actionText: actionText
  ,requiredHumanGate: requiredHumanGate
};
