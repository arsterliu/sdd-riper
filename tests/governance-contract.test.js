const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const governanceContract = require('../src/core/governance-contract');

function withInjectedGovernanceContract(overrides, consumerModules, callback) {
  const contractPath = require.resolve('../src/core/governance-contract');
  const consumerPaths = consumerModules.map(function(modulePath) { return require.resolve(modulePath); });
  const savedContract = require.cache[contractPath];
  const savedConsumers = consumerPaths.map(function(consumerPath) { return require.cache[consumerPath]; });
  const injected = Object.assign({}, governanceContract, overrides);

  consumerPaths.forEach(function(consumerPath) { delete require.cache[consumerPath]; });
  delete require.cache[contractPath];
  require.cache[contractPath] = {
    id: contractPath,
    filename: contractPath,
    loaded: true,
    exports: injected
  };
  try {
    return callback.apply(null, consumerModules.map(function(modulePath) { return require(modulePath); }));
  } finally {
    consumerPaths.forEach(function(consumerPath, index) {
      delete require.cache[consumerPath];
      if (savedConsumers[index]) require.cache[consumerPath] = savedConsumers[index];
    });
    delete require.cache[contractPath];
    if (savedContract) require.cache[contractPath] = savedContract;
  }
}

test('exposes the governance default values', function() {
  assert.deepEqual(governanceContract.defaults, {
    mode: 'micro',
    approvalPolicy: 'agent',
    cruiseEnabled: true,
    cruiseMaxIterations: 5
  });
});

test('keeps governance defaults from being rebound by consumers', function() {
  governanceContract.defaults = { mode: 'changed' };

  assert.deepEqual(governanceContract.defaults, {
    mode: 'micro',
    approvalPolicy: 'agent',
    cruiseEnabled: true,
    cruiseMaxIterations: 5
  });
});

test('defines the micro Plan required and recommended fields', function() {
  const fields = governanceContract.modeFields('micro');

  assert.deepEqual(fields.required, [
    'Impact Scope',
    'Data Impact',
    'Interface Impact',
    'Acceptance',
    'Verification'
  ]);
  assert.deepEqual(fields.recommended, [
    'Scope',
    'Touched Files',
    'Change',
    'Blast Radius'
  ]);
  assert.ok(!fields.required.includes('Provider'));
});

test('returns isolated micro Plan field arrays', function() {
  const first = governanceContract.modeFields('micro');
  first.required.push('Provider');
  first.recommended.pop();

  const second = governanceContract.modeFields('micro');
  assert.deepEqual(second.required, [
    'Impact Scope',
    'Data Impact',
    'Interface Impact',
    'Acceptance',
    'Verification'
  ]);
  assert.deepEqual(second.recommended, [
    'Scope',
    'Touched Files',
    'Change',
    'Blast Radius'
  ]);
});

test('requires a Provider only for e2e verification', function() {
  assert.equal(governanceContract.requiresProvider('e2e'), true);
  assert.equal(governanceContract.requiresProvider('unit'), false);
  assert.equal(governanceContract.requiresProvider('manual'), false);
  assert.equal(governanceContract.requiresProvider('custom'), false);
  assert.equal(governanceContract.requiresProvider(''), false);
});

test('accepts auditable reviewers and limits inline to micro mode', function() {
  ['standard', 'lite'].forEach(function(mode) {
    assert.equal(governanceContract.isAuditableReviewer(mode, 'subagent:reviewer'), true);
    assert.equal(governanceContract.isAuditableReviewer(mode, 'SUBAGENT:reviewer'), true);
    assert.equal(governanceContract.isAuditableReviewer(mode, 'external-agent:reviewer'), true);
    assert.equal(governanceContract.isAuditableReviewer(mode, 'human:reviewer'), true);
    assert.equal(governanceContract.isAuditableReviewer(mode, 'inline'), false);
    assert.equal(governanceContract.isAuditableReviewer(mode, 'subagent:'), false);
    assert.equal(governanceContract.isAuditableReviewer(mode, 'external-agent:'), false);
    assert.equal(governanceContract.isAuditableReviewer(mode, 'human:'), false);
    assert.equal(governanceContract.isAuditableReviewer(mode, 'automated:reviewer'), false);
  });

  assert.equal(governanceContract.isAuditableReviewer('micro', 'inline'), true);
  assert.equal(governanceContract.isAuditableReviewer('micro', 'INLINE'), true);
  assert.equal(governanceContract.isAuditableReviewer('micro', 'subagent:reviewer'), true);
  assert.equal(governanceContract.isAuditableReviewer('micro', 'HuMaN:reviewer'), true);
  assert.equal(governanceContract.isAuditableReviewer('micro', 'external-agent:reviewer'), true);
  assert.equal(governanceContract.isAuditableReviewer('micro', 'human:reviewer'), true);
  assert.equal(governanceContract.isAuditableReviewer('micro', ''), false);
  assert.equal(governanceContract.isAuditableReviewer('micro', 'subagent:'), false);
  assert.equal(governanceContract.isAuditableReviewer('micro', 'external-agent:'), false);
  assert.equal(governanceContract.isAuditableReviewer('micro', 'human:'), false);
  assert.equal(governanceContract.isAuditableReviewer('micro', 'automated:reviewer'), false);
  assert.equal(governanceContract.isAuditableReviewer('unknown', 'subagent:reviewer'), false);
  assert.equal(governanceContract.isAuditableReviewer('unknown', 'inline'), false);
});

test('exposes an immutable complete auditable reviewer identity list for CLI guidance', function() {
  assert.deepEqual(governanceContract.auditableReviewerTypes, [
    'subagent:<id>',
    'external-agent:<id>',
    'human:<name>',
    'inline'
  ]);
  assert.equal(Object.isFrozen(governanceContract.auditableReviewerTypes), true);
});

test('recognizes known Challenge verdicts and their routing targets', function() {
  const targets = {
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

  Object.entries(targets).forEach(function(entry) {
    const verdict = entry[0];
    const target = entry[1];
    assert.equal(governanceContract.isKnownVerdict(verdict), true);
    assert.equal(governanceContract.backtrackTarget(verdict), target);
  });
  assert.equal(governanceContract.isKnownVerdict('UNKNOWN'), false);
  assert.equal(governanceContract.isKnownVerdict(''), false);
  assert.equal(governanceContract.backtrackTarget('UNKNOWN'), '');
  assert.equal(governanceContract.backtrackTarget(''), '');
});

test('publishes immutable verdicts and derives known and passing semantics from them', function() {
  const verdicts = [
    'PASS',
    'PASS_WITH_CONCERNS',
    'FAIL_SPEC',
    'FAIL_DESIGN',
    'FAIL_ACCEPTANCE',
    'FAIL_PLAN',
    'FAIL_CODE',
    'FAIL_LOG',
    'FAIL_LEARNING'
  ];
  assert.deepEqual(governanceContract.verdicts, verdicts);
  assert.equal(Object.isFrozen(governanceContract.verdicts), true);
  assert.throws(function() { governanceContract.verdicts.push('UNKNOWN'); }, TypeError);
  verdicts.forEach(function(verdict) {
    assert.equal(governanceContract.isKnownVerdict(verdict), true);
    assert.equal(governanceContract.isPassingVerdict(verdict), verdict === 'PASS' || verdict === 'PASS_WITH_CONCERNS');
  });
  assert.equal(governanceContract.isKnownVerdict('UNKNOWN'), false);
  assert.equal(governanceContract.isPassingVerdict('UNKNOWN'), false);
});

test('Challenge command delegates verdict, reviewer, and backtrack rules to the governance Contract', function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-governance-challenge-'));
  const specPath = path.join(root, 'spec.md');
  fs.writeFileSync(specPath, '---\nmode: standard\n---\nChallenge Verdict:\nBacktrack Target:\nChallenge Summary:\nChallenge Executed By:\nChallenge Executed At:\nChallenge Evidence:\n', 'utf-8');

  withInjectedGovernanceContract({
    isKnownVerdict: function(verdict) { return verdict === 'REGISTRY_ONLY'; },
    isAuditableReviewer: function(mode, reviewer) { return mode === 'standard' && reviewer === 'registry:reviewer'; },
    backtrackTarget: function(verdict) { return verdict === 'REGISTRY_ONLY' ? 'Registry Target' : ''; }
  }, ['../src/commands/challenge'], function(challenge) {
    const originalExit = process.exit;
    const originalLog = console.log;
    const originalError = console.error;
    process.exit = function(code) { throw new Error('unexpected process.exit(' + code + ')'); };
    console.log = function() {};
    console.error = function() {};
    try {
      challenge(root, {
        spec: specPath,
        recordResult: 'registry_only',
        summary: 'contract injected verdict',
        executedBy: 'registry:reviewer'
      });
    } finally {
      process.exit = originalExit;
      console.log = originalLog;
      console.error = originalError;
    }
  });

  const result = fs.readFileSync(specPath, 'utf-8');
  assert.match(result, /^Challenge Verdict: REGISTRY_ONLY$/m);
  assert.match(result, /^Backtrack Target: Registry Target$/m);
  assert.match(result, /^Challenge Executed By: registry:reviewer$/m);
});

test('Challenge command takes prompt and invalid-verdict lists from injected Contract verdicts', function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-governance-challenge-list-'));
  withInjectedGovernanceContract({
    verdicts: Object.freeze(['REGISTRY_PASS', 'REGISTRY_FAIL']),
    isKnownVerdict: function(verdict) { return verdict === 'REGISTRY_PASS' || verdict === 'REGISTRY_FAIL'; }
  }, ['../src/commands/challenge'], function(challenge) {
    const originalExit = process.exit;
    const originalLog = console.log;
    const originalError = console.error;
    const logs = [];
    const errors = [];
    process.exit = function(code) { throw new Error('expected process.exit(' + code + ')'); };
    console.log = function(message) { logs.push(String(message)); };
    console.error = function(message) { errors.push(String(message)); };
    try {
      challenge(root, {});
      assert.ok(logs.includes('ALLOWED_VERDICTS: REGISTRY_PASS | REGISTRY_FAIL'), logs.join('\n'));
      assert.throws(function() {
        challenge(root, { recordResult: 'UNKNOWN' });
      }, /expected process\.exit\(1\)/);
      assert.ok(errors.includes('[ERROR] Invalid verdict: UNKNOWN. Allowed: REGISTRY_PASS, REGISTRY_FAIL'), errors.join('\n'));
    } finally {
      process.exit = originalExit;
      console.log = originalLog;
      console.error = originalError;
    }
  });
});

test('Challenge derives every inline reviewer hint from the governance Contract', function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-governance-challenge-inline-'));
  const specPath = path.join(root, 'spec.md');
  fs.writeFileSync(specPath, '---\nmode: micro\n---\nChallenge Verdict:\nBacktrack Target:\nChallenge Summary:\nChallenge Executed By:\nChallenge Executed At:\nChallenge Evidence:\n', 'utf-8');

  withInjectedGovernanceContract({
    verdicts: Object.freeze(['PASS']),
    isKnownVerdict: function(verdict) { return verdict === 'PASS'; },
    isAuditableReviewer: function(mode, reviewer) { return mode === 'micro' && reviewer === 'subagent:fixture'; },
    backtrackTarget: function() { return 'Ready'; }
  }, ['../src/commands/challenge'], function(challenge) {
    const originalExit = process.exit;
    const originalLog = console.log;
    const originalError = console.error;
    const errors = [];
    process.exit = function(code) { throw new Error('expected process.exit(' + code + ')'); };
    console.log = function() {};
    console.error = function(message) { errors.push(String(message)); };
    try {
      assert.throws(function() {
        challenge(root, { spec: specPath, recordResult: 'PASS', summary: 'missing reviewer' });
      }, /expected process\.exit\(3\)/);
      assert.equal(errors.pop(), '[ERROR] --executed-by is required with --record-result (use subagent:<id>|external-agent:<id>|human:<name>|inline).');

      assert.throws(function() {
        challenge(root, { spec: specPath, recordResult: 'PASS', summary: 'invalid reviewer', executedBy: 'inline' });
      }, /expected process\.exit\(3\)/);
      assert.equal(errors.pop(), '[ERROR] --executed-by must be subagent:<id>, external-agent:<id>, or human:<name>.');
    } finally {
      process.exit = originalExit;
      console.log = originalLog;
      console.error = originalError;
    }
  });
});

test('validate delegates micro Plan fields to the governance Contract', function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-governance-validate-'));
  const specPath = path.join(root, 'mydocs', 'specs', 'micro.md');
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, '---\nmode: micro\n---\n## Acceptance Criteria\n### AC-001: registry fields\nVerification: unit\nTest: tests/example.test.js\n\n## Plan\nImpact Scope: one file\nData Impact: none\nInterface Impact: none\nAcceptance: preserved\nVerification: unit\n', 'utf-8');

  withInjectedGovernanceContract({
    modeFields: function(mode) {
      return mode === 'micro' ? { required: ['Registry-only'], recommended: [] } : { required: [], recommended: [] };
    }
  }, ['../src/commands/validate'], function(validate) {
    const result = validate.validateSpec(specPath, { archiveReady: true, projectDir: root });
    assert.ok(result.issues.includes('Micro Plan must include Registry-only.'), result.issues.join('\n'));
  });
});

test('validate treats every legal nonpassing Contract verdict as an adversarial failure', function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-governance-validate-verdict-'));
  const specPath = path.join(root, 'mydocs', 'specs', 'contract-verdict.md');
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, '---\nmode: micro\n---\n## Intake\ncontract verdict\n\n## Plan\nImpact Scope: fixture\nData Impact: none\nInterface Impact: none\nAcceptance: fixture\nVerification: unit\n\nPlan Approved By: agent:fixture\nApproved At: 2026-01-01T00:00:00Z\nGate Evidence: fixture\n\nChallenge Verdict: BLOCKED_BY_CONTRACT\nBacktrack Target: Plan\nChallenge Summary: contract blocked\nChallenge Evidence: BLOCKED_BY_CONTRACT - contract blocked\n', 'utf-8');

  withInjectedGovernanceContract({
    verdicts: Object.freeze(['PASS', 'BLOCKED_BY_CONTRACT']),
    isKnownVerdict: function(verdict) { return verdict === 'PASS' || verdict === 'BLOCKED_BY_CONTRACT'; },
    isPassingVerdict: function(verdict) { return verdict === 'PASS'; },
    backtrackTarget: function(verdict) { return verdict === 'BLOCKED_BY_CONTRACT' ? 'Plan' : verdict === 'PASS' ? 'Ready' : ''; }
  }, ['../src/core/spec-state', '../src/commands/validate'], function(specState, validate) {
    const result = validate.validateSpec(specPath, { projectDir: root });
    assert.ok(result.issues.includes('Adversarial Challenge failed: BLOCKED_BY_CONTRACT.'), result.issues.join('\n'));
    assert.equal(specState.challengeFacts(fs.readFileSync(specPath, 'utf-8')).passed, false);
  });
});

test('spec-state derives verdict exports, passing state, and failed routing from the governance Contract', function() {
  withInjectedGovernanceContract({
    verdicts: Object.freeze(['REGISTRY_PASS', 'REGISTRY_FAIL']),
    isKnownVerdict: function(verdict) { return verdict === 'REGISTRY_PASS' || verdict === 'REGISTRY_FAIL'; },
    isPassingVerdict: function(verdict) { return verdict === 'REGISTRY_PASS'; },
    backtrackTarget: function(verdict) {
      if (verdict === 'REGISTRY_PASS') return 'Ready';
      if (verdict === 'REGISTRY_FAIL') return 'Registry Repair';
      return '';
    }
  }, ['../src/core/spec-state'], function(specState) {
    assert.deepEqual(specState.VERDICTS, ['REGISTRY_PASS', 'REGISTRY_FAIL']);
    assert.deepEqual(specState.VERDICT_TO_TARGET, {
      REGISTRY_PASS: 'Ready',
      REGISTRY_FAIL: 'Registry Repair'
    });
    const passed = specState.challengeFacts('Challenge Verdict: registry_pass');
    assert.equal(passed.allowed, true);
    assert.equal(passed.passed, true);
    assert.equal(passed.expectedTarget, 'Ready');
    const failed = specState.challengeFacts('Challenge Verdict: registry_fail');
    assert.equal(failed.allowed, true);
    assert.equal(failed.passed, false);
    assert.equal(failed.expectedTarget, 'Registry Repair');
    const state = specState.evaluate({
      exists: true,
      status: 'draft',
      mode: 'micro',
      content: '## Intake\nregistry fixture\n\n## Plan\nImpact Scope: fixture\nData Impact: none\nInterface Impact: none\nAcceptance: fixture\nVerification: unit\n\nPlan Approved By: agent:fixture\nApproved At: 2026-01-01T00:00:00Z\nGate Evidence: fixture\n\nChallenge Verdict: REGISTRY_FAIL\nBacktrack Target: Registry Repair\nChallenge Summary: registry failure\nChallenge Evidence: REGISTRY_FAIL - registry failure\nChallenge Executed By: subagent:fixture\nChallenge Executed At: 2026-01-01T00:02:00Z',
      executeLog: {
        exists: true,
        content: '## Execute Log\n---\nStep: completion-verification\nStatus: DONE\nResult: fixture complete\nAC Coverage Summary:\n  - AC-001: PASS\nFour-Axis Checklist:\n  - Axis 0 (Intake): aligned\n  - Axis 1 (Design/Acceptance/Plan): complete\n  - Axis 2 (Code Diff): within boundary\n  - Axis 3 (Execute Log): faithful\nVerification: node --test\nTimestamp: 2026-01-01T00:01:00Z\n---'
      }
    });
    assert.equal(state.gates.challenge.state, 'failed');
    assert.equal(state.backtrackTarget, 'Registry Repair');
    assert.equal(state.nextAction, 'repair_registry_repair');
  });
});

test('verification readiness delegates e2e Provider requirements to the governance Contract', function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-governance-readiness-'));
  withInjectedGovernanceContract({
    requiresProvider: function(verification) { return String(verification).trim().toLowerCase() === 'registry-e2e'; }
  }, ['../src/verification/readiness'], function(readiness) {
    const result = readiness.inspect('## Acceptance Criteria\n### AC-001: registry verification\nVerification: registry-e2e\nTest: tests/registry.test.js', root);
    assert.deepEqual(result, {
      state: 'required',
      requiredProviders: [],
      missingProviders: [],
      issues: ['E2E Acceptance Criteria require Provider for: AC-001.']
    });
  });
});

function readProjection(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf-8');
}

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

test('Spec templates make the Contract mode fields and conditional E2E Provider rule visible', function() {
  const standard = readProjection('templates/spec-standard.md');
  const lite = readProjection('templates/spec-lite.md');
  const micro = readProjection('templates/spec-micro.md');
  const microFields = governanceContract.modeFields('micro');

  [
    ['standard', standard],
    ['lite', lite],
    ['micro', micro]
  ].forEach(function(entry) {
    const mode = entry[0];
    const template = entry[1];
    assert.match(template, new RegExp('^mode: ' + mode + '$', 'm'), mode + ' template must declare its mode');
    assert.match(template, /Provider:\s*<required for e2e; named provider id>/, mode + ' template must make Provider conditional on e2e');
  });

  const requiredStart = micro.indexOf('Required fields:');
  const conditionalStart = micro.indexOf('Conditional field:', requiredStart);
  const recommendedStart = micro.indexOf('Recommended fields:');
  const approvalStart = micro.indexOf('Plan Approved By:', recommendedStart);
  assert.ok(requiredStart >= 0 && conditionalStart > requiredStart, 'micro template must delimit Required fields');
  assert.ok(recommendedStart >= 0 && approvalStart > recommendedStart, 'micro template must delimit Recommended fields');

  const requiredSection = micro.slice(requiredStart, conditionalStart);
  const recommendedSection = micro.slice(recommendedStart, approvalStart);
  microFields.required.forEach(function(field) {
    assert.match(requiredSection, new RegExp('^' + field + ':', 'm'), 'Required fields must contain ' + field + ' before the next section');
    assert.doesNotMatch(recommendedSection, new RegExp('^' + field + ':', 'm'), 'Recommended fields must not satisfy required field ' + field);
  });
  microFields.recommended.forEach(function(field) {
    assert.match(recommendedSection, new RegExp('^' + field + ':', 'm'), 'Recommended fields must contain ' + field + ' before the next section');
    assert.doesNotMatch(requiredSection, new RegExp('^' + field + ':', 'm'), 'Required fields must not satisfy recommended field ' + field);
  });
});

test('Skill and public docs state the current workflow, Provider requirement, and legacy-read compatibility', function() {
  const workflow = /Research -> Innovate -> Design\/Acceptance -> Plan -> Execute\* -> Challenge -> \(Cruise\) -> Learning Check -> Archive/;
  const e2eProvider = /Verification:\s*e2e[\s\S]{0,180}Provider:/i;
  const legacyReadable = /(?:归档|archived|legacy|历史)[^\n]{0,180}(?:可读|readable|兼容|compatible|迁移)/i;

  ['SKILL.md', 'README.md', 'GUIDE.md'].forEach(function(file) {
    const text = readProjection(file);
    assert.match(text, workflow, file + ' must describe the current RIPER workflow');
    assert.match(text, e2eProvider, file + ' must state that e2e verification requires Provider metadata');
    assert.match(text, legacyReadable, file + ' must state that archived or legacy artifacts remain readable without migration');
  });
});

test('package description names the complete current RIPER lifecycle', function() {
  const pkg = JSON.parse(readProjection('package.json'));
  const description = pkg.description;

  [
    'Research',
    'Innovate',
    'Design/Acceptance',
    'Plan',
    'Execute',
    'Challenge',
    'Learning Check',
    'Archive'
  ].forEach(function(phase) {
    assert.ok(description.includes(phase), 'package description must include ' + phase + ': ' + description);
  });
});

test('AI config generator reads its default mode from the governance Contract', function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-governance-ai-default-mode-'));

  withInjectedGovernanceContract({
    defaults: Object.freeze({ mode: 'lite' })
  }, ['../src/commands/_gen-ai-configs'], function(genAiConfigs) {
    genAiConfigs.run(root);
  });

  assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf-8'), /^- Mode: lite$/m);
});

test('init refreshes all managed root AI blocks without touching project text or existing Cruise override', function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-governance-init-projection-'));
  const init = require('../src/commands/init');
  const files = [
    ['AGENTS.md', '# Project Agents\n\nKeep this project-specific agent rule.\n\n<!-- sdd-riper:start -->\nobsolete managed text\n<!-- sdd-riper:end -->\n\nKeep this agent footer.\n'],
    ['CLAUDE.md', '# Project Claude\n\nKeep this project-specific Claude rule.\n\n<!-- sdd-riper:start -->\nobsolete managed text\n<!-- sdd-riper:end -->\n\nKeep this Claude footer.\n'],
    ['.cursorrules', '# Project Cursor\n\nKeep this project-specific Cursor rule.\n\n<!-- sdd-riper:start -->\nobsolete managed text\n<!-- sdd-riper:end -->\n\nKeep this Cursor footer.\n'],
    ['.github/copilot-instructions.md', '# Project Copilot\n\nKeep this project-specific Copilot rule.\n\n<!-- sdd-riper:start -->\nobsolete managed text\n<!-- sdd-riper:end -->\n\nKeep this Copilot footer.\n']
  ];
  files.forEach(function(entry) {
    const filePath = path.join(root, entry[0]);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, entry[1], 'utf-8');
  });
  const configPath = path.join(root, '.sdd-config');
  const configBefore = Buffer.from('DOCS_DIR="mydocs"\nCRUISE_MAX_ITERATIONS="20"\n', 'utf-8');
  fs.writeFileSync(configPath, configBefore);

  init(root, { mode: 'standard' });
  const firstRun = new Map();

  files.forEach(function(entry) {
    const file = entry[0];
    const text = fs.readFileSync(path.join(root, file), 'utf-8');
    const kind = file === 'AGENTS.md' ? 'agent' : file === 'CLAUDE.md' ? 'Claude' : file === '.cursorrules' ? 'Cursor' : 'Copilot';
    assert.ok(text.includes('Keep this project-specific ' + kind + ' rule.'), file + ' must preserve text before the managed block');
    assert.ok(text.includes('Keep this ' + kind + ' footer.'), file + ' must preserve text after the managed block');
    assert.equal(countOccurrences(text, '<!-- sdd-riper:start -->'), 1, file + ' must have one managed block start');
    assert.equal(countOccurrences(text, '<!-- sdd-riper:end -->'), 1, file + ' must have one managed block end');
    assert.ok(text.indexOf('<!-- sdd-riper:start -->') < text.indexOf('<!-- sdd-riper:end -->'), file + ' must keep its managed markers in a valid pair order');
    assert.equal(text.includes('obsolete managed text'), false, file + ' must refresh stale managed content');
    assert.match(text, /Research -> Innovate -> Design\/Acceptance -> Plan -> Execute\* -> Challenge -> \(Cruise\) -> Learning Check -> Archive/, file + ' managed block must expose the current workflow');
    assert.match(text, /Verification:\s*e2e[\s\S]{0,180}Provider:/i, file + ' managed block must state the conditional Provider rule');
    assert.match(text, /project-profile-revision/, file + ' managed block must retain exact Profile guidance');
    assert.match(text, /request_archive_authorization/, file + ' managed block must retain archive authorization guidance');
    assert.match(text, /Independent Review is separate from approval/, file + ' managed block must retain independent-review guidance');
    assert.match(text, /Do not manually fill Challenge Evidence fields; use `sdd challenge --record-result/, file + ' managed block must prohibit manual Challenge Evidence writes');
    firstRun.set(file, fs.readFileSync(path.join(root, file)));
  });
  assert.deepEqual(fs.readFileSync(configPath), configBefore, 'ordinary init must preserve the repository Cruise override');

  init(root, { mode: 'standard' });
  files.forEach(function(entry) {
    const file = entry[0];
    assert.deepEqual(fs.readFileSync(path.join(root, file)), firstRun.get(file), file + ' must be byte-idempotent on a second init');
  });
  assert.deepEqual(fs.readFileSync(configPath), configBefore, 'a second ordinary init must preserve the repository Cruise override');
});

test('AI config generator preserves malformed markers, appends one managed block, and then stays byte-idempotent', function() {
  const genAiConfigs = require('../src/commands/_gen-ai-configs');
  const malformed = [
    'Before\n<!-- sdd-riper:start -->\nProject text after a lone start\n',
    'Before\nProject text before a lone end\n<!-- sdd-riper:end -->\nAfter\n',
    'Before\n<!-- sdd-riper:start -->\nFirst project segment\n<!-- sdd-riper:end -->\nMiddle\n<!-- sdd-riper:start -->\nSecond project segment\n<!-- sdd-riper:end -->\nAfter\n',
    'Before\n<!-- sdd-riper:end -->\nProject text between reversed markers\n<!-- sdd-riper:start -->\nAfter\n',
    'Before\n<!-- sdd-riper:start -->\n## Project Notes\n\nThis project uses SDD-RIPER.\nUser project text must survive.\n<!-- sdd-riper:end -->\nAfter\n<!-- sdd-riper:start -->\nUnpaired project marker\n'
  ];

  malformed.forEach(function(content, index) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-governance-ai-malformed-' + index + '-'));
    const target = path.join(root, 'AGENTS.md');
    const original = Buffer.from(content, 'utf-8');
    fs.writeFileSync(target, original);

    genAiConfigs.run(root, 'standard');
    const firstRun = fs.readFileSync(target);
    const firstText = firstRun.toString('utf-8');
    assert.ok(firstText.startsWith(content), 'malformed marker case ' + index + ' must preserve all original project text on the first run');
    assert.equal(countOccurrences(firstText, '<!-- sdd-riper:start -->'), countOccurrences(content, '<!-- sdd-riper:start -->') + 1, 'malformed marker case ' + index + ' must append exactly one managed block start');
    assert.equal(countOccurrences(firstText, '<!-- sdd-riper:end -->'), countOccurrences(content, '<!-- sdd-riper:end -->') + 1, 'malformed marker case ' + index + ' must append exactly one managed block end');
    assert.match(firstText, /<!-- sdd-riper:start -->\n## SDD-RIPER Agent Instructions[\s\S]*<!-- sdd-riper:end -->\n$/, 'malformed marker case ' + index + ' must append a complete managed block');
    genAiConfigs.run(root, 'standard');
    assert.deepEqual(fs.readFileSync(target), firstRun, 'malformed marker case ' + index + ' must refresh only its appended managed block and remain byte-idempotent on the second run');
  });
});
