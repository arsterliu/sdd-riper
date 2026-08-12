'use strict';

var fs = require('fs');
var path = require('path');
var config = require('../verification/config');
var contract = require('../verification/contract');
var registry = require('../verification/registry');
var workspace = require('../verification/workspace');
var errors = require('../verification/errors');
var readiness = require('../verification/readiness');
var fingerprint = require('../verification/fingerprint');
var gateway = require('../verification/process-gateway');
var runStore = require('../verification/run-store');
var normalize = require('../verification/adapters/playwright-test/normalize');
var resultContract = require('../verification/adapters/playwright-test/result-contract');
var visualContract = require('../visual-evidence/contract');
var common = require('../../lib/common');
var specState = require('../core/spec-state');
var crypto = require('crypto');
var os = require('os');

function writeAtomic(file, value) {
  var temporary = file + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  try { fs.renameSync(temporary, file); }
  catch (error) {
    try { fs.unlinkSync(temporary); } catch (ignored) {}
    throw error;
  }
}

function acquireConfigLock(root) {
  var lock = path.join(root, '.sdd-verification.json.lock');
  try { fs.mkdirSync(lock); }
  catch (error) {
    if (error.code === 'EEXIST') errors.fail('INIT_LOCKED', 'another verify init may be running; retry later. If the lock persists, confirm no verify init is running, then remove the empty .sdd-verification.json.lock directory and retry; never delete it based only on lock age');
    throw error;
  }
  return { path: lock };
}

function releaseInitLock(lock) {
  if (!lock) return;
  try { fs.rmdirSync(lock.path); }
  catch (error) {
    errors.fail('INIT_UNLOCK_FAILED', 'failed to release verification init lock; configuration may have been written, check .sdd-verification.json before retrying', {
      path: lock.path,
      cause: error.code || error.message
    });
  }
}

function printError(error) {
  var code = error.code || 'SDD_VERIFY_INTERNAL';
  console.error('[SDD_VERIFY_' + code + '] ' + error.message);
  var gateFailures = ['UNKNOWN_AC_TAG', 'AC_NOT_COVERED'];
  process.exitCode = gateFailures.indexOf(code) !== -1 ? 1 : 2;
}

function init(projectDir, options) {
  var heldLock;
  var failure;
  var successMessage;
  try {
    var root = fs.realpathSync(path.resolve(projectDir));
    var provider = contract.validateProviderDefinition({
      adapter: options.adapter,
      workspaceRoot: options.workspaceRoot,
      packageRoot: options.packageRoot,
      config: options.config,
      projects: options.project || []
    });
    if (!contract.PROVIDER_ID.test(options.provider)) {
      throw contract.verificationError('CONFIG_SCHEMA_INVALID', 'invalid provider id', { path: options.provider });
    }
    var manifest = registry.resolveAdapter(provider.adapter);
    if (manifest.capabilities.indexOf('gate') === -1 && manifest.capabilities.indexOf('visual-gate') === -1) {
      registry.requireCapability(manifest, 'gate');
    }
    workspace.assertRuntime(manifest);
    var resolved = workspace.resolveWorkspace(provider, root, manifest);
    workspace.resolveConfigFile(resolved.workspaceRoot, provider.config);
    heldLock = acquireConfigLock(root);
    var value = config.loadVerificationConfig(root);
    value.providers[options.provider] = provider;
    value = contract.validateVerificationConfig(value);
    writeAtomic(path.join(root, '.sdd-verification.json'), value);
    successMessage = '[SDD Verify Init] ' + options.provider + ' configured (' + manifest.id + ' ' + resolved.toolVersion + ')';
  } catch (error) { failure = error; }
  try { releaseInitLock(heldLock); }
  catch (unlockError) {
    if (failure) {
      unlockError.message += '; original [SDD_VERIFY_' + (failure.code || 'INTERNAL') + '] ' + failure.message;
      unlockError.details.originalError = { code: failure.code || 'SDD_VERIFY_INTERNAL', message: failure.message };
    }
    failure = unlockError;
  }
  if (failure) return printError(failure);
  console.log(successMessage);
}

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function relativePath(root, target) { return path.relative(root, target).replace(/\\/g, '/') || '.'; }
function isInside(parentPath, childPath) {
  var relative = path.relative(parentPath, childPath);
  return relative === '' || (!!relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function resolveSpec(root, reference) {
  var candidate = path.isAbsolute(reference) ? reference : path.resolve(root, reference);
  if (!fs.existsSync(candidate)) errors.fail('SPEC_NOT_FOUND', 'Spec does not exist', { path: reference });
  return fs.realpathSync(candidate);
}

function readEvents(file, nonce, manifest, capability) {
  capability = capability || 'gate';
  if (!fs.existsSync(file)) errors.fail('HANDSHAKE_FAILED', 'adapter did not produce Reporter events');
  var events = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function(line) { return JSON.parse(line); });
  var hello = events[0];
  if (!hello || hello.type !== 'hello' || hello.nonce !== nonce || hello.handshakeVersion !== manifest.handshakeVersion ||
      !Array.isArray(hello.capabilities) || hello.capabilities.indexOf(capability) === -1) {
    errors.fail('HANDSHAKE_FAILED', 'adapter Reporter handshake is invalid');
  }
  return events;
}

function browserExecutableMissing(text) {
  return /browserType\.launch[^\n]*:\s*executable (?:doesn't|does not) exist at\s+\S+/i.test(String(text || ''));
}

function browserInstallSuggestion(lockfile) {
  var name = path.basename(lockfile || '');
  if (name === 'pnpm-lock.yaml') return 'pnpm exec playwright install';
  if (name === 'yarn.lock') return 'yarn playwright install';
  return 'npm exec playwright install';
}

function sanitizeNormalizedResult(normalized, environment, allowedNames) {
  function clean(value) { return gateway.sanitizeDiagnostic(value, environment, allowedNames); }
  var idMap = {};
  normalized.testExecutions.forEach(function(test) { idMap[test.id] = 'test-' + sha(String(test.id)).slice(0, 24); });
  var testExecutions = normalized.testExecutions.map(function(test) {
    return {
      id: idMap[test.id],
      title: clean(test.title),
      project: test.project,
      acIds: test.acIds.slice(),
      expectedStatus: test.expectedStatus,
      status: test.status,
      retry: test.retry,
      duration: test.duration,
      stablePass: test.stablePass,
      errors: (test.errors || []).map(function(error) {
        return { message: clean(error && error.message) };
      }),
      attachments: (test.attachments || []).map(function(attachment) {
        return {
          name: clean(attachment.name),
          contentType: clean(attachment.contentType),
          path: ''
        };
      })
    };
  });
  var acExecutions = normalized.acExecutions.map(function(ac) {
    return Object.assign({}, ac, { testIds: ac.testIds.map(function(id) { return idMap[id]; }) });
  });
  return Object.assign({}, normalized, { testExecutions: testExecutions, acExecutions: acExecutions });
}

function run(projectDir, options) {
  try {
    var root = fs.realpathSync(path.resolve(projectDir));
    var specFile = resolveSpec(root, options.spec);
    var specContent = fs.readFileSync(specFile, 'utf8');
    var approval = specState.planApprovalFacts(specContent, common.getFrontmatterField(specFile, 'autonomy-mode') || 'supervised');
    if (!approval.satisfied) errors.fail('PLAN_GATE_NOT_APPROVED', 'Plan Gate must be approved before verification execution');
    var allAcs = readiness.acceptanceBlocks(specContent);
    var targets = allAcs.filter(function(ac) { return /^e2e$/i.test(ac.verification); });
    if (options.ac && options.ac.length) {
      var selected = options.ac.map(function(id) { return id.toUpperCase(); });
      targets = targets.filter(function(ac) { return selected.indexOf(ac.id) !== -1; });
      selected.forEach(function(id) {
        if (!targets.some(function(ac) { return ac.id === id; })) errors.fail('AC_NOT_E2E', 'selected AC is not an E2E AC in the Spec', { acId: id });
      });
    }
    if (!targets.length) errors.fail('NO_E2E_TARGETS', 'Spec has no selected E2E Acceptance Criteria');
    targets.forEach(function(ac) { if (!ac.provider) errors.fail('PROVIDER_NOT_FOUND', 'E2E AC is missing Provider', { acId: ac.id }); });
    var providers = config.loadVerificationConfig(root).providers;
    var groups = {};
    targets.forEach(function(ac) { (groups[ac.provider] || (groups[ac.provider] = [])).push(ac); });
    var exitCode = 0;
    Object.keys(groups).sort().forEach(function(providerId) {
      var provider = providers[providerId];
      if (!provider) errors.fail('PROVIDER_NOT_FOUND', 'verification Provider is not configured', { providerId: providerId });
      var manifest = registry.requireCapability(registry.resolveAdapter(provider.adapter), 'gate');
      workspace.assertRuntime(manifest);
      var resolved = workspace.resolveWorkspace(provider, root, manifest);
      var nonce = crypto.randomBytes(16).toString('hex');
      var staging = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-verify-'));
      var outputFile = path.join(staging, 'events.jsonl');
      var reporterPath = path.resolve(__dirname, '../verification/adapters/playwright-test/reporter.js');
      var invocation = gateway.buildInvocation(resolved, provider, reporterPath, outputFile, nonce, options.allowEnv || []);
      var inheritedEnvironment = gateway.inheritedEnvironment(options.allowEnv || []);
      var environmentDigests = {};
      Object.keys(inheritedEnvironment).sort().forEach(function(name) {
        environmentDigests[name] = sha(String(inheritedEnvironment[name]));
      });
      var before = fingerprint.captureCodeState(root, common.getDocsDir(root));
      var result = gateway.execute(invocation);
      var events;
      try { events = readEvents(outputFile, nonce, manifest); }
      catch (error) {
        var diagnostic = String((result && result.stderr) || '');
        if (browserExecutableMissing(diagnostic)) {
          errors.fail('BROWSER_NOT_INSTALLED', 'Playwright browser is not installed. Run: ' + browserInstallSuggestion(resolved.lockfile));
        }
        throw error;
      }
      var tests = events.filter(function(event) { return event.type === 'test'; }).map(function(event) { return event.test; });
      var browserDiagnostic = [result && result.stdout, result && result.stderr].concat(tests.map(function(test) {
        return (test.errors || []).map(function(error) { return error && error.message; }).join('\n');
      })).join('\n');
      var browserUnavailable = browserExecutableMissing(browserDiagnostic);
      var endEvent = events.filter(function(event) { return event.type === 'end'; }).pop();
      var processDecision = resultContract.evaluate(result, endEvent);
      var group = groups[providerId];
      var normalized = browserUnavailable && !tests.length ? {
        status: 'blocked', gateDecision: 'BLOCKED', acExecutions: [], testExecutions: [], diagnostics: []
      } : normalize.aggregate({
        targetAcIds: group.map(function(ac) { return ac.id; }), knownAcIds: allAcs.map(function(ac) { return ac.id; }),
        projects: provider.projects, tests: tests
      });
      if (!browserUnavailable && (processDecision.gateDecision === 'BLOCKED' ||
          (processDecision.gateDecision === 'FAIL' && normalized.gateDecision === 'PASS'))) {
        normalized.status = processDecision.status; normalized.gateDecision = processDecision.gateDecision;
        normalized.diagnostics = [{ code: processDecision.code, message: 'Playwright process/Reporter terminal contract is not PASS' }];
      }
      if (browserUnavailable) {
        normalized.status = 'blocked';
        normalized.gateDecision = 'BLOCKED';
        normalized.diagnostics = [{ code: 'BROWSER_NOT_INSTALLED',
          message: 'Playwright browser is not installed. Run: ' + browserInstallSuggestion(resolved.lockfile) }];
      }
      normalized = sanitizeNormalizedResult(normalized, invocation.env, options.allowEnv || []);
      var after = fingerprint.captureCodeState(root, common.getDocsDir(root));
      if (!fingerprint.sameCodeState(before, after)) {
        normalized.status = 'blocked'; normalized.gateDecision = 'BLOCKED';
        normalized.diagnostics = [{ code: 'WORKTREE_MUTATED', message: 'worktree changed during verification' }];
      }
      var runId = new Date().toISOString().replace(/[-:.TZ]/g, '') + '-' + crypto.randomBytes(6).toString('hex');
      var attachmentInputs = [];
      tests.forEach(function(test) { (test.attachments || []).forEach(function(item) {
        if (item.path) attachmentInputs.push({ source: item.path,
          name: gateway.sanitizeDiagnostic(item.name, invocation.env, options.allowEnv || []),
          mediaType: gateway.sanitizeDiagnostic(item.contentType, invocation.env, options.allowEnv || []) });
      }); });
      var runValue = {
        schemaVersion: 1, runId: runId, createdAt: new Date().toISOString(), providerId: providerId,
        adapterId: manifest.id, adapterManifestDigest: sha(JSON.stringify(manifest)), providerDigest: sha(JSON.stringify(provider)),
        spec: { path: relativePath(root, specFile), specDigest: sha(specContent),
          verificationContractDigest: sha(JSON.stringify(readiness.verificationContract(specContent, providerId))),
          planDigest: fingerprint.planDigest(specContent),
          designPath: fingerprint.designEvidence(root, specContent).path,
          designDigest: fingerprint.designEvidence(root, specContent).digest,
          diffBase: common.getFrontmatterField(specFile, 'diff-base') },
        codeStateBefore: before, codeStateAfter: after,
        workspace: { workspaceRoot: relativePath(root, resolved.workspaceRoot),
          packageRoot: relativePath(root, resolved.packageRoot),
          manifest: relativePath(root, resolved.declaringManifest),
          lockfile: relativePath(root, resolved.lockfile), resolvedToolVersion: resolved.toolVersion,
          manifestDigest: sha(fs.readFileSync(resolved.declaringManifest)), lockfileDigest: sha(fs.readFileSync(resolved.lockfile)),
          configDigest: sha(fs.readFileSync(workspace.resolveConfigFile(resolved.workspaceRoot, provider.config))) },
        invocationDigest: sha(JSON.stringify({ args: invocation.args, cwd: invocation.cwd, environmentDigests: environmentDigests })),
        environmentDigests: environmentDigests,
        allowedEnvironmentKeys: (options.allowEnv || []).slice().sort(),
        targets: { acIds: group.map(function(ac) { return ac.id; }).sort(), projects: provider.projects.slice().sort() },
        status: normalized.status, freshness: fingerprint.sameCodeState(before, after) ? 'fresh' : 'stale',
        gateDecision: normalized.gateDecision, acExecutions: normalized.acExecutions,
        testExecutions: normalized.testExecutions, attachments: [], diagnostics: normalized.diagnostics || [],
        process: { status: result.status, signal: result.signal || '',
          stdout: gateway.sanitizeDiagnostic(result.stdout, invocation.env, options.allowEnv || []).slice(0, 4000),
          stderr: gateway.sanitizeDiagnostic(result.stderr, invocation.env, options.allowEnv || []).slice(0, 4000) }
      };
      var committed = runStore.commitRun(root, common.getDocsDir(root), runValue, attachmentInputs);
      fs.rmSync(staging, { recursive: true, force: true });
      if (browserUnavailable) console.error('[SDD_VERIFY_BROWSER_NOT_INSTALLED] ' + normalized.diagnostics[0].message);
      console.log('[SDD Verify Run] runId=' + runId + ' provider=' + providerId + ' gate=' + committed.run.gateDecision);
      if (committed.run.gateDecision === 'FAIL') exitCode = Math.max(exitCode, 1);
      if (committed.run.gateDecision === 'BLOCKED') exitCode = Math.max(exitCode, 2);
    });
    process.exitCode = exitCode;
  } catch (error) { printError(error); }
}

function runVisual(projectDir, options) {
  var visualStaging = '';
  try {
    var root = fs.realpathSync(path.resolve(projectDir));
    var specFile = resolveSpec(root, options.spec);
    var specContent = fs.readFileSync(specFile, 'utf8');
    var approval = specState.planApprovalFacts(specContent, common.getFrontmatterField(specFile, 'autonomy-mode') || 'supervised');
    if (!approval.satisfied) errors.fail('PLAN_GATE_NOT_APPROVED', 'Plan Gate must be approved before visual verification execution');
    var visual = visualContract.inspectContract(specFile, root);
    if (visual.state === 'not-applicable') {
      console.log('[SDD Verify Visual] state=not-applicable');
      return;
    }
    if (visual.state !== 'ready') errors.fail('VISUAL_CONTRACT_BLOCKED', 'visual contract is not ready', { diagnostics: visual.diagnostics || [] });
    var manifestRef = readiness.frontmatterValue(specContent, 'visual-evidence-file');
    var visualManifestPath = path.resolve(root, manifestRef);
    var visualManifest = JSON.parse(fs.readFileSync(visualManifestPath, 'utf8'));
    if (visualManifest.mode !== 'fidelity') {
      console.log('[SDD Verify Visual] state=not-applicable');
      return;
    }
    var providers = config.loadVerificationConfig(root).providers;
    var visualProviders = Object.keys(providers).filter(function(providerId) {
      return providers[providerId].adapter === 'playwright-visual';
    }).sort();
    if (!visualProviders.length) errors.fail('VISUAL_PROVIDER_NOT_CONFIGURED', 'a playwright-visual Provider must be configured before fidelity verification');
    if (visualProviders.length > 1) errors.fail('VISUAL_PROVIDER_AMBIGUOUS', 'exactly one playwright-visual Provider must be configured');
    var providerId = visualProviders[0];
    var provider = providers[providerId];
    var adapterManifest = registry.requireCapability(registry.resolveAdapter(provider.adapter), 'visual-gate');
    workspace.assertRuntime(adapterManifest);
    var resolved = workspace.resolveWorkspace(provider, root, adapterManifest);
    var visualConfig = require('../visual-verification/config').loadVisualConfig(root, resolved.packageRoot, provider.projects);
    var bindings = require('../visual-verification/config').bindScenarios(visualConfig, visualManifest.scenarios.map(function(scenario) { return scenario.id; }));
    var nonce = crypto.randomBytes(16).toString('hex');
    var stagingRoot = path.dirname(path.dirname(path.dirname(resolved.toolPackage)));
    var staging = fs.mkdtempSync(path.join(stagingRoot, '.sdd-visual-'));
    visualStaging = staging;
    var outputFile = path.join(staging, 'events.jsonl');
    var reporterPath = path.resolve(__dirname, '../verification/adapters/playwright-visual/reporter.js');
    var testFiles = Array.from(new Set(bindings.map(function(binding) { return binding.testFile; }))).sort();
    var invocation = gateway.buildInvocation(resolved, provider, reporterPath, outputFile, nonce, [], testFiles);
    var before = fingerprint.captureCodeState(root, common.getDocsDir(root));
    var result = gateway.execute(invocation);
    var normalized;
    var diagnostics = [];
    var currentInputs = [];
    var comparisonSummaries = [];
    var browserUnavailable = false;
    try {
      var events = readEvents(outputFile, nonce, adapterManifest, 'visual-gate');
      var tests = events.filter(function(event) { return event.type === 'test'; }).map(function(event) { return event.test; });
      var browserDiagnostic = [result && result.stdout, result && result.stderr].concat(tests.map(function(item) {
        return (item.errors || []).map(function(error) { return error && error.message; }).join('\n');
      })).join('\n');
      browserUnavailable = browserExecutableMissing(browserDiagnostic);
      var endEvent = events.filter(function(event) { return event.type === 'end'; }).pop();
      var processDecision = require('../verification/adapters/playwright-visual/result-contract').evaluate(result, endEvent);
      if (browserUnavailable) {
        normalized = { status: 'blocked', gateDecision: 'BLOCKED', scenarioExecutions: [] };
        diagnostics.push({ code: 'BROWSER_NOT_INSTALLED', message: 'Playwright browser is not installed. Run: ' + browserInstallSuggestion(resolved.lockfile) });
      } else {
        normalized = require('../verification/adapters/playwright-visual/normalize').aggregate({ bindings: bindings, tests: tests });
        if (processDecision.gateDecision === 'BLOCKED' || (processDecision.gateDecision === 'FAIL' && normalized.gateDecision === 'PASS')) {
          normalized = { status: processDecision.status, gateDecision: processDecision.gateDecision, scenarioExecutions: [] };
          diagnostics.push({ code: processDecision.code, message: 'Playwright process/Reporter terminal contract is not PASS' });
        }
      }
    } catch (error) {
      var diagnostic = String((result && result.stderr) || '');
      if (browserExecutableMissing(diagnostic)) {
        browserUnavailable = true;
        normalized = { status: 'blocked', gateDecision: 'BLOCKED', scenarioExecutions: [] };
        diagnostics.push({ code: 'BROWSER_NOT_INSTALLED', message: 'Playwright browser is not installed. Run: ' + browserInstallSuggestion(resolved.lockfile) });
      } else {
        normalized = { status: 'blocked', gateDecision: 'BLOCKED', scenarioExecutions: [] };
        diagnostics.push({ code: error.code || 'VISUAL_REPORT_INVALID', message: error.message });
      }
    }
    if (normalized.gateDecision !== 'BLOCKED' && normalized.scenarioExecutions.every(function(item) { return item.status === 'passed'; })) {
      try {
        var png = require('../visual-verification/png');
        var comparator = require('../visual-verification/comparator');
        var contextRoot = path.resolve(root, readiness.frontmatterValue(specContent, 'context-source'));
        var bindingById = {};
        bindings.forEach(function(binding) { bindingById[binding.scenarioId] = binding; });
        normalized.scenarioExecutions.forEach(function(execution) {
          var scenario = visualManifest.scenarios.filter(function(item) { return item.id === execution.scenarioId; })[0];
          var binding = bindingById[execution.scenarioId];
          var currentCandidate = path.resolve(resolved.packageRoot, execution.current.path);
          if (!isInside(resolved.workspaceRoot, currentCandidate) || !fs.existsSync(currentCandidate)) errors.fail('PATH_ESCAPE', 'visual screenshot escapes Provider workspaceRoot', { path: execution.current.path });
          var currentPath = fs.realpathSync(currentCandidate);
          if (!isInside(resolved.workspaceRoot, currentPath)) errors.fail('PATH_ESCAPE', 'visual screenshot realpath escapes Provider workspaceRoot', { path: execution.current.path });
          var baselinePath = path.resolve(contextRoot, scenario.baseline.path);
          var comparison = comparator.comparePixels(png.decode(fs.readFileSync(baselinePath)), png.decode(fs.readFileSync(currentPath)), {
            threshold: binding.threshold,
            masks: binding.masks
          });
          var diffPath = path.join(staging, execution.scenarioId + '.diff.png');
          fs.writeFileSync(diffPath, png.encode(png.diffImage(scenario.viewport.width, scenario.viewport.height, comparison.diffPixels)), { flag: 'wx' });
          comparisonSummaries.push({ scenarioId: execution.scenarioId, baselineDigest: sha(fs.readFileSync(baselinePath)), currentDigest: sha(fs.readFileSync(currentPath)),
            changedPixels: comparison.changedPixels, totalPixels: comparison.totalPixels, changedRatio: comparison.changedRatio,
            threshold: comparison.threshold, masks: binding.masks, maskedPixels: comparison.maskedPixels, decision: comparison.decision });
          currentInputs.push({ source: currentPath, name: execution.scenarioId + '.current.png', mediaType: 'image/png' });
          currentInputs.push({ source: diffPath, name: execution.scenarioId + '.diff.png', mediaType: 'image/png' });
        });
        if (comparisonSummaries.some(function(item) { return item.decision === 'FAIL'; })) normalized = { status: 'failed', gateDecision: 'FAIL', scenarioExecutions: normalized.scenarioExecutions };
      } catch (error) {
        normalized = { status: 'blocked', gateDecision: 'BLOCKED', scenarioExecutions: [] };
        diagnostics.push({ code: error.code || 'VISUAL_COMPARISON_FAILED', message: error.message });
        comparisonSummaries = [];
        currentInputs = [];
      }
    }
    var after = fingerprint.captureCodeState(root, common.getDocsDir(root));
    var worktreeMutated = !fingerprint.sameCodeState(before, after);
    if (worktreeMutated) {
      normalized = { status: 'blocked', gateDecision: 'BLOCKED', scenarioExecutions: [] };
      diagnostics.push({ code: 'WORKTREE_MUTATED', message: 'worktree changed during visual verification' });
      comparisonSummaries = [];
      currentInputs = [];
    }
    var runId = new Date().toISOString().replace(/[-:.TZ]/g, '') + '-' + crypto.randomBytes(6).toString('hex');
    var visualRun = {
      schemaVersion: 1, runId: runId, createdAt: new Date().toISOString(), providerId: providerId, adapterId: adapterManifest.id,
      providerDigest: sha(JSON.stringify(provider)), adapterManifestDigest: sha(JSON.stringify(adapterManifest)),
      invocationDigest: sha(JSON.stringify({ args: invocation.args, cwd: invocation.cwd })),
      spec: { path: relativePath(root, specFile), specDigest: sha(specContent), visualContractDigest: sha(fs.readFileSync(visualManifestPath)),
        configDigest: sha(fs.readFileSync(path.join(root, 'sdd.visual.config.json'))) },
      codeStateBefore: before, codeStateAfter: after,
      workspace: { workspaceRoot: relativePath(root, resolved.workspaceRoot), packageRoot: relativePath(root, resolved.packageRoot), resolvedToolVersion: resolved.toolVersion,
        manifestDigest: sha(fs.readFileSync(resolved.declaringManifest)), lockfileDigest: sha(fs.readFileSync(resolved.lockfile)),
        configDigest: sha(fs.readFileSync(workspace.resolveConfigFile(resolved.workspaceRoot, provider.config))) },
      targets: { scenarioIds: bindings.map(function(binding) { return binding.scenarioId; }).sort(), projects: provider.projects.slice().sort() },
      status: normalized.status, freshness: worktreeMutated ? 'stale' : 'fresh', gateDecision: normalized.gateDecision,
      process: { status: typeof result.status === 'number' ? result.status : -1, signal: result.signal || '' },
      visual: { scenarios: comparisonSummaries }, attachments: [], diagnostics: diagnostics
    };
    var committed = require('../visual-verification/run-store').commitVisualRun(root, common.getDocsDir(root), visualRun, currentInputs);
    fs.rmSync(staging, { recursive: true, force: true });
    visualStaging = '';
    if (browserUnavailable) console.error('[SDD_VERIFY_BROWSER_NOT_INSTALLED] ' + diagnostics[0].message);
    console.log('[SDD Verify Visual] runId=' + runId + ' provider=' + providerId + ' gate=' + committed.run.gateDecision);
    if (committed.run.gateDecision === 'FAIL') process.exitCode = 1;
    if (committed.run.gateDecision === 'BLOCKED') process.exitCode = 2;
  } catch (error) {
    if (visualStaging) {
      try { fs.rmSync(visualStaging, { recursive: true, force: true }); } catch (_) {}
    }
    printError(error);
  }
}

module.exports = { init: init, run: run, runVisual: runVisual };
