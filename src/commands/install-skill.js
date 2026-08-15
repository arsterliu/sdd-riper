var fs = require('fs');
var os = require('os');
var path = require('path');
var skillIntegrity = require('../core/skill-integrity');

var PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
var SKILL_NAME = 'sdd-riper';
var COPY_ENTRIES = [
  'bin',
  'lib',
  'src',
  'node_modules',
  'templates',
  'protocols',
  'vendored',
  'SKILL.md',
  'GUIDE.md',
  'REFERENCE.md',
  'TEAM-GUIDE.md',
  'INTEGRATIONS.md',
  'README.md',
  'package.json',
  'LICENSE'
];

function targetRoots(homeDir) {
  return {
    codex: path.join(homeDir, '.codex', 'skills'),
    'cc-switch': path.join(homeDir, '.cc-switch', 'skills'),
    claude: path.join(homeDir, '.claude', 'skills'),
    opencode: process.platform === 'win32'
      ? path.join(homeDir, '.config', 'opencode', 'skills')
      : path.join(homeDir, '.config', 'opencode', 'skills')
  };
}

function resolveTargets(target, homeDir) {
  var roots = targetRoots(homeDir);
  if (target === 'all') return Object.keys(roots).map(function(name) {
    return { name: name, root: roots[name], dir: path.join(roots[name], SKILL_NAME) };
  });
  if (!roots[target]) {
    throw new Error('Invalid --target: ' + target + ' (expected codex|cc-switch|claude|opencode|all)');
  }
  return [{ name: target, root: roots[target], dir: path.join(roots[target], SKILL_NAME) }];
}

function copyRecursive(source, dest) {
  var stat = fs.statSync(source);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(source).forEach(function(name) {
      copyRecursive(path.join(source, name), path.join(dest, name));
    });
    return;
  }
  fs.copyFileSync(source, dest);
}

function installOne(target, opts) {
  opts = opts || {};
  if (opts.clean && fs.existsSync(target.dir)) {
    fs.rmSync(target.dir, { recursive: true, force: true });
  }
  fs.mkdirSync(target.dir, { recursive: true });
  var copied = 0;
  COPY_ENTRIES.forEach(function(entry) {
    var source = path.join(PACKAGE_ROOT, entry);
    if (!fs.existsSync(source)) return;
    copyRecursive(source, path.join(target.dir, entry));
    copied++;
  });
  var sourceFingerprint = skillIntegrity.fingerprint(PACKAGE_ROOT, COPY_ENTRIES);
  skillIntegrity.writeManifest(target.dir, {
    version: require(path.join(PACKAGE_ROOT, 'package.json')).version,
    fingerprint: sourceFingerprint
  });
  return { target: target.name, dir: target.dir, copied: copied, fingerprint: sourceFingerprint };
}

function checkOne(target) {
  var sourceFingerprint = skillIntegrity.fingerprint(PACKAGE_ROOT, COPY_ENTRIES);
  var sourceVersion = require(path.join(PACKAGE_ROOT, 'package.json')).version;
  if (!fs.existsSync(target.dir)) {
    return { target: target.name, dir: target.dir, ok: false, reason: 'missing-target', sourceVersion: sourceVersion, targetVersion: '', sourceFingerprint: sourceFingerprint, targetFingerprint: '' };
  }
  var targetFingerprint = skillIntegrity.fingerprint(target.dir, COPY_ENTRIES);
  var targetPackage = path.join(target.dir, 'package.json');
  var targetVersion = '';
  if (fs.existsSync(targetPackage)) {
    try { targetVersion = JSON.parse(fs.readFileSync(targetPackage, 'utf-8')).version || ''; } catch (e) {}
  }
  return {
    target: target.name,
    dir: target.dir,
    ok: sourceVersion === targetVersion && sourceFingerprint === targetFingerprint,
    reason: sourceVersion !== targetVersion ? 'version-drift' : (sourceFingerprint === targetFingerprint ? 'aligned' : 'content-drift'),
    sourceVersion: sourceVersion,
    targetVersion: targetVersion,
    sourceFingerprint: sourceFingerprint,
    targetFingerprint: targetFingerprint
  };
}

function run(opts) {
  opts = opts || {};
  var target = opts.target || '';
  if (!target) {
    console.error('[ERROR] --target is required (codex|cc-switch|claude|opencode|all)');
    process.exit(3);
  }
  var homeDir = opts.homeDir || os.homedir();
  var targets;
  try {
    targets = resolveTargets(target, homeDir);
  } catch (e) {
    console.error('[ERROR] ' + e.message);
    process.exit(3);
  }
  var failed = false;
  targets.forEach(function(item) {
    if (opts.check) {
      var checked = checkOne(item);
      console.log('[CHECK] ' + checked.target + ' ' + (checked.ok ? 'OK' : 'DRIFT') + ' -> ' + checked.dir);
      console.log('[SOURCE_VERSION] ' + checked.sourceVersion);
      console.log('[TARGET_VERSION] ' + (checked.targetVersion || 'missing'));
      console.log('[SOURCE_FINGERPRINT] ' + checked.sourceFingerprint);
      console.log('[TARGET_FINGERPRINT] ' + (checked.targetFingerprint || 'missing'));
      if (!checked.ok) {
        failed = true;
        console.log('[REPAIR] sdd install-skill --target ' + checked.target + ' --clean');
      }
      return;
    }
    var result = installOne(item, { clean: !!opts.clean });
    console.log('[INSTALL] ' + result.target + ' skill -> ' + result.dir);
    console.log('[COPIED] ' + result.copied + ' package entries');
  });
  if (opts.check) {
    if (failed) process.exit(1);
    return;
  }
  console.log('Restart your agent session after updating the skill.');
}

module.exports = run;
module.exports._private = {
  COPY_ENTRIES: COPY_ENTRIES,
  resolveTargets: resolveTargets,
  installOne: installOne,
  checkOne: checkOne
};
