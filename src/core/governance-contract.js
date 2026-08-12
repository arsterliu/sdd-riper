const defaults = Object.freeze({
  mode: 'micro',
  autonomyMode: 'supervised',
  cruiseMaxIterations: 5
});

const autonomyModes = Object.freeze(['auto', 'supervised', 'human']);

const microRequiredFields = Object.freeze([
  'Impact Scope',
  'Data Impact',
  'Interface Impact',
  'Acceptance',
  'Verification'
]);

const microRecommendedFields = Object.freeze([
  'Scope',
  'Touched Files',
  'Change',
  'Blast Radius'
]);

const auditableReviewerTypes = Object.freeze([
  'subagent:<id>',
  'external-agent:<id>',
  'human:<name>',
  'inline'
]);

const verdicts = Object.freeze([
  'PASS',
  'PASS_WITH_CONCERNS',
  'FAIL_SPEC',
  'FAIL_DESIGN',
  'FAIL_ACCEPTANCE',
  'FAIL_PLAN',
  'FAIL_CODE',
  'FAIL_LOG',
  'FAIL_LEARNING'
]);

const passingVerdicts = Object.freeze([
  'PASS',
  'PASS_WITH_CONCERNS'
]);

const verdictTargets = Object.freeze({
  PASS: 'Ready',
  PASS_WITH_CONCERNS: 'Learning Check',
  FAIL_SPEC: 'Research',
  FAIL_DESIGN: 'Design',
  FAIL_ACCEPTANCE: 'Acceptance',
  FAIL_PLAN: 'Plan',
  FAIL_CODE: 'Execute / Debug',
  FAIL_LOG: 'Execute Log',
  FAIL_LEARNING: 'Learning Check'
});

function modeFields(mode) {
  if (mode !== 'micro') {
    return { required: [], recommended: [] };
  }
  return {
    required: microRequiredFields.slice(),
    recommended: microRecommendedFields.slice()
  };
}

function requiresProvider(verification) {
  return typeof verification === 'string' && verification.trim().toLowerCase() === 'e2e';
}

function isAuditableReviewer(mode, value) {
  if (mode !== 'standard' && mode !== 'lite' && mode !== 'micro') return false;
  if (mode === 'micro' && typeof value === 'string' && /^inline$/i.test(value)) return true;
  return typeof value === 'string' && /^(subagent|external-agent|human):[^\s:]+$/i.test(value);
}

function isKnownVerdict(value) {
  return typeof value === 'string' && verdicts.indexOf(value) !== -1;
}

function isPassingVerdict(value) {
  return isKnownVerdict(value) && passingVerdicts.indexOf(value) !== -1;
}

function backtrackTarget(verdict) {
  return isKnownVerdict(verdict) ? verdictTargets[verdict] : '';
}

module.exports = Object.freeze({
  defaults: defaults,
  autonomyModes: autonomyModes,
  modeFields: modeFields,
  requiresProvider: requiresProvider,
  isAuditableReviewer: isAuditableReviewer,
  auditableReviewerTypes: auditableReviewerTypes,
  verdicts: verdicts,
  isKnownVerdict: isKnownVerdict,
  isPassingVerdict: isPassingVerdict,
  backtrackTarget: backtrackTarget
});
