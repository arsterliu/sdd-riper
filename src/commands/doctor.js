var fs = require('fs');
var path = require('path');

var PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
var COPY_ENTRIES = require('./install-skill')._private.COPY_ENTRIES;

function uniq(arr) {
  return arr.filter(function(v, i) { return arr.indexOf(v) === i; });
}

function matchAll(content, regex, group) {
  regex.lastIndex = 0;
  var out = [];
  var m;
  while ((m = regex.exec(content)) !== null) {
    out.push(group ? m[group] : m[0]);
    if (m.index === regex.lastIndex) regex.lastIndex++;
  }
  return uniq(out);
}

// Static self-check of SDD wiring. Reads SKILL.md / INTEGRATIONS.md from `root`
// (the SDD package by default) and verifies that every referenced vendored /
// protocols path exists, that INTEGRATIONS touchpoints are wired in SKILL.md,
// and that the referenced top-level dirs are carried by install-skill's
// COPY_ENTRIES (so the agent environment will not get a dangling reference).
function run(root) {
  root = root ? path.resolve(root) : PACKAGE_ROOT;

  function read(rel) {
    var p = path.join(root, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
  }

  var skill = read('SKILL.md');
  var integrations = read('INTEGRATIONS.md');
  var checks = [];

  // 1. Referenced vendored + protocols paths exist on disk.
  var refs = uniq(
    matchAll(skill + '\n' + integrations, /vendored\/superpowers\/[A-Za-z0-9._-]+/g)
      .concat(matchAll(skill, /protocols\/[A-Za-z0-9._-]+\.md/g))
  );
  refs.forEach(function(ref) {
    var exists = fs.existsSync(path.join(root, ref));
    checks.push({ ok: exists, name: 'referenced path exists: ' + ref, detail: exists ? '' : 'missing on disk' });
  });

  // 2. Every INTEGRATIONS touchpoint skill is actually wired in SKILL.md.
  // Only vendored entries that are skill *directories* count; files like
  // LICENSE / SYNC.md / .upstream-commit are referenced in prose, not skills.
  var integSkills = matchAll(integrations, /vendored\/superpowers\/([A-Za-z0-9._-]+)/g, 1)
    .filter(function(name) {
      var p = path.join(root, 'vendored', 'superpowers', name);
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    });
  integSkills.forEach(function(name) {
    var wired = skill.indexOf(name) !== -1;
    checks.push({ ok: wired, name: 'INTEGRATIONS skill wired in SKILL.md: ' + name, detail: wired ? '' : 'declared in INTEGRATIONS but not referenced in SKILL.md' });
  });

  // 3. Referenced top-level dirs are carried by install-skill COPY_ENTRIES.
  var topDirs = uniq(refs.map(function(r) { return r.split('/')[0]; }));
  topDirs.forEach(function(dir) {
    var covered = COPY_ENTRIES.indexOf(dir) !== -1;
    checks.push({ ok: covered, name: 'install-skill COPY_ENTRIES covers: ' + dir, detail: covered ? '' : 'not in COPY_ENTRIES — agent environment would be missing it' });
  });

  var failed = checks.filter(function(c) { return !c.ok; });
  console.log('[SDD Doctor] ' + root);
  checks.forEach(function(c) {
    console.log((c.ok ? 'OK   ' : 'FAIL ') + c.name + (c.detail ? ' — ' + c.detail : ''));
  });
  console.log('RESULT: ' + (failed.length ? 'FAIL (' + failed.length + ' issue' + (failed.length === 1 ? '' : 's') + ')' : 'OK'));
  if (failed.length) process.exit(1);
}

module.exports = run;
