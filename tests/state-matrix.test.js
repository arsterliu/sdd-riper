const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const {
  runCli,
  createArchiveReadyStandard,
  createArchiveReadyLite,
  createArchiveReadyMicro,
  addLearningRecord,
  fillChallenge
} = require('./helpers/sdd-fixtures');
const specIndex = require('../src/core/spec-index');
const specState = require('../src/core/spec-state');
const projectIndexer = require('../src/core/project-indexer');
const providerReadiness = require('../src/verification/readiness');
const autonomyState = require('../src/core/autonomy-state');

const roots = [];

function project(name) {
  const dir = path.join(os.tmpdir(), 'sdd-state-matrix-' + process.pid + '-' + Date.now() + '-' + name);
  roots.push(dir);
  return dir;
}

function routineLog(fixture, statuses) {
  const original = fs.readFileSync(fixture.executeLogPath, 'utf-8');
  const log = original.replace('Step: completion-verification', statuses.map(function(status, i) {
    return 'Step: correction-' + i + '\nStatus: ' + status + '\nResult: bounded correction verified.\nTimestamp: 2026-01-01T00:00:30Z\n\n---\n';
  }).join('\n') + '\nStep: completion-verification');
  fs.writeFileSync(fixture.executeLogPath, log, 'utf-8');
  return log;
}

afterEach(function() {
  roots.splice(0).forEach(function(root) {
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('authoritative workflow state matrix', function() {
  for (const statuses of [['BUGFIX'], ['DEVIATED_MINOR'], ['BUGFIX', 'DEVIATED_MINOR']]) {
    it('projects routine corrections consistently without a Learning gate: ' + statuses.join('+'), function() {
      const fixture = createArchiveReadyStandard(project('routine-' + statuses.join('-')));
      const log = routineLog(fixture, statuses);

      const state = specState.evaluateProjectSpec(fixture.projectDir, fixture.specPath);
      assert.strictEqual(state.completionReady, true, JSON.stringify(state.blockers));
      assert.strictEqual(state.nextAction, 'request_archive_authorization');
      const validation = runCli(['validate', fixture.projectDir, '--archive-ready'], fixture.projectDir);
      assert.strictEqual(validation.status, 0, validation.output);
      const next = runCli(['next', fixture.projectDir], fixture.projectDir);
      assert.match(next.output, /NEXT_ACTION: request_archive_authorization/);
      assert.doesNotMatch(next.output, /Learning Record is required/);
      specIndex.clearCache();
      const indexed = specIndex.listSpecs(fixture.projectDir).specs[0];
      assert.strictEqual(indexed.phase, 'archive_authorization');
      assert.strictEqual(indexed.completion.learningRequired, false);
      assert.strictEqual(fs.readFileSync(fixture.executeLogPath, 'utf-8'), log);

      const denied = runCli(['archive', fixture.projectDir, fixture.taskName], fixture.projectDir);
      assert.notStrictEqual(denied.status, 0, denied.output);
      assert.ok(fs.existsSync(fixture.specPath));
    });
  }

  it('routine corrections never waive acceptance, completion, Challenge or supervised approval', function() {
    const fixture = createArchiveReadyStandard(project('routine-gates'));
    const originalSpec = fs.readFileSync(fixture.specPath, 'utf-8');
    const originalLog = routineLog(fixture, ['BUGFIX', 'DEVIATED_MINOR']);
    const cases = [
      { name: 'missing coverage', log: s => s.replace('  - AC-001: PASS', ''), evidence: /AC Coverage/i },
      { name: 'failed coverage', log: s => s.replace('AC-001: PASS', 'AC-001: FAIL'), evidence: /AC Coverage/i },
      { name: 'incomplete completion', log: s => s.replace('Axis 1 (Design/Acceptance/Plan): complete', 'Axis 1 (Design/Acceptance/Plan): incomplete'), evidence: /Axis 1|four-axis/i },
      { name: 'failed Challenge', spec: s => s.replace(/^Challenge Verdict:.*$/m, 'Challenge Verdict: FAIL_CODE').replace(/^Backtrack Target:.*$/m, 'Backtrack Target: Execute / Debug').replace(/^Challenge Evidence:.*$/m, 'Challenge Evidence: FAIL_CODE - independent fixture review'), evidence: /FAIL_CODE|Challenge/i },
      { name: 'stale Challenge', spec: s => s.replace(/^Challenge Executed At:.*$/m, 'Challenge Executed At: 2025-12-31T23:59:00Z'), evidence: /stale|Challenge/i },
      { name: 'unapproved supervised Plan', spec: s => s.replace('autonomy-mode: "auto"', 'autonomy-mode: "supervised"'), evidence: /human|Plan Approved By/i },
      { name: 'failed Learning review', spec: s => s.replace(/^Challenge Verdict:.*$/m, 'Challenge Verdict: FAIL_LEARNING').replace(/^Backtrack Target:.*$/m, 'Backtrack Target: Learning Check').replace(/^Challenge Evidence:.*$/m, 'Challenge Evidence: FAIL_LEARNING - independent fixture review'), evidence: /FAIL_LEARNING|Challenge/i }
    ];
    for (const scenario of cases) {
      fs.writeFileSync(fixture.specPath, scenario.spec ? scenario.spec(originalSpec) : originalSpec, 'utf-8');
      fs.writeFileSync(fixture.executeLogPath, scenario.log ? scenario.log(originalLog) : originalLog, 'utf-8');
      const state = specState.evaluateProjectSpec(fixture.projectDir, fixture.specPath);
      assert.strictEqual(state.facts.learningRequired, false, scenario.name);
      assert.strictEqual(state.completionReady, false, scenario.name);
      assert.match(state.blockers.map(b => b.message).join('\n'), scenario.evidence, scenario.name);
      const validation = runCli(['validate', fixture.projectDir, '--archive-ready'], fixture.projectDir);
      assert.notStrictEqual(validation.status, 0, scenario.name);
      specIndex.clearCache();
      assert.notStrictEqual(specIndex.listSpecs(fixture.projectDir).specs[0].phase, 'archive_authorization', scenario.name);
    }
  });

  it('routine corrections never authorize supervised continuation after scope, risk or Plan changes', function() {
    const fixture = createArchiveReadyStandard(project('routine-authorization'));
    routineLog(fixture, ['BUGFIX', 'DEVIATED_MINOR']);
    let content = fs.readFileSync(fixture.specPath, 'utf-8')
      .replace('autonomy-mode: "auto"', 'autonomy-mode: "supervised"')
      .replace('ui-impact: ""', 'ui-impact: "no"')
      .replace('visual-context-intent: ""', 'visual-context-intent: "not-applicable"')
      .replace('Plan Approved By: agent:fixture', 'Plan Approved By: human:fixture')
      .replace(/^Challenge (?:Verdict|Summary|Executed By|Executed At|Evidence):.*$/gm, line => line.slice(0, line.indexOf(':') + 1))
      .replace(/^Backtrack Target:.*$/m, 'Backtrack Target:');
    content = autonomyState.appendEvent(content, {
      eventId: 'supervised-fixture', eventType: 'plan_authorization', mode: 'supervised', gate: 'Plan', decision: 'authorized',
      scopeDigest: autonomyState.scopeSnapshot(content), riskSnapshot: autonomyState.riskFlagsSnapshot([]), planDigest: autonomyState.planSnapshot(content),
      authorizedActors: 'main,worker,research-reviewer,challenge-reviewer', authorizedBy: 'human:fixture',
      authorizedAt: '2026-01-01T00:00:00Z', authorizationEvidence: 'isolated supervised fixture'
    });
    fs.writeFileSync(fixture.specPath, content, 'utf-8');
    const baseline = runCli(['autonomy', 'inspect', fixture.projectDir, '--spec', fixture.specPath], fixture.projectDir);
    assert.match(baseline.output, /AUTHORIZATION_STATE: active/);
    assert.match(runCli(['next', fixture.projectDir], fixture.projectDir).output, /NEXT_ACTION: run_challenge/);
    for (const scenario of [
      { mutate: s => s.replace('## Intake', '## Intake\n新增范围'), stop: 'scope_changed' },
      { mutate: s => s.replace('## Plan', '## Plan\n新增 security 审查'), stop: 'risk_changed' },
      { mutate: s => s.replace('Gate Evidence: fixture plan evidence', 'Gate Evidence: changed plan evidence'), stop: 'authorization_stale' }
    ]) {
      fs.writeFileSync(fixture.specPath, scenario.mutate(content), 'utf-8');
      const next = runCli(['next', fixture.projectDir], fixture.projectDir);
      assert.match(next.output, new RegExp('STOP_REASON: ' + scenario.stop), next.output);
      assert.match(next.output, /AUTHORIZATION_STATE: required/, next.output);
      assert.match(next.output, /NEXT_ACTION: request_plan_automation_authorization/, next.output);
    }
  });

  it('exposes a pure evaluator with structured blockers and safe routing defaults', function() {
    const state = specState.evaluate({
      exists: true,
      content: 'Challenge Verdict: MAYBE\nChallenge Summary: no\nBacktrack Target: Ready\nChallenge Evidence: MAYBE - no',
      status: 'draft'
    }, {
      validationIssues: ['Challenge Verdict is invalid; allowed values are required.']
    });
    assert.strictEqual(state.completionReady, false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(state, 'archiveReady'), false);
    assert.strictEqual(state.challengeVerdict, 'FAIL_SPEC');
    assert.strictEqual(state.backtrackTarget, 'Research');
    assert.strictEqual(state.nextAction, 'repair_research');
    assert.ok(state.blockers.length > 0);
    assert.ok(state.blockers.every(function(blocker) { return blocker.code && blocker.gate && blocker.target; }));
  });

  it('evaluateProjectSpec routes completed work to archive authorization without an archive action', function() {
    const fixture = addLearningRecord(createArchiveReadyStandard(project('evaluate-project'), 'evaluate-project'));
    let spec = fs.readFileSync(fixture.specPath, 'utf-8');
    spec = spec
      .replace(/^Challenge Verdict: PASS$/m, 'Challenge Verdict:')
      .replace(/^Backtrack Target: Ready$/m, 'Backtrack Target:')
      .replace(/^Challenge Summary: independent fixture review$/m, 'Challenge Summary:')
      .replace(/^Challenge Executed By: subagent:challenge-fixture$/m, 'Challenge Executed By:')
      .replace(/^Challenge Executed At: 2026-01-01T00:02:00Z$/m, 'Challenge Executed At:')
      .replace(/^Challenge Evidence: PASS - independent fixture review$/m, 'Challenge Evidence:');
    spec = fillChallenge(spec, 'PASS_WITH_CONCERNS');
    fs.writeFileSync(fixture.specPath, spec, 'utf-8');

    const state = specState.evaluateProjectSpec(fixture.projectDir, fixture.specPath);
    assert.strictEqual(state.completionReady, true);
    assert.strictEqual(state.phase, 'archive_authorization');
    assert.strictEqual(state.nextAction, 'request_archive_authorization');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(state, 'archiveReady'), false);
    assert.deepStrictEqual(state.blockers, []);

    specIndex.clearCache();
    const indexed = specIndex.listSpecs(fixture.projectDir);
    assert.strictEqual(indexed.specs[0].phase, 'archive_authorization');
    assert.strictEqual(indexed.counts.archive_authorization, 1);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(indexed.counts, 'ready'), false);
    const summary = projectIndexer.summarize(indexed);
    assert.strictEqual(summary.awaitingArchiveAuthorization, 1);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(summary, 'ready'), false);
  });

  it('rejects an unknown Challenge Verdict instead of deriving PASS', function() {
    const fixture = createArchiveReadyStandard(project('invalid-verdict'), 'invalid-verdict');
    let spec = fs.readFileSync(fixture.specPath, 'utf-8');
    spec = spec.replace(/^Challenge Verdict: PASS$/m, 'Challenge Verdict: MAYBE');
    fs.writeFileSync(fixture.specPath, spec, 'utf-8');

    const result = runCli(['validate', fixture.projectDir, '--archive-ready'], fixture.projectDir);
    assert.notStrictEqual(result.status, 0, result.output);
    assert.match(result.output, /Challenge Verdict.*(invalid|allowed|unknown)/i);
  });

  it('rejects Challenge Evidence that disagrees with the verdict summary pair', function() {
    const fixture = createArchiveReadyStandard(project('challenge-evidence-mismatch'), 'challenge-evidence-mismatch');
    let spec = fs.readFileSync(fixture.specPath, 'utf-8');
    spec = spec.replace(
      /^Challenge Evidence: PASS - independent fixture review$/m,
      'Challenge Evidence: PASS - different summary'
    );
    fs.writeFileSync(fixture.specPath, spec, 'utf-8');

    const result = runCli(['validate', fixture.projectDir, '--archive-ready'], fixture.projectDir);
    assert.notStrictEqual(result.status, 0, result.output);
    assert.match(result.output, /Challenge Evidence does not match/i);
  });

  it('pure evaluator blocks mismatched Challenge evidence without validation pre-processing', function() {
    const fixture = createArchiveReadyStandard(project('pure-challenge-mismatch'), 'pure-challenge-mismatch');
    let spec = fs.readFileSync(fixture.specPath, 'utf-8');
    spec = spec.replace(
      /^Challenge Evidence: PASS - independent fixture review$/m,
      'Challenge Evidence: PASS - different summary'
    );
    fs.writeFileSync(fixture.specPath, spec, 'utf-8');

    const state = specState.evaluate(specState.readSnapshot(fixture.projectDir, fixture.specPath));
    assert.strictEqual(state.completionReady, false);
    assert.strictEqual(state.gates.challenge.state, 'blocked');
    assert.ok(state.gates.challenge.blockers.some(function(blocker) {
      return /Challenge Evidence does not match/i.test(blocker.message);
    }));
  });

  it('status, spec-index and workflow agree on mismatch, partial and stale Challenge evidence', function() {
    [
      {
        name: 'mismatch',
        mutate: function(spec) {
          return spec.replace(/^Challenge Evidence:.*$/m, 'Challenge Evidence: PASS - different summary');
        }
      },
      {
        name: 'partial',
        mutate: function(spec) {
          return spec.replace(/^Challenge Executed At:.*$/m, 'Challenge Executed At:');
        }
      },
      {
        name: 'stale',
        mutate: function(spec) {
          return spec.replace(/^Challenge Executed At:.*$/m, 'Challenge Executed At: 2025-12-31T23:59:00Z');
        }
      }
    ].forEach(function(scenario) {
      const fixture = createArchiveReadyStandard(project('consumer-' + scenario.name), 'consumer-' + scenario.name);
      const spec = scenario.mutate(fs.readFileSync(fixture.specPath, 'utf-8'));
      fs.writeFileSync(fixture.specPath, spec, 'utf-8');

      const status = runCli(['status', fixture.projectDir], fixture.projectDir);
      assert.match(status.output, /Challenge:\s+WARN/, scenario.name + ': ' + status.output);

      specIndex.clearCache();
      const indexed = specIndex.listSpecs(fixture.projectDir).specs.find(function(item) {
        return item.taskName === fixture.taskName;
      });
      assert.strictEqual(indexed.completion.challengePass, false, scenario.name);
      assert.strictEqual(indexed.workflow.gates.challenge.state, 'blocked', scenario.name);
      assert.notStrictEqual(indexed.phase, 'archive_authorization', scenario.name);
    });
  });

  it('lightweight project indexing cannot report malformed Acceptance as ready', async function() {
    const fixture = createArchiveReadyStandard(project('lightweight-acceptance'), 'lightweight-acceptance');
    let spec = fs.readFileSync(fixture.specPath, 'utf-8');
    spec = spec.replace(
      /## Acceptance Criteria[\s\S]*?(?=^## Plan)/m,
      '## Acceptance Criteria\n\n### AC-001: metadata is missing\n\n'
    );
    fs.writeFileSync(fixture.specPath, spec, 'utf-8');

    specIndex.clearCache();
    const full = specIndex.listSpecs(fixture.projectDir).specs[0];
    specIndex.clearCache();
    const lightweight = specIndex.listSpecs(fixture.projectDir, { lightweight: true }).specs[0];
    assert.strictEqual(full.phase, 'acceptance');
    assert.strictEqual(lightweight.phase, full.phase);
    assert.strictEqual(lightweight.completion.acceptance, false);

    projectIndexer.clear();
    projectIndexer.enqueueRefresh(fixture.projectDir, true);
    await new Promise(function(resolve) { setImmediate(resolve); });
    const summary = projectIndexer.summarize(projectIndexer.getSnapshot(fixture.projectDir));
    assert.strictEqual(summary.awaitingArchiveAuthorization, 0);
    assert.strictEqual(summary.latestSpec.phase, 'acceptance');
  });

  it('full, lightweight and project indexing agree on AC Coverage blockers', async function() {
    const scenarios = [
      {
        name: 'missing-declared-ac',
        mutate: function(fixture) {
          let spec = fs.readFileSync(fixture.specPath, 'utf-8');
          spec = spec.replace(
            /(?=^## Plan)/m,
            '### AC-002: second declared acceptance\nRequirement: second coverage\nType: functional\nVerification: unit\nAutomated: yes\nTest: tests/state-matrix.test.js\n\n'
          );
          fs.writeFileSync(fixture.specPath, spec, 'utf-8');
        }
      },
      {
        name: 'failed-coverage',
        mutate: function(fixture) {
          let log = fs.readFileSync(fixture.executeLogPath, 'utf-8');
          log = log.replace(/AC-001: PASS/g, 'AC-001: FAIL');
          fs.writeFileSync(fixture.executeLogPath, log, 'utf-8');
        }
      },
      {
        name: 'unapproved-skipped',
        mutate: function(fixture) {
          let log = fs.readFileSync(fixture.executeLogPath, 'utf-8');
          log = log.replace(/AC-001: PASS/g, 'AC-001: SKIPPED');
          fs.writeFileSync(fixture.executeLogPath, log, 'utf-8');
        }
      }
    ];

    for (const scenario of scenarios) {
      const fixture = createArchiveReadyStandard(project('coverage-' + scenario.name), 'coverage-' + scenario.name);
      scenario.mutate(fixture);

      const pure = specState.evaluate(specState.readSnapshot(fixture.projectDir, fixture.specPath));
      assert.strictEqual(pure.completionReady, false, scenario.name + ': pure evaluator');
      assert.strictEqual(pure.gates.completion.state, 'blocked', scenario.name + ': completion gate');

      specIndex.clearCache();
      const full = specIndex.listSpecs(fixture.projectDir).specs[0];
      specIndex.clearCache();
      const lightweight = specIndex.listSpecs(fixture.projectDir, { lightweight: true }).specs[0];
      assert.notStrictEqual(full.phase, 'archive_authorization', scenario.name + ': full');
      assert.strictEqual(lightweight.phase, full.phase, scenario.name + ': lightweight');
      assert.strictEqual(lightweight.completion.completionVerification, false, scenario.name);

      projectIndexer.clear();
      projectIndexer.enqueueRefresh(fixture.projectDir, true);
      await new Promise(function(resolve) { setImmediate(resolve); });
      const summary = projectIndexer.summarize(projectIndexer.getSnapshot(fixture.projectDir));
      assert.strictEqual(summary.awaitingArchiveAuthorization, 0, scenario.name + ': project summary');
    }
  });

  it('accepts a standard-order SKIPPED record with human approval after Scenarios', function() {
    const fixture = createArchiveReadyStandard(project('coverage-approved-skipped'), 'coverage-approved-skipped');
    let log = fs.readFileSync(fixture.executeLogPath, 'utf-8');
    log = log.replace(
      '  - AC-001: PASS',
      [
        '  - AC-001: SKIPPED',
        '    Scenarios:',
        '      - "fixture passes": PASS',
        '    Test: tests/state-matrix.test.js',
        '    Method: manual',
        '    Reason: fixture environment unavailable',
        '    Approved By: human:fixture',
        '    Approved At: 2026-01-01T00:00:30Z'
      ].join('\n')
    );
    fs.writeFileSync(fixture.executeLogPath, log, 'utf-8');

    const pure = specState.evaluate(specState.readSnapshot(fixture.projectDir, fixture.specPath));
    assert.strictEqual(pure.completionReady, true, JSON.stringify(pure.blockers));

    const fullValidation = runCli(['validate', fixture.projectDir, '--archive-ready'], fixture.projectDir);
    assert.strictEqual(fullValidation.status, 0, fullValidation.output);

    specIndex.clearCache();
    const full = specIndex.listSpecs(fixture.projectDir).specs[0];
    specIndex.clearCache();
    const lightweight = specIndex.listSpecs(fixture.projectDir, { lightweight: true }).specs[0];
    assert.strictEqual(full.phase, 'archive_authorization');
    assert.strictEqual(lightweight.phase, full.phase);
  });

  it('latest AC Coverage result overrides an earlier PASS', function() {
    ['FAIL', 'SKIPPED'].forEach(function(latestResult) {
      const suffix = latestResult.toLowerCase();
      const fixture = createArchiveReadyStandard(project('coverage-latest-' + suffix), 'coverage-latest-' + suffix);
      let log = fs.readFileSync(fixture.executeLogPath, 'utf-8');
      const earlier = [
        '---',
        'Step: 1 - earlier verification',
        'Status: DONE',
        'AC Coverage:',
        '  - AC-001: PASS',
        '    Scenarios:',
        '      - "fixture passes": PASS',
        '    Test: tests/state-matrix.test.js',
        '    Method: unit',
        'Timestamp: 2026-01-01T00:00:30Z',
        '---',
        ''
      ].join('\n');
      log = log.replace('---\nStep: completion-verification', earlier + '---\nStep: completion-verification');
      log = log.replace(
        'Result: fixture verification complete.\nAC Coverage:\n  - AC-001: PASS\nFour-Axis Checklist:',
        'Result: fixture verification complete.\nAC Coverage:\n  - AC-001: ' + latestResult + '\nFour-Axis Checklist:'
      );
      fs.writeFileSync(fixture.executeLogPath, log, 'utf-8');

      const pure = specState.evaluate(specState.readSnapshot(fixture.projectDir, fixture.specPath));
      assert.strictEqual(pure.completionReady, false, latestResult + ': pure evaluator');
      assert.strictEqual(pure.gates.completion.state, 'blocked', latestResult + ': completion gate');

      const fullValidation = runCli(['validate', fixture.projectDir, '--archive-ready'], fixture.projectDir);
      assert.notStrictEqual(fullValidation.status, 0, latestResult + ': ' + fullValidation.output);

      specIndex.clearCache();
      const full = specIndex.listSpecs(fixture.projectDir).specs[0];
      specIndex.clearCache();
      const lightweight = specIndex.listSpecs(fixture.projectDir, { lightweight: true }).specs[0];
      assert.notStrictEqual(full.phase, 'archive_authorization', latestResult + ': full');
      assert.strictEqual(lightweight.phase, full.phase, latestResult + ': lightweight');
    });
  });

  it('full, lightweight and project indexing agree when the latest PASS Test file is missing', async function() {
    const fixture = createArchiveReadyStandard(project('coverage-missing-test-file'), 'coverage-missing-test-file');
    let log = fs.readFileSync(fixture.executeLogPath, 'utf-8');
    log = log.replace(
      '  - AC-001: PASS',
      [
        '  - AC-001: PASS',
        '    Scenarios:',
        '      - "fixture passes": PASS',
        '    Test: tests/does-not-exist.test.js',
        '    Method: unit'
      ].join('\n')
    );
    fs.writeFileSync(fixture.executeLogPath, log, 'utf-8');

    const pure = specState.evaluate(specState.readSnapshot(fixture.projectDir, fixture.specPath));
    assert.strictEqual(pure.completionReady, false, 'pure evaluator');
    assert.strictEqual(pure.gates.completion.state, 'blocked', 'completion gate');

    specIndex.clearCache();
    const full = specIndex.listSpecs(fixture.projectDir).specs[0];
    specIndex.clearCache();
    const lightweight = specIndex.listSpecs(fixture.projectDir, { lightweight: true }).specs[0];
    assert.notStrictEqual(full.phase, 'archive_authorization', 'full');
    assert.strictEqual(lightweight.phase, full.phase, 'lightweight');

    projectIndexer.clear();
    projectIndexer.enqueueRefresh(fixture.projectDir, true);
    await new Promise(function(resolve) { setImmediate(resolve); });
    const summary = projectIndexer.summarize(projectIndexer.getSnapshot(fixture.projectDir));
    assert.strictEqual(summary.awaitingArchiveAuthorization, 0, 'project summary');
  });

  it('full, lightweight and project indexing agree on remaining archive-only blockers', async function() {
    const scenarios = [
      {
        name: 'unresolved-placeholder',
        create: createArchiveReadyStandard,
        mutate: function(fixture) {
          let spec = fs.readFileSync(fixture.specPath, 'utf-8');
          spec = spec.replace('## Summary', '## Summary\n\n[TBD]');
          fs.writeFileSync(fixture.specPath, spec, 'utf-8');
        }
      },
      {
        name: 'standard-skipped-innovate',
        create: createArchiveReadyStandard,
        mutate: function(fixture) {
          let spec = fs.readFileSync(fixture.specPath, 'utf-8');
          spec = spec.replace(
            /## Innovate Options[\s\S]*?(?=^## Design Reference)/m,
            '## Innovate Options\n\nInnovate: Skipped\nReason: fixture reason\n\n'
          );
          fs.writeFileSync(fixture.specPath, spec, 'utf-8');
        }
      },
      {
        name: 'lite-skipped-without-reason',
        create: createArchiveReadyLite,
        mutate: function(fixture) {
          let spec = fs.readFileSync(fixture.specPath, 'utf-8');
          spec = spec.replace(
            /## Innovate Options[\s\S]*?(?=^## Design Reference)/m,
            '## Innovate Options\n\nInnovate: Skipped\n\n'
          );
          fs.writeFileSync(fixture.specPath, spec, 'utf-8');
        }
      },
      {
        name: 'git-missing-diff-base',
        create: createArchiveReadyStandard,
        mutate: function(fixture) {
          execFileSync('git', ['init'], { cwd: fixture.projectDir, stdio: 'ignore' });
        }
      }
    ];

    for (const scenario of scenarios) {
      const fixture = scenario.create(project('remaining-' + scenario.name), 'remaining-' + scenario.name);
      scenario.mutate(fixture);

      const pure = specState.evaluate(specState.readSnapshot(fixture.projectDir, fixture.specPath));
      assert.strictEqual(pure.completionReady, false, scenario.name + ': pure evaluator');

      specIndex.clearCache();
      const full = specIndex.listSpecs(fixture.projectDir).specs[0];
      specIndex.clearCache();
      const lightweight = specIndex.listSpecs(fixture.projectDir, { lightweight: true }).specs[0];
      assert.notStrictEqual(full.phase, 'archive_authorization', scenario.name + ': full');
      assert.strictEqual(lightweight.phase, full.phase, scenario.name + ': lightweight');

      projectIndexer.clear();
      projectIndexer.enqueueRefresh(fixture.projectDir, true);
      await new Promise(function(resolve) { setImmediate(resolve); });
      const summary = projectIndexer.summarize(projectIndexer.getSnapshot(fixture.projectDir));
      assert.strictEqual(summary.awaitingArchiveAuthorization, 0, scenario.name + ': project summary');
    }
  });

  it('central evaluator enforces every required micro Plan field', function() {
    const fixture = createArchiveReadyMicro(project('micro-plan-contract'), 'micro-plan-contract');
    const complete = fs.readFileSync(fixture.specPath, 'utf-8');
    ['Impact Scope', 'Data Impact', 'Interface Impact', 'Acceptance', 'Verification'].forEach(function(label) {
      const content = complete.replace(new RegExp('^' + label + ':.*$', 'm'), label + ':');
      fs.writeFileSync(fixture.specPath, content, 'utf-8');
      const pure = specState.evaluate(specState.readSnapshot(fixture.projectDir, fixture.specPath));
      assert.strictEqual(pure.completionReady, false, label);
      assert.strictEqual(pure.gates.plan.state, 'blocked', label);
    });

    fs.writeFileSync(
      fixture.specPath,
      complete.replace(/^Impact Scope:.*$/m, 'Impact Scope:'),
      'utf-8'
    );
    specIndex.clearCache();
    const full = specIndex.listSpecs(fixture.projectDir).specs[0];
    specIndex.clearCache();
    const lightweight = specIndex.listSpecs(fixture.projectDir, { lightweight: true }).specs[0];
    assert.strictEqual(full.phase, 'plan');
    assert.strictEqual(lightweight.phase, full.phase);
  });

  it('an active Spec cannot hide itself with status archived', async function() {
    const fixture = createArchiveReadyStandard(project('active-archived-status'), 'active-archived-status');
    let spec = fs.readFileSync(fixture.specPath, 'utf-8');
    spec = spec.replace(/^status:.*$/m, 'status: archived');
    fs.writeFileSync(fixture.specPath, spec, 'utf-8');

    const pure = specState.evaluate(specState.readSnapshot(fixture.projectDir, fixture.specPath));
    assert.strictEqual(pure.completionReady, false);
    assert.notStrictEqual(pure.phase, 'archived');
    assert.ok(pure.blockers.some(function(blocker) {
      return /Active Spec cannot declare status: archived/.test(blocker.message);
    }));

    specIndex.clearCache();
    const full = specIndex.listSpecs(fixture.projectDir).specs[0];
    specIndex.clearCache();
    const lightweight = specIndex.listSpecs(fixture.projectDir, { lightweight: true }).specs[0];
    assert.notStrictEqual(full.phase, 'archived');
    assert.strictEqual(lightweight.phase, full.phase);

    projectIndexer.clear();
    projectIndexer.enqueueRefresh(fixture.projectDir, true);
    await new Promise(function(resolve) { setImmediate(resolve); });
    const summary = projectIndexer.summarize(projectIndexer.getSnapshot(fixture.projectDir));
    assert.strictEqual(summary.active, 1);
    assert.strictEqual(summary.awaitingArchiveAuthorization, 0);
  });

  it('status prints authoritative blocker code and message', function() {
    const fixture = createArchiveReadyStandard(project('status-blocker-detail'), 'status-blocker-detail');
    let spec = fs.readFileSync(fixture.specPath, 'utf-8');
    spec = spec.replace(/^Challenge Evidence:.*$/m, 'Challenge Evidence: PASS - different summary');
    fs.writeFileSync(fixture.specPath, spec, 'utf-8');

    const status = runCli(['status', fixture.projectDir], fixture.projectDir);
    assert.match(status.output, /BLOCKERS:/);
    assert.match(status.output, /\[FAIL_LOG_[A-Z0-9_]+\]/);
    assert.match(status.output, /Challenge Evidence does not match Challenge Verdict and Challenge Summary/);
  });

  it('pure evaluator blocks an incomplete completion contract without validation pre-processing', function() {
    const fixture = createArchiveReadyStandard(project('pure-completion'), 'pure-completion');
    fs.writeFileSync(fixture.executeLogPath, [
      '# Execute Log',
      '',
      '## Execute Log',
      '',
      'Step: completion-verification',
      'Status: DONE',
      'Timestamp: 2026-01-01T00:01:00Z'
    ].join('\n'), 'utf-8');

    const state = specState.evaluate(specState.readSnapshot(fixture.projectDir, fixture.specPath));
    assert.strictEqual(state.completionReady, false);
    assert.strictEqual(state.gates.completion.state, 'blocked');
  });

  it('rejects a DONE completion block that has no four-axis or AC evidence', function() {
    const fixture = createArchiveReadyStandard(project('empty-completion'), 'empty-completion');
    fs.writeFileSync(fixture.executeLogPath, [
      '# Execute Log',
      '',
      '## Execute Log',
      '',
      'Step: completion-verification',
      'Status: DONE',
      'Timestamp: 2026-01-01T00:01:00Z'
    ].join('\n'), 'utf-8');

    const result = runCli(['validate', fixture.projectDir, '--archive-ready'], fixture.projectDir);
    assert.notStrictEqual(result.status, 0, result.output);
    assert.match(result.output, /completion-verification.*missing|AC Coverage.*no execution evidence/i);
  });

  it('rejects a completion-verification block with an invalid timestamp', function() {
    const fixture = createArchiveReadyStandard(project('completion-timestamp'), 'completion-timestamp');
    let log = fs.readFileSync(fixture.executeLogPath, 'utf-8');
    log = log.replace(/^Timestamp: 2026-01-01T00:01:00Z$/m, 'Timestamp: 2026-02-30T00:00:00Z');
    fs.writeFileSync(fixture.executeLogPath, log, 'utf-8');

    const state = specState.evaluate(specState.readSnapshot(fixture.projectDir, fixture.specPath));
    assert.equal(state.gates.completion.state, 'blocked');
    assert.equal(state.blockers.some(function(blocker) {
      return /completion-verification Timestamp.*ISO-8601/i.test(blocker.message);
    }), true);
  });

  it('resume does not bypass Research when a signed Plan exists', function() {
    const fixture = createArchiveReadyStandard(project('resume-research'), 'resume-research');
    let spec = fs.readFileSync(fixture.specPath, 'utf-8');
    spec = spec
      .replace(/^Research Reviewed By:.*$/m, 'Research Reviewed By:')
      .replace(/^Research Reviewed At:.*$/m, 'Research Reviewed At:');
    fs.writeFileSync(fixture.specPath, spec, 'utf-8');

    const result = runCli(['resume', fixture.projectDir], fixture.projectDir);
    assert.strictEqual(result.status, 0, result.output);
    assert.match(result.output, /PHASE_HINT: research_or_plan/);
    assert.doesNotMatch(result.output, /PHASE_HINT: (execute|archive)/);
  });

  it('PASS_WITH_CONCERNS converges to archive authorization after Learning is complete', function() {
    const fixture = addLearningRecord(createArchiveReadyStandard(project('concerns-ready'), 'concerns-ready'));
    let spec = fs.readFileSync(fixture.specPath, 'utf-8');
    spec = spec
      .replace(/^Challenge Verdict: PASS$/m, 'Challenge Verdict:')
      .replace(/^Backtrack Target: Ready$/m, 'Backtrack Target:')
      .replace(/^Challenge Summary: independent fixture review$/m, 'Challenge Summary:')
      .replace(/^Challenge Executed By: subagent:challenge-fixture$/m, 'Challenge Executed By:')
      .replace(/^Challenge Executed At: 2026-01-01T00:02:00Z$/m, 'Challenge Executed At:')
      .replace(/^Challenge Evidence: PASS - independent fixture review$/m, 'Challenge Evidence:');
    spec = fillChallenge(spec, 'PASS_WITH_CONCERNS');
    fs.writeFileSync(fixture.specPath, spec, 'utf-8');

    const validation = runCli(['validate', fixture.projectDir, '--archive-ready'], fixture.projectDir);
    assert.strictEqual(validation.status, 0, validation.output);
    const next = runCli(['next', fixture.projectDir], fixture.projectDir);
    assert.match(next.output, /NEXT_ACTION: request_archive_authorization/);
    assert.doesNotMatch(next.output, /NEXT_ACTION: archive_ready/);
    assert.match(next.output, /BLOCKERS:\s*\r?\n- none/);
  });

  it('status does not report Challenge OK for an unknown verdict', function() {
    const fixture = createArchiveReadyStandard(project('status-invalid'), 'status-invalid');
    let spec = fs.readFileSync(fixture.specPath, 'utf-8');
    spec = spec.replace(/^Challenge Verdict: PASS$/m, 'Challenge Verdict: MAYBE');
    fs.writeFileSync(fixture.specPath, spec, 'utf-8');

    const result = runCli(['status', fixture.projectDir], fixture.projectDir);
    assert.strictEqual(result.status, 0, result.output);
    assert.doesNotMatch(result.output, /Challenge:\s+OK/);
    assert.match(result.output, /Challenge:\s+(WARN|BLOCKED)/);
  });

  it('spec-index does not report ready when completion-verification is blocked', function() {
    const fixture = createArchiveReadyStandard(project('index-blocked-completion'), 'index-blocked-completion');
    let log = fs.readFileSync(fixture.executeLogPath, 'utf-8');
    log = log.replace(/^Status: DONE$/m, 'Status: BLOCKED');
    fs.writeFileSync(fixture.executeLogPath, log, 'utf-8');

    specIndex.clearCache();
    const indexed = specIndex.listSpecs(fixture.projectDir).specs.find(function(spec) {
      return spec.taskName === fixture.taskName;
    });
    assert.ok(indexed);
    assert.strictEqual(indexed.phase, 'execute');
    assert.strictEqual(indexed.validate.ok, false);
  });

  it('spec-index exposes the authoritative challenge phase after completion', function() {
    const fixture = createArchiveReadyStandard(project('index-challenge-phase'), 'index-challenge-phase');
    let spec = fs.readFileSync(fixture.specPath, 'utf-8');
    spec = spec
      .replace(/^Challenge Verdict: PASS$/m, 'Challenge Verdict:')
      .replace(/^Backtrack Target: Ready$/m, 'Backtrack Target:')
      .replace(/^Challenge Summary: independent fixture review$/m, 'Challenge Summary:')
      .replace(/^Challenge Executed By: subagent:challenge-fixture$/m, 'Challenge Executed By:')
      .replace(/^Challenge Executed At: 2026-01-01T00:02:00Z$/m, 'Challenge Executed At:')
      .replace(/^Challenge Evidence: PASS - independent fixture review$/m, 'Challenge Evidence:');
    fs.writeFileSync(fixture.specPath, spec, 'utf-8');

    specIndex.clearCache();
    const indexed = specIndex.listSpecs(fixture.projectDir).specs.find(function(item) {
      return item.taskName === fixture.taskName;
    });
    assert.strictEqual(indexed.workflow.nextAction, 'run_challenge');
    assert.strictEqual(indexed.phase, 'challenge');
  });

  it('archive generates a complete summary without unresolved placeholders', function() {
    const fixture = createArchiveReadyStandard(project('archive-summary'), 'archive-summary');
    const archived = runCli(['archive', fixture.projectDir, fixture.taskName, '--authorized-by', 'human:fixture', '--authorization-evidence', 'user approved this archive'], fixture.projectDir);
    assert.strictEqual(archived.status, 0, archived.output);
    const archivePath = path.join(fixture.projectDir, 'mydocs', 'archive', 'v1.0-' + fixture.taskName + '.md');
    const content = fs.readFileSync(archivePath, 'utf-8');
    assert.doesNotMatch(content, /<!-- \(not filled\) -->/);
    ['目标摘要', '最终方案', '关键约束', '坑点与风险'].forEach(function(heading) {
      assert.match(content, new RegExp('## ' + heading + '\\r?\\n(?!\\s*<!-- \\(not filled\\) -->)\\s*\\S'));
    });
  });

  it('marks historical archives as read-only legacy without re-declaring current archive readiness', function() {
    const fixture = createArchiveReadyStandard(project('archive-legacy-boundary'), 'archive-legacy-boundary');
    const archived = runCli(['archive', fixture.projectDir, fixture.taskName, '--authorized-by', 'human:fixture', '--authorization-evidence', 'user approved this archive'], fixture.projectDir);
    assert.strictEqual(archived.status, 0, archived.output);

    specIndex.clearCache();
    const indexed = specIndex.listSpecs(fixture.projectDir).specs.find(function(spec) {
      return spec.taskName === fixture.taskName;
    });
    assert.ok(indexed);
    assert.strictEqual(indexed.location, 'archive');
    assert.strictEqual(indexed.legacy, true);
    assert.strictEqual(indexed.phase, 'archived');
    assert.strictEqual(indexed.validate.legacy, true);
    assert.strictEqual(indexed.validate.ok, null);
  });

  it('requires an explicit Provider for every e2e AC', function() {
    const result = providerReadiness.inspect('## Acceptance Criteria\n### AC-001: web\nVerification: e2e\nTest: tests/web.test.js', project('provider-required'));
    assert.strictEqual(result.state, 'required');
    assert.deepStrictEqual(result.issues, ['E2E Acceptance Criteria require Provider for: AC-001.']);
  });

  it('applies missing Provider blockers only to active e2e Specs, not real archive paths', function() {
    const root = project('provider-archive-boundary');
    const content = '---\nmode: standard\n---\n## Acceptance Criteria\n### AC-001: archived web\nVerification: e2e\nTest: tests/web.test.js\n\n## Plan\nStep: fixture';
    const archivePath = path.join(root, 'mydocs', 'archive', 'v1.0-provider-archive.md');
    const activePath = path.join(root, 'mydocs', 'specs', 'v1.0-provider-active.md');
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.mkdirSync(path.dirname(activePath), { recursive: true });
    fs.writeFileSync(archivePath, content, 'utf-8');
    fs.writeFileSync(activePath, content, 'utf-8');

    const archived = specState.readSnapshot(root, archivePath);
    const active = specState.readSnapshot(root, activePath);
    assert.strictEqual(archived.location, 'archive');
    assert.strictEqual(active.location, 'active');
    assert.strictEqual(specState.evaluate(archived).blockers.some(function(blocker) {
      return /E2E Acceptance Criteria require Provider|Verification Provider is not configured/.test(blocker.message);
    }), false);
    assert.strictEqual(specState.evaluate(active).blockers.some(function(blocker) {
      return /E2E Acceptance Criteria require Provider/.test(blocker.message);
    }), true);
  });

  it('keeps legacy snapshots without a location fail-closed for e2e Provider readiness', function() {
    const root = project('provider-legacy-active-default');
    fs.mkdirSync(root, { recursive: true });
    const state = specState.evaluate({
      exists: true, projectDir: root, status: 'draft', mode: 'standard',
      content: '## Acceptance Criteria\n### AC-001: web\nVerification: e2e\nTest: tests/web.test.js\n\n## Plan\nStep: fixture'
    });
    assert.ok(state.blockers.some(function(blocker) {
      return blocker.gate === 'acceptance' && /E2E Acceptance Criteria require Provider/.test(blocker.message);
    }));
  });

  it('reports configured providers without loading project code', function() {
    const root = project('provider-configured');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, '.sdd-verification.json'), JSON.stringify({ schemaVersion: 1, providers: {
      'web-e2e': { adapter: 'playwright-test', workspaceRoot: '.', packageRoot: 'apps/web', config: 'apps/web/playwright.config.ts', projects: ['chromium'] }
    } }));
    const result = providerReadiness.inspect('## Acceptance Criteria\n### AC-001: web\nVerification: e2e\nProvider: web-e2e\nTest: tests/web.test.js', root);
    assert.strictEqual(result.state, 'configured');
    assert.deepStrictEqual(result.requiredProviders, ['web-e2e']);
    assert.deepStrictEqual(result.missingProviders, []);
  });

  it('routes an unplanned missing Provider to the Plan gate', function() {
    const root = project('provider-plan-blocker');
    fs.mkdirSync(root, { recursive: true });
    const state = specState.evaluate({
      exists: true, projectDir: root, location: 'active', status: 'draft', mode: 'standard',
      content: '## Acceptance Criteria\n### AC-001: web\nVerification: e2e\nProvider: web-e2e\nTest: tests/web.test.js\n## Plan\nStep: implement UI'
    });
    assert.ok(state.blockers.some(function(blocker) {
      return blocker.gate === 'plan' && /no explicit init step: web-e2e/.test(blocker.message);
    }));
    assert.strictEqual(state.facts.providerReadiness.state, 'required');
  });

  it('blocks archive and next when a formal step follows completion-verification', function() {
    const fixture = createArchiveReadyStandard(project('completion-order'), 'completion-order');
    const log = fs.readFileSync(fixture.executeLogPath, 'utf-8') + [
      '',
      '---',
      'Step: repair',
      'Status: BUGFIX',
      'Result: later formal work invalidates completion.',
      'Timestamp: 2026-01-01T00:00:30Z'
    ].join('\n');
    fs.writeFileSync(fixture.executeLogPath, log, 'utf-8');

    const state = specState.evaluateProjectSpec(fixture.projectDir, fixture.specPath);
    assert.strictEqual(state.completionReady, false);
    assert.strictEqual(state.gates.completion.state, 'blocked');
    assert.match(state.blockers.map(function(blocker) { return blocker.message; }).join('\n'), /completion-verification must be the last formal Execute Step/);

    const validation = runCli(['validate', fixture.projectDir, '--archive-ready'], fixture.projectDir);
    assert.notStrictEqual(validation.status, 0, validation.output);
    assert.match(validation.output, /completion-verification must be the last formal Execute Step/);
    const next = runCli(['next', fixture.projectDir], fixture.projectDir);
    assert.match(next.output, /NEXT_ACTION: repair_execute_log/);
  });

  it('accepts the historical nested Lite Confirmed Requirement in archive validation', function() {
    const fixture = createArchiveReadyLite(project('legacy-lite'), 'legacy-lite');
    const legacy = fs.readFileSync(fixture.specPath, 'utf-8').replace(
      /^## Confirmed Requirement$/m,
      '## Research\n\n### Confirmed Requirement'
    );
    fs.writeFileSync(fixture.specPath, legacy, 'utf-8');

    const state = specState.evaluateProjectSpec(fixture.projectDir, fixture.specPath);
    assert.strictEqual(state.completionReady, true, JSON.stringify(state.blockers));
    const validation = runCli(['validate', fixture.projectDir, '--archive-ready'], fixture.projectDir);
    assert.strictEqual(validation.status, 0, validation.output);
  });
});
