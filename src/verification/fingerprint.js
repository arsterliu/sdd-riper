'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var execFileSync = require('child_process').execFileSync;
var errors = require('./errors');

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function git(root, args, options) {
  try { return execFileSync('git', args, Object.assign({ cwd: root, encoding: 'buffer',
    env: Object.assign({}, process.env, {
      GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
      XDG_CONFIG_HOME: path.join(root, '.git', 'sdd-empty-xdg')
    }) }, options)); }
  catch (error) { errors.fail('GIT_STATE_UNAVAILABLE', 'unable to capture Git state', { cause: error.message }); }
}

function captureCodeState(projectDir, docsDir) {
  var root = fs.realpathSync(path.resolve(projectDir));
  var exclude = ':(exclude)' + String(docsDir || 'mydocs').replace(/\\/g, '/') + '/**';
  var head = git(root, ['rev-parse', 'HEAD']).toString('utf8').trim();
  var staged = sha(git(root, ['diff', '--cached', '--binary', '--', '.', exclude]));
  var unstaged = sha(git(root, ['diff', '--binary', '--', '.', exclude]));
  var names = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).toString('utf8').split('\0').filter(Boolean)
    .filter(function(name) { return name !== docsDir && !name.startsWith(String(docsDir) + '/'); }).sort();
  var untrackedHash = crypto.createHash('sha256');
  names.forEach(function(name) {
    var file = path.join(root, name);
    untrackedHash.update(name + '\0');
    if (fs.statSync(file).isFile()) untrackedHash.update(fs.readFileSync(file));
  });
  var state = { head: head, stagedDigest: staged, unstagedDigest: unstaged,
    untrackedDigest: untrackedHash.digest('hex'), untrackedFiles: names };
  state.aggregateDigest = sha(JSON.stringify(state));
  return state;
}

function sameCodeState(a, b) { return !!a && !!b && a.aggregateDigest === b.aggregateDigest; }

function planDigest(content) {
  var section = String(content || '').split(/^## Plan\s*$/m)[1] || '';
  section = section.split(/^## /m)[0];
  return sha(section.replace(/\r\n/g, '\n').trim());
}

function designEvidence(projectDir, specContent) {
  var ref = require('./readiness').frontmatterValue(specContent, 'design-file');
  if (!ref) return { path: '', digest: sha('') };
  var root = fs.realpathSync(path.resolve(projectDir));
  var candidate = path.resolve(root, ref);
  var relative = path.relative(root, candidate);
  if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !fs.existsSync(candidate)) {
    return { path: ref.replace(/\\/g, '/'), digest: '', invalid: true };
  }
  var resolved = fs.realpathSync(candidate);
  var realRelative = path.relative(root, resolved);
  if (!realRelative || realRelative.startsWith('..' + path.sep) || path.isAbsolute(realRelative) || !fs.statSync(resolved).isFile()) {
    return { path: ref.replace(/\\/g, '/'), digest: '', invalid: true };
  }
  return { path: realRelative.replace(/\\/g, '/'), digest: sha(fs.readFileSync(resolved)) };
}

function evaluateRunFreshness(projectDir, docsDir, run, expectedSpecPath) {
  var reasons = [];
  var root = fs.realpathSync(path.resolve(projectDir));
  var currentCode = captureCodeState(root, docsDir);
  if (!sameCodeState(currentCode, run.codeStateAfter)) reasons.push('codeState');
  var specFile = expectedSpecPath ? fs.realpathSync(expectedSpecPath) : path.resolve(root, run.spec && run.spec.path || '');
  var expectedRelative = path.relative(root, specFile).replace(/\\/g, '/') || '.';
  if (!run.spec || run.spec.path !== expectedRelative) reasons.push('specIdentity');
  var relativeSpec = path.relative(root, specFile);
  if (!relativeSpec || relativeSpec.startsWith('..' + path.sep) || path.isAbsolute(relativeSpec) || !fs.existsSync(specFile)) {
    reasons.push('specPath');
    return { freshness: 'stale', reasons: reasons };
  }
  var specContent = fs.readFileSync(specFile, 'utf8');
  if (run.spec.planDigest && planDigest(specContent) !== run.spec.planDigest) reasons.push('plan');
  var readiness = require('./readiness');
  if (sha(JSON.stringify(readiness.verificationContract(specContent, run.providerId))) !== run.spec.verificationContractDigest) reasons.push('verificationContract');
  var design = designEvidence(root, specContent);
  if (design.invalid || design.path !== run.spec.designPath || design.digest !== run.spec.designDigest) reasons.push('design');
  try {
    var currentEnvironment = require('./process-gateway').inheritedEnvironment(run.allowedEnvironmentKeys || []);
    var currentEnvironmentDigests = {};
    Object.keys(currentEnvironment).sort().forEach(function(name) {
      currentEnvironmentDigests[name] = sha(String(currentEnvironment[name]));
    });
    if (JSON.stringify(currentEnvironmentDigests) !== JSON.stringify(run.environmentDigests || {})) reasons.push('environment');
  } catch (error) { reasons.push(error.code || 'environment'); }
  try {
    var config = require('./config').loadVerificationConfig(root);
    var provider = config.providers[run.providerId];
    if (!provider || sha(JSON.stringify(provider)) !== run.providerDigest) reasons.push('provider');
    if (provider) {
      var registry = require('./registry');
      var manifest = registry.requireCapability(registry.resolveAdapter(provider.adapter), 'gate');
      if (sha(JSON.stringify(manifest)) !== run.adapterManifestDigest) reasons.push('adapterManifest');
      var resolved = require('./workspace').resolveWorkspace(provider, root, manifest);
      if (resolved.toolVersion !== run.workspace.resolvedToolVersion) reasons.push('toolVersion');
      if (sha(fs.readFileSync(resolved.lockfile)) !== run.workspace.lockfileDigest) reasons.push('lockfile');
      if (sha(fs.readFileSync(resolved.declaringManifest)) !== run.workspace.manifestDigest) reasons.push('manifest');
      var configFile = require('./workspace').resolveConfigFile(resolved.workspaceRoot, provider.config);
      if (sha(fs.readFileSync(configFile)) !== run.workspace.configDigest) reasons.push('config');
    }
  } catch (error) { reasons.push(error.code || 'workspace'); }
  return { freshness: reasons.length ? 'stale' : 'fresh', reasons: reasons };
}

module.exports = { captureCodeState: captureCodeState, sameCodeState: sameCodeState,
  evaluateRunFreshness: evaluateRunFreshness, planDigest: planDigest, designEvidence: designEvidence, sha256: sha };
