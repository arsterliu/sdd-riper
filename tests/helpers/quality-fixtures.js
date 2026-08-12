'use strict';

var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var canonical = require('../../src/profile/canonical');
var schema = require('../../src/profile/schema');

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function createProject(name) {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-quality-' + (name || 'fixture') + '-'));
  write(path.join(root, '.sdd-config'), 'DOCS_DIR="mydocs"\nAUTONOMY_MODE="auto"\n');
  ['specs', 'profiles/revisions', 'runs', 'design', 'logs'].forEach(function(directory) {
    fs.mkdirSync(path.join(root, 'mydocs', directory), { recursive: true });
  });
  return root;
}

function cleanup(root) {
  if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
}

function unit(id, roles) {
  return {
    id: id,
    root: 'apps/' + id,
    roles: roles || ['unknown'],
    languages: [],
    runtimes: [],
    frameworks: [],
    manifests: [],
    commandRefs: [],
    evidence: []
  };
}

function profile(units, relations) {
  return {
    detectorVersion: 1,
    sourceSnapshot: [],
    units: units || [unit('web', ['frontend'])],
    relations: relations || []
  };
}

function writeRevision(root, profileValue, writeCurrent) {
  var normalized = schema.normalizeProfile(profileValue);
  var digest = canonical.digestProfile(normalized);
  var relative = 'profiles/revisions/' + digest.replace(':', '-') + '.json';
  var revision = {
    schemaVersion: 1,
    kind: 'sdd-project-profile-revision',
    profileDigest: digest,
    profile: normalized,
    confirmation: {
      confirmedBy: 'human:fixture',
      confirmedAt: '2026-07-25T00:00:00Z',
      evidence: 'fixture exact profile'
    }
  };
  schema.validateRevision(revision);
  write(path.join(root, 'mydocs', relative), JSON.stringify(revision, null, 2) + '\n');
  if (writeCurrent !== false) {
    write(path.join(root, 'mydocs/profiles/current.json'), JSON.stringify({
      schemaVersion: 1,
      kind: 'sdd-project-profile-current',
      revision: relative,
      profileDigest: digest
    }, null, 2) + '\n');
  }
  return { digest: digest, relative: relative, revision: revision };
}

function acceptanceBlock(id, verification, options) {
  options = options || {};
  var lines = ['### ' + id + ': fixture acceptance', 'Verification: ' + verification];
  if (options.provider) lines.push('Provider: ' + options.provider);
  if (options.manualEvidence) lines.push('Manual Evidence: ' + options.manualEvidence);
  return lines.join('\n');
}

function writeSpec(root, name, options) {
  options = options || {};
  var acs = options.acs || [acceptanceBlock('AC-001', 'unit')];
  var lines = [
    '---',
    'task-name: "' + (name || 'quality-fixture') + '"',
    'mode: standard',
    'project-profile-revision: "' + (options.revision || '') + '"',
    'project-profile-digest: "' + (options.digest || '') + '"',
    'affected-units: "' + (options.affectedUnits || '') + '"',
    '---',
    '## Acceptance Criteria',
    acs.join('\n\n'),
    '## Plan',
    'fixture plan'
  ];
  var file = path.join(root, 'mydocs/specs', (name || 'quality-fixture') + '.md');
  write(file, lines.join('\n') + '\n');
  return file;
}

function snapshotTree(root) {
  var out = {};
  function visit(directory) {
    fs.readdirSync(directory, { withFileTypes: true }).sort(function(a, b) {
      return a.name.localeCompare(b.name);
    }).forEach(function(entry) {
      var file = path.join(directory, entry.name);
      var relative = path.relative(root, file).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        out[relative + '/'] = 'dir';
        visit(file);
      } else {
        out[relative] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      }
    });
  }
  visit(root);
  return out;
}

module.exports = {
  acceptanceBlock: acceptanceBlock,
  cleanup: cleanup,
  createProject: createProject,
  profile: profile,
  snapshotTree: snapshotTree,
  unit: unit,
  write: write,
  writeRevision: writeRevision,
  writeSpec: writeSpec
};
