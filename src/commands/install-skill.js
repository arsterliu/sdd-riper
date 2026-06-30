var fs = require('fs');
var os = require('os');
var path = require('path');

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
  return { target: target.name, dir: target.dir, copied: copied };
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
  targets.forEach(function(item) {
    var result = installOne(item, { clean: !!opts.clean });
    console.log('[INSTALL] ' + result.target + ' skill -> ' + result.dir);
    console.log('[COPIED] ' + result.copied + ' package entries');
  });
  console.log('Restart your agent session after updating the skill.');
}

module.exports = run;
module.exports._private = {
  COPY_ENTRIES: COPY_ENTRIES,
  resolveTargets: resolveTargets,
  installOne: installOne
};
