'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const projection = require('../src/console/projection');

test('普通 Research 任务不因未来归档校验问题被标记为 Needs repair', () => {
  const result = projection.workStateForSpec({
    status: 'draft',
    phase: 'research',
    validate: { issueCount: 12 },
    workflow: {
      phase: 'research',
      nextAction: 'repair_research',
      facts: { challenge: { allowed: false, verdict: 'FAIL_SPEC' } },
      gates: { plan: { blockers: [] } }
    }
  });

  assert.deepEqual(result, {
    id: 'in_progress',
    label: 'In progress',
    tone: 'progress'
  });
});

test('只有显式失败的 Challenge verdict 才会派生 Needs repair', () => {
  const result = projection.workStateForSpec({
    status: 'draft',
    phase: 'execute',
    workflow: {
      phase: 'execute',
      facts: { challenge: { allowed: true, verdict: 'FAIL_EXECUTE' } },
      gates: { plan: { blockers: [] } }
    }
  });

  assert.deepEqual(result, {
    id: 'needs_repair',
    label: 'Needs repair',
    tone: 'waiting'
  });
});

test('归档授权等待状态与普通进行中状态分离', () => {
  const result = projection.workStateForSpec({
    status: 'draft',
    phase: 'archive_authorization',
    workflow: {
      phase: 'archive_authorization',
      nextAction: 'request_archive_authorization',
      facts: { challenge: { allowed: true, verdict: 'PASS' } },
      gates: { plan: { blockers: [] } }
    }
  });

  assert.deepEqual(result, {
    id: 'awaiting_archive_authorization',
    label: 'Awaiting archive authorization',
    tone: 'waiting'
  });
});

test('归档生命周期始终显示 Archived', () => {
  const result = projection.workStateForSpec({
    status: 'archived',
    phase: 'archived',
    workflow: {
      phase: 'archived',
      facts: { challenge: { allowed: true, verdict: 'PASS' } },
      gates: { plan: { blockers: [] } }
    }
  });

  assert.deepEqual(result, {
    id: 'archived',
    label: 'Archived',
    tone: 'complete'
  });
});

test('仅缺 Plan 审批字段时显示 Awaiting plan approval', () => {
  const result = projection.workStateForSpec({
    status: 'draft',
    phase: 'plan',
    workflow: {
      phase: 'plan',
      nextAction: 'repair_plan',
      facts: { challenge: { allowed: false, verdict: '' } },
      gates: {
        plan: {
          blockers: [
            { message: 'Plan Approved By is empty.' },
            { message: 'Approved At is empty.' }
          ]
        }
      }
    }
  });

  assert.deepEqual(result, {
    id: 'awaiting_plan_approval',
    label: 'Awaiting plan approval',
    tone: 'waiting'
  });
});

test('通过前置门禁但尚未 Challenge 时显示 Awaiting challenge', () => {
  const result = projection.workStateForSpec({
    status: 'draft',
    phase: 'challenge',
    workflow: {
      phase: 'challenge',
      nextAction: 'run_challenge',
      facts: { challenge: { allowed: false, verdict: '' } },
      gates: { plan: { blockers: [] } }
    }
  });

  assert.deepEqual(result, {
    id: 'awaiting_challenge',
    label: 'Awaiting challenge',
    tone: 'waiting'
  });
});

test('confirmed current Profile 只投影状态和白名单单元摘要', () => {
  const result = projection.projectProfileView('/project', {
    resolveCurrent() {
      return {
        current: {
          revision: 'profiles/revisions/sha256-abc.json',
          profileDigest: 'sha256:abc'
        },
        revision: {
          profileDigest: 'sha256:abc',
          confirmation: { evidence: 'human-only evidence' },
          profile: {
            units: [{
              id: 'web',
              roles: ['frontend'],
              manifests: ['apps/web/package.json'],
              commandRefs: [{ name: 'build' }],
              evidence: [{ claim: 'private local fact' }]
            }],
            relations: [{ from: 'web', to: 'api', kind: 'depends-on' }],
            sourceSnapshot: [{ path: 'package.json' }]
          }
        }
      };
    }
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    state: 'confirmed',
    revision: 'profiles/revisions/sha256-abc.json',
    digest: 'sha256:abc',
    unitCount: 1,
    relationCount: 1,
    units: [{ id: 'web', roles: ['frontend'] }],
    diagnostics: []
  });
});

test('missing current Profile 返回固定恢复诊断', () => {
  const result = projection.projectProfileView('/project', {
    resolveCurrent() { return null; }
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    state: 'missing',
    revision: '',
    digest: '',
    unitCount: 0,
    relationCount: 0,
    units: [],
    diagnostics: [{
      code: 'profile-missing',
      severity: 'attention',
      message: 'No confirmed Project Profile is available.',
      recovery: 'Run the existing profile detect/review/confirm flow.'
    }]
  });
});

test('invalid current Profile 不泄漏原始异常', () => {
  const result = projection.projectProfileView('/project', {
    resolveCurrent() {
      const error = new Error('token=super-secret at C:\\Users\\alice\\profile.json');
      error.code = 'SDD_PROFILE_CURRENT_INVALID';
      throw error;
    }
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    state: 'invalid',
    revision: '',
    digest: '',
    unitCount: 0,
    relationCount: 0,
    units: [],
    diagnostics: [{
      code: 'profile-invalid',
      severity: 'attention',
      message: 'Current Project Profile cannot be read.',
      recovery: 'Inspect and repair the current Profile pointer before continuing.'
    }]
  });
});

test('归档 Spec 不生成当前 Quality Plan', () => {
  const result = projection.qualityPlanView({ status: 'archived' }, '/project', '/project/mydocs/archive/v1-task.md', {});

  assert.deepEqual(result, {
    schemaVersion: 1,
    state: 'not_applicable',
    policyVersion: '',
    source: null,
    acFacts: [],
    policyFocus: [],
    acMappings: [],
    e2eReadiness: null,
    diagnostics: [{
      code: 'quality-plan-not-applicable',
      severity: 'attention',
      message: 'Archived Specs do not generate a current Quality Plan.',
      recovery: 'Select an active Spec to inspect its current Quality Plan.'
    }]
  });
});

test('活动 Spec 的 Quality Plan 只消费其 exact revision 输入和注入的 readiness summary', () => {
  const calls = [];
  const readinessSummary = { state: 'configured', requiredProviders: ['web-e2e'], missingProviders: [], issues: [] };
  const result = projection.qualityPlanView({ status: 'draft' }, '/project', '/project/mydocs/specs/task.md', {
    readinessSummary,
    loadQualityInput(projectDir, specPath) {
      calls.push(['input', projectDir, specPath]);
      return {
        blocking: false,
        specContent: '## Acceptance Criteria',
        acFacts: [{ acId: 'AC-001', verification: 'e2e', provider: 'web-e2e' }],
        source: {
          profile: {
            revision: 'profiles/revisions/sha256-exact.json',
            digest: 'sha256:exact'
          },
          declaredAffectedUnits: ['web']
        }
      };
    },
    inspectReadiness(specContent, projectDir, specPath) {
      calls.push(['readiness', specContent, projectDir, specPath]);
      throw new Error('injected readiness summary must avoid a second inspection');
    },
    buildQualityPlan(input) {
      calls.push(['planner', input.source.profile.revision, input.e2eReadiness.state]);
      return {
        policyVersion: '1',
        source: {
          profile: input.source.profile,
          declaredAffectedUnits: ['web'],
          effectiveAffectedUnits: ['web']
        },
        acFacts: [{ acId: 'AC-001', verification: 'e2e', provider: 'web-e2e', manualEvidence: '' }],
        policyFocus: [{ id: 'frontend-behavior', recommendedCapabilities: ['e2e-evidence'], reasons: [] }],
        acMappings: [{ acId: 'AC-001', verification: 'e2e', verificationCapability: 'e2e-evidence' }],
        e2eReadiness: input.e2eReadiness,
        diagnostics: [],
        blocking: false
      };
    },
    resolveCurrent() { throw new Error('Quality projection must not read current Profile.'); }
  });

  assert.deepEqual(calls, [
    ['input', '/project', '/project/mydocs/specs/task.md'],
    ['planner', 'profiles/revisions/sha256-exact.json', 'configured']
  ]);
  assert.deepEqual(result, {
    schemaVersion: 1,
    state: 'available',
    policyVersion: '1',
    source: {
      profileRevision: 'profiles/revisions/sha256-exact.json',
      profileDigest: 'sha256:exact',
      declaredAffectedUnits: ['web'],
      effectiveAffectedUnits: ['web']
    },
    acFacts: [{ acId: 'AC-001', verification: 'e2e', provider: 'web-e2e' }],
    policyFocus: [{ id: 'frontend-behavior', recommendedCapabilities: ['e2e-evidence'], reasons: [] }],
    acMappings: [{ acId: 'AC-001', verification: 'e2e', verificationCapability: 'e2e-evidence' }],
    e2eReadiness: readinessSummary,
    diagnostics: []
  });
});

test('Quality 输入已 blocking 时不读取 readiness 且保留恢复诊断', () => {
  const calls = [];
  const result = projection.qualityPlanView({ status: 'draft' }, '/project', '/project/mydocs/specs/missing-profile.md', {
    loadQualityInput() {
      calls.push('input');
      return { blocking: true, specContent: 'do not inspect' };
    },
    inspectReadiness() {
      calls.push('readiness');
      throw new Error('readiness must not run for blocking Quality input');
    },
    buildQualityPlan(input) {
      calls.push('planner');
      assert.equal(input.e2eReadiness, undefined);
      return {
        blocking: true,
        policyVersion: '1',
        source: { profile: null, declaredAffectedUnits: [], effectiveAffectedUnits: [] },
        acFacts: [{ acId: 'AC-001', verification: 'unit', provider: '', manualEvidence: '' }],
        policyFocus: [],
        acMappings: [],
        e2eReadiness: null,
        diagnostics: [{
          code: 'profile-required',
          severity: 'blocking',
          message: 'a confirmed exact Project Profile revision is required before quality policy can be projected.'
        }]
      };
    }
  });

  assert.deepEqual(calls, ['input', 'planner']);
  assert.deepEqual(result, {
    schemaVersion: 1,
    state: 'blocking',
    policyVersion: '1',
    source: {
      profileRevision: '',
      profileDigest: '',
      declaredAffectedUnits: [],
      effectiveAffectedUnits: []
    },
    acFacts: [{ acId: 'AC-001', verification: 'unit', provider: '' }],
    policyFocus: [],
    acMappings: [],
    e2eReadiness: null,
    diagnostics: [{
      code: 'profile-required',
      severity: 'blocking',
      message: 'a confirmed exact Project Profile revision is required before quality policy can be projected.'
    }]
  });
});

test('Quality source 不泄露父目录相对路径', () => {
  const result = projection.qualityPlanView({ status: 'draft' }, '/project', '/project/mydocs/specs/broken.md', {
    loadQualityInput() {
      return { blocking: true };
    },
    buildQualityPlan() {
      return {
        blocking: true,
        policyVersion: '1',
        source: {
          profile: { revision: '../private/profile.json', digest: '../private/profile-digest' },
          declaredAffectedUnits: ['../private', 'web'],
          effectiveAffectedUnits: ['..\\private', 'web']
        },
        acFacts: [],
        policyFocus: [],
        acMappings: [],
        diagnostics: []
      };
    }
  });

  assert.deepEqual(result.source, {
    profileRevision: '[PATH]',
    profileDigest: '[PATH]',
    declaredAffectedUnits: ['[PATH]', 'web'],
    effectiveAffectedUnits: ['[PATH]', 'web']
  });
  assert.doesNotMatch(JSON.stringify(result), /\.\.[\\/]/);
});

test('Quality 诊断和 readiness 只输出白名单且脱敏', () => {
  const result = projection.qualityPlanView({ status: 'draft' }, '/project', '/project/mydocs/specs/secret.md', {
    loadQualityInput() {
      return {
        blocking: false,
        specContent: 'safe source',
        acFacts: [{ acId: 'AC-001', verification: 'e2e', provider: 'web-e2e' }]
      };
    },
    inspectReadiness() {
      return {
        state: 'blocked',
        requiredProviders: ['web-e2e'],
        missingProviders: [],
        issues: ['token=super-secret at C:\\Users\\alice\\run.json'],
        rawProvider: { password: 'super-secret' }
      };
    },
    buildQualityPlan(input) {
      return {
        blocking: false,
        policyVersion: '1',
        source: { profile: null, declaredAffectedUnits: [], effectiveAffectedUnits: [] },
        acFacts: [],
        policyFocus: [],
        acMappings: [],
        e2eReadiness: input.e2eReadiness,
        diagnostics: [{
          code: 'readiness-unavailable',
          severity: 'blocking',
          message: 'token=super-secret at C:\\Users\\alice\\run.json',
          recovery: 'authorization=super-secret',
          details: { path: 'C:\\Users\\alice\\run.json', secret: 'super-secret' }
        }]
      };
    }
  });

  assert.deepEqual(result.e2eReadiness, {
    state: 'blocked',
    requiredProviders: ['web-e2e'],
    missingProviders: [],
    issues: ['token=[REDACTED] at [PATH]']
  });
  assert.deepEqual(result.diagnostics, [{
    code: 'readiness-unavailable',
    severity: 'blocking',
    message: 'token=[REDACTED] at [PATH]',
    recovery: 'Review existing verification configuration and evidence before retrying.'
  }]);
  assert.doesNotMatch(JSON.stringify(result), /super-secret|C:\\Users\\alice|rawProvider|details/);
});

test('Quality 输入读取异常返回固定 unavailable 状态且不泄漏异常', () => {
  const result = projection.qualityPlanView({ status: 'draft' }, '/project', '/project/mydocs/specs/broken.md', {
    loadQualityInput() {
      throw new Error('token=super-secret at C:\\Users\\alice\\broken.md');
    }
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    state: 'unavailable',
    policyVersion: '',
    source: null,
    acFacts: [],
    policyFocus: [],
    acMappings: [],
    e2eReadiness: null,
    diagnostics: [{
      code: 'quality-plan-unavailable',
      severity: 'attention',
      message: 'Quality Plan cannot be projected safely.',
      recovery: 'Review the existing Quality Plan input before retrying.'
    }]
  });
});

test('Quality Plan 对 AC、策略焦点与映射执行白名单投影', () => {
  const result = projection.qualityPlanView({ status: 'draft' }, '/project', '/project/mydocs/specs/safe.md', {
    loadQualityInput() { return { blocking: false, specContent: 'safe source' }; },
    inspectReadiness() { return { state: 'ready', requiredProviders: [], missingProviders: [], issues: [] }; },
    buildQualityPlan() {
      return {
        blocking: false,
        policyVersion: '1',
        source: { profile: null, declaredAffectedUnits: ['web'], effectiveAffectedUnits: ['web'] },
        acFacts: [{
          acId: 'AC-001', verification: 'e2e', provider: 'console-e2e',
          manualEvidence: 'token=super-secret', internalNote: 'C:\\Users\\alice\\secret.txt'
        }],
        policyFocus: [{
          id: 'frontend-behavior', recommendedCapabilities: ['unit-evidence', 'e2e-evidence'],
          reasons: [{ kind: 'role', unitId: 'web', role: 'frontend', internalNote: 'token=super-secret' }],
          rawRule: { credential: 'super-secret' }
        }],
        acMappings: [{
          acId: 'AC-001', verification: 'e2e', verificationCapability: 'e2e-evidence', rawRule: 'super-secret'
        }],
        e2eReadiness: null,
        diagnostics: []
      };
    }
  });

  assert.deepEqual(result.acFacts, [{ acId: 'AC-001', verification: 'e2e', provider: 'console-e2e' }]);
  assert.deepEqual(result.policyFocus, [{
    id: 'frontend-behavior',
    recommendedCapabilities: ['unit-evidence', 'e2e-evidence'],
    reasons: [{ kind: 'role', unitId: 'web', role: 'frontend' }]
  }]);
  assert.deepEqual(result.acMappings, [{
    acId: 'AC-001', verification: 'e2e', verificationCapability: 'e2e-evidence'
  }]);
  assert.doesNotMatch(JSON.stringify(result), /super-secret|C:\\Users\\alice|manualEvidence|internalNote|rawRule/);
});

test('AC Coverage projector fails closed when Coverage facts are unavailable', () => {
  const result = projection.acCoverageView({ projectDir: '/project' }, {
    coverageFacts() {
      throw new Error('token=coverage-secret at C:\\private\\coverage.md');
    }
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    completionState: 'missing',
    items: [],
    diagnostics: [{ code: 'ac-coverage-unavailable' }]
  });
  assert.doesNotMatch(JSON.stringify(result), /coverage-secret|C:\\private/);
});

test('AC Coverage projector fails closed when Coverage facts have an invalid shape', () => {
  const result = projection.acCoverageView({}, {
    coverageFacts() { return { declarations: [], records: 'not-an-array' }; }
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    completionState: 'missing',
    items: [],
    diagnostics: [{ code: 'ac-coverage-unavailable' }]
  });
});

test('AC Coverage projector folds duplicate decisions and preserves invalid prior Test evidence', () => {
  const result = projection.acCoverageView({ projectDir: '/project' }, {
    fs: { existsSync() { return false; } },
    coverageFacts() {
      return {
        declarations: [{ id: 'AC-001' }],
        records: [
          { id: 'AC-001', result: 'PASS', test: 'tests/missing.test.js', method: '', scenarios: [] },
          { id: 'AC-001', result: 'PASS', test: '', method: '', scenarios: [] }
        ]
      };
    }
  });

  assert.deepEqual(result.items, [{ acId: 'AC-001', state: 'invalid', skipApprovalState: 'not_applicable' }]);
  assert.deepEqual(result.diagnostics, [{ code: 'ac-coverage-invalid-evidence' }]);
});

test('AC Coverage projector treats an invalid SKIPPED approval timestamp as incomplete', () => {
  const result = projection.acCoverageView({}, {
    coverageFacts() {
      return {
        declarations: [{ id: 'AC-001' }],
        records: [{
          id: 'AC-001', result: 'SKIPPED', test: '', method: '', scenarios: [],
          reason: 'environment unavailable', approvedBy: 'human:fixture', approvedAt: '2026-02-30T00:00:00Z'
        }]
      };
    }
  });

  assert.deepEqual(result.items, [{ acId: 'AC-001', state: 'skipped', skipApprovalState: 'incomplete' }]);
  assert.deepEqual(result.diagnostics, [{ code: 'ac-coverage-skip-approval-incomplete' }]);
});

test('AC Coverage projector keeps a real ISO calendar timestamp approved', () => {
  const result = projection.acCoverageView({}, {
    coverageFacts() {
      return {
        declarations: [{ id: 'AC-001' }],
        records: [{
          id: 'AC-001', result: 'SKIPPED', test: '', method: '', scenarios: [],
          reason: 'environment unavailable', approvedBy: 'human:fixture', approvedAt: '2026-02-28T00:00:00+08:00'
        }]
      };
    }
  });

  assert.deepEqual(result.items, [{ acId: 'AC-001', state: 'skipped', skipApprovalState: 'approved' }]);
  assert.deepEqual(result.diagnostics, []);
});
