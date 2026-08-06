'use strict';

var fs = require('fs');
var path = require('path');
var spawnSync = require('child_process').spawnSync;

function inheritedEnvironment(extraNames) {
  var names = ['SystemRoot', 'WINDIR', 'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'PATH', 'CI', 'DEBUG'];
  (extraNames || []).forEach(function(name) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      var error = new Error('invalid environment variable name: ' + name);
      error.code = 'ENV_NAME_INVALID';
      throw error;
    }
  });
  (extraNames || []).forEach(function(name) { if (names.indexOf(name) === -1) names.push(name); });
  var env = {};
  names.forEach(function(name) { if (process.env[name] !== undefined) env[name] = process.env[name]; });
  return env;
}

function sanitizeDiagnostic(value, env, explicitNames) {
  var text = String(value || '');
  var sensitive = (explicitNames || []).slice();
  Object.keys(env || {}).forEach(function(name) {
    if (/(TOKEN|SECRET|PASSWORD|PASS|COOKIE|AUTH|CREDENTIAL|API_?KEY|PRIVATE_?KEY)/i.test(name) && sensitive.indexOf(name) === -1) sensitive.push(name);
  });
  sensitive.forEach(function(name) {
    var secret = env && env[name];
    if (typeof secret === 'string' && secret.length >= 3) text = text.split(secret).join('[REDACTED:' + name + ']');
  });
  return text.replace(/\b(token|secret|password|authorization|cookie|api[_-]?key)\s*[:=]\s*[^\s]+/gi,
    function(_, key) { return key + '=[REDACTED]'; });
}

function buildInvocation(resolved, provider, reporterPath, outputFile, nonce, allowEnv, targetFiles) {
  var cli = path.join(path.dirname(resolved.toolPackage), 'cli.js');
  var args = [cli, 'test', '--config=' + provider.config, '--reporter=' + reporterPath];
  (provider.projects || []).forEach(function(project) { args.push('--project=' + project); });
  if (targetFiles && targetFiles.length) {
    args.push('--');
    targetFiles.forEach(function(file) { args.push(file); });
  }
  var env = inheritedEnvironment(allowEnv);
  var localBrowsers = path.join(resolved.workspaceRoot || resolved.packageRoot, '.playwright-browsers');
  if (fs.existsSync(localBrowsers) && fs.statSync(localBrowsers).isDirectory()) {
    env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
  }
  env.SDD_VERIFICATION_OUTPUT = outputFile;
  env.SDD_VERIFICATION_NONCE = nonce;
  return { executable: process.execPath, args: args, cwd: resolved.packageRoot, env: env, shell: false };
}

function execute(invocation, timeout) {
  return spawnSync(invocation.executable, invocation.args, {
    cwd: invocation.cwd, env: invocation.env, shell: false, encoding: 'utf8', timeout: timeout || 120000
  });
}

module.exports = { buildInvocation: buildInvocation, execute: execute,
  inheritedEnvironment: inheritedEnvironment, sanitizeDiagnostic: sanitizeDiagnostic };
