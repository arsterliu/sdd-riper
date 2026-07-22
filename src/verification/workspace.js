'use strict';

var fs = require('fs');
var path = require('path');
var errors = require('./errors');

var LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];

function inside(root, target) {
  var relative = path.relative(root, target);
  return relative === '' || (relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function resolveContained(root, relative, label) {
  var target = path.resolve(root, relative);
  if (!inside(root, target)) errors.fail('PATH_ESCAPE', label + ' escapes workspaceRoot', { path: relative });
  return target;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { errors.fail('MANIFEST_INVALID', 'invalid package manifest', { path: file, cause: error.message }); }
}

function declaringManifest(packageRoot, workspaceRoot) {
  var current = packageRoot;
  while (inside(workspaceRoot, current)) {
    var manifest = path.join(current, 'package.json');
    if (fs.existsSync(manifest)) {
      var resolvedManifest = fs.realpathSync(manifest);
      if (!inside(workspaceRoot, resolvedManifest) || !fs.statSync(resolvedManifest).isFile()) {
        errors.fail('PATH_ESCAPE', 'declaring manifest realpath escapes workspaceRoot', { path: manifest });
      }
      var value = readJson(resolvedManifest);
      var declared = (value.dependencies && value.dependencies['@playwright/test']) ||
        (value.devDependencies && value.devDependencies['@playwright/test']);
      if (declared) return resolvedManifest;
    }
    if (current === workspaceRoot) break;
    current = path.dirname(current);
  }
  errors.fail('PACKAGE_NOT_DECLARED', '@playwright/test must be directly declared by a workspace manifest');
}

function parseVersion(version) {
  var match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function compare(a, b) {
  for (var i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

function satisfies(version, range) {
  if (!range) return true;
  var actual = parseVersion(version);
  if (!actual) return false;
  return String(range).split(/\s+/).filter(Boolean).every(function(clause) {
    var match = clause.match(/^(>=|>|<=|<|=)?(\d+\.\d+\.\d+)$/);
    if (!match) return false;
    var relation = compare(actual, parseVersion(match[2]));
    return match[1] === '>=' ? relation >= 0 : match[1] === '>' ? relation > 0 :
      match[1] === '<=' ? relation <= 0 : match[1] === '<' ? relation < 0 : relation === 0;
  });
}

function lockfileManages(lockfile, version) {
  var name = path.basename(lockfile);
  var content = fs.readFileSync(lockfile, 'utf8');
  if (name === 'package-lock.json' || name === 'npm-shrinkwrap.json') {
    var value;
    try { value = JSON.parse(content); } catch (error) { return false; }
    var entry = value.packages && value.packages['node_modules/@playwright/test'];
    if (!entry && value.dependencies) entry = value.dependencies['@playwright/test'];
    return !!entry && entry.version === version;
  }
  var escaped = String(version).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (name === 'pnpm-lock.yaml') {
    var section = '';
    return content.split(/\r?\n/).some(function(line) {
      if (!line.trim() || line.trim().startsWith('#')) return false;
      if (!/^\s/.test(line)) {
        var top = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*$/);
        section = top ? top[1] : '';
        return false;
      }
      if (section !== 'packages' && section !== 'snapshots') return false;
      var key = line.trim().match(/^['"]?(?:\/)?@playwright\/test@([^'":\s]+)['"]?:\s*(?:\{\})?\s*(?:#.*)?$/);
      return !!key && key[1] === version;
    });
  }
  if (name === 'yarn.lock') {
    var inTarget = false;
    return content.split(/\r?\n/).some(function(line) {
      if (!line.trim() || line.trim().startsWith('#')) return false;
      if (!/^\s/.test(line)) {
        inTarget = /^(?:"@playwright\/test@[^"]+"|'@playwright\/test@[^']+'|@playwright\/test@\S+):\s*$/.test(line.trim());
        return false;
      }
      if (!inTarget) return false;
      var versionLine = line.trim().match(/^version(?:\s+|:\s*)['"]?([^'"\s]+)['"]?\s*$/);
      return !!versionLine && versionLine[1] === version;
    });
  }
  return false;
}

function resolveWorkspace(provider, projectDir, adapterManifest) {
  var projectRoot = fs.realpathSync(path.resolve(projectDir));
  var workspaceCandidate = resolveContained(projectRoot, provider.workspaceRoot, 'workspaceRoot');
  if (!fs.existsSync(workspaceCandidate)) errors.fail('WORKSPACE_NOT_FOUND', 'workspaceRoot does not exist');
  var workspaceRoot = fs.realpathSync(workspaceCandidate);
  if (!inside(projectRoot, workspaceRoot)) errors.fail('PATH_ESCAPE', 'workspaceRoot escapes project');
  var packageCandidate = resolveContained(workspaceRoot, provider.packageRoot, 'packageRoot');
  if (!fs.existsSync(packageCandidate)) errors.fail('PACKAGE_ROOT_NOT_FOUND', 'packageRoot does not exist');
  var packageRoot = fs.realpathSync(packageCandidate);
  if (!inside(workspaceRoot, packageRoot)) errors.fail('PATH_ESCAPE', 'packageRoot escapes workspaceRoot');

  if (fs.existsSync(path.join(workspaceRoot, '.pnp.cjs')) || fs.existsSync(path.join(workspaceRoot, '.pnp.js'))) {
    errors.fail('YARN_PNP_UNSUPPORTED', 'Yarn PnP is not supported');
  }
  var lockfiles = LOCKFILES.map(function(name) { return path.join(workspaceRoot, name); }).filter(fs.existsSync).map(function(file) {
    var resolved = fs.realpathSync(file);
    if (!inside(workspaceRoot, resolved)) errors.fail('PATH_ESCAPE', 'lockfile realpath escapes workspaceRoot', { path: file });
    return resolved;
  });
  if (!lockfiles.length) errors.fail('LOCKFILE_MISSING', 'workspace lockfile is required');
  if (lockfiles.length !== 1) errors.fail('LOCKFILE_AMBIGUOUS', 'workspace must contain exactly one supported lockfile');
  if (!fs.statSync(lockfiles[0]).isFile() || fs.statSync(lockfiles[0]).size === 0) {
    errors.fail('LOCKFILE_INVALID', 'workspace lockfile must be a non-empty regular file', { path: lockfiles[0] });
  }
  var manifest = declaringManifest(packageRoot, workspaceRoot);

  var toolPackage;
  try { toolPackage = require.resolve('@playwright/test/package.json', { paths: [packageRoot] }); }
  catch (error) { errors.fail('PACKAGE_NOT_RESOLVABLE', '@playwright/test is not resolvable from packageRoot'); }
  toolPackage = fs.realpathSync(toolPackage);
  if (!inside(workspaceRoot, toolPackage)) errors.fail('PATH_ESCAPE', 'resolved package escapes workspaceRoot');
  var toolVersion = readJson(toolPackage).version;
  if (!satisfies(toolVersion, adapterManifest && adapterManifest.testedToolRange)) {
    errors.fail('TOOL_VERSION_UNSUPPORTED', 'resolved @playwright/test version is unsupported', {
      version: toolVersion, testedToolRange: adapterManifest.testedToolRange
    });
  }
  if (!lockfileManages(lockfiles[0], toolVersion)) {
    errors.fail('LOCKFILE_PACKAGE_MISSING', 'lockfile does not manage the resolved @playwright/test version', {
      path: lockfiles[0], version: toolVersion
    });
  }
  return {
    workspaceRoot: workspaceRoot,
    packageRoot: packageRoot,
    declaringManifest: manifest,
    lockfile: lockfiles[0],
    toolPackage: toolPackage,
    toolVersion: toolVersion
  };
}

function assertRuntime(adapterManifest) {
  var runtime = adapterManifest && adapterManifest.runtime;
  if (!runtime || runtime.kind !== 'node' || !satisfies(process.versions.node, runtime.nodeRange)) {
    errors.fail('RUNTIME_UNSUPPORTED', 'current runtime does not satisfy Adapter manifest', {
      actual: process.versions.node, required: runtime && runtime.nodeRange
    });
  }
  return process.versions.node;
}

function resolveConfigFile(workspaceRoot, relative) {
  var candidate = resolveContained(workspaceRoot, relative, 'config');
  if (!fs.existsSync(candidate)) errors.fail('CONFIG_NOT_FOUND', 'provider config does not exist', { path: relative });
  var resolved = fs.realpathSync(candidate);
  if (!inside(workspaceRoot, resolved) || !fs.statSync(resolved).isFile()) {
    errors.fail('PATH_ESCAPE', 'provider config realpath escapes workspaceRoot', { path: relative });
  }
  return resolved;
}

module.exports = { resolveWorkspace: resolveWorkspace, resolveConfigFile: resolveConfigFile,
  lockfileManages: lockfileManages, assertRuntime: assertRuntime, satisfies: satisfies };
