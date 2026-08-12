'use strict';

var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var spawnSync = require('child_process').spawnSync;

var CLI = path.resolve(__dirname, '..', '..', 'bin', 'cli.js');

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function createProject(name) {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-profile-' + (name || 'fixture') + '-'));
  write(path.join(root, '.sdd-config'), 'DOCS_DIR="mydocs"\nAUTONOMY_MODE="auto"\n');
  ['specs', 'design', 'logs', 'learnings', 'runs', 'context', 'archive'].forEach(function(dir) {
    write(path.join(root, 'mydocs', dir, '.gitkeep'), '');
  });
  return root;
}

function cleanup(root) {
  if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
}

function runCli(args, cwd) {
  var result = spawnSync(process.execPath, [CLI].concat(args), { cwd: cwd, encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output: (result.stdout || '') + (result.stderr || '')
  };
}

function snapshotTree(root) {
  var out = {};
  function visit(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).sort(function(a, b) { return a.name.localeCompare(b.name); }).forEach(function(entry) {
      var absolute = path.join(dir, entry.name);
      var relative = path.relative(root, absolute).replace(/\\/g, '/');
      if (entry.isSymbolicLink()) { out[relative] = 'symlink:' + fs.readlinkSync(absolute); return; }
      if (entry.isDirectory()) { out[relative + '/'] = 'dir'; visit(absolute); return; }
      out[relative] = fs.readFileSync(absolute).toString('base64');
    });
  }
  visit(root);
  return out;
}

function validProfile() {
  var manifest = '{"name":"web"}\n';
  return {
    detectorVersion: 1,
    sourceSnapshot: [{ path: 'apps/web/package.json', kind: 'package-json', size: Buffer.byteLength(manifest), sha256: sha(manifest) }],
    units: [{
      id: 'web', root: 'apps/web', roles: ['frontend'], languages: ['javascript'], runtimes: ['browser'],
      frameworks: [{ id: 'react', confidence: 'high', evidenceIds: ['ev-web-react'] }],
      manifests: ['apps/web/package.json'],
      commandRefs: [{ kind: 'npm-script', name: 'test', source: 'apps/web/package.json' }],
      evidence: [{ id: 'ev-web-react', path: 'apps/web/package.json', kind: 'dependency', claim: 'react dependency', confidence: 'high' }]
    }],
    relations: []
  };
}

function validCandidate() {
  return { schemaVersion: 1, kind: 'sdd-project-profile-candidate', profile: validProfile() };
}

module.exports = {
  cleanup: cleanup,
  createProject: createProject,
  runCli: runCli,
  sha: sha,
  snapshotTree: snapshotTree,
  validCandidate: validCandidate,
  validProfile: validProfile,
  write: write
};
