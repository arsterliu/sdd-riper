'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var os = require('os');
var path = require('path');
var fixtures = require('./helpers/profile-fixtures');
var candidateService = require('../src/profile/candidate');
var store = require('../src/profile/store');

function setupBoundTask(root) {
  fixtures.write(path.join(root, 'package.json'), JSON.stringify({ name: 'root', private: true, workspaces: ['apps/*'] }, null, 2) + '\n');
  fixtures.write(path.join(root, 'apps/web/package.json'), JSON.stringify({ name: 'web', dependencies: { react: '^19.0.0', api: 'workspace:*' } }, null, 2) + '\n');
  fixtures.write(path.join(root, 'apps/api/package.json'), JSON.stringify({ name: 'api', dependencies: { express: '^5.0.0' } }, null, 2) + '\n');
  var detected = candidateService.detectProfile(root);
  fixtures.write(path.join(root, 'candidate.json'), JSON.stringify(detected.candidate, null, 2));
  var saved = store.confirmProfile(root, {
    candidate: 'candidate.json', expectedDigest: detected.candidateDigest,
    confirmedBy: 'human:fixture', confirmationEvidence: 'approved exact digest'
  });
  var created = fixtures.runCli(['discover', root, '--task-name', 'bound', '--spec-version', 'v9.2', '--mode', 'standard', '--unit', 'web', 'api'], root);
  assert.equal(created.status, 0, created.output);
  return saved;
}

test('init creates only the profile revisions skeleton and never detects or confirms', function(t) {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-profile-init-'));
  t.after(function() { fixtures.cleanup(root); });
  var result = fixtures.runCli(['init', root], root);
  assert.equal(result.status, 0, result.output);
  assert.equal(fs.existsSync(path.join(root, 'mydocs/profiles/revisions/.gitkeep')), true);
  assert.equal(fs.existsSync(path.join(root, 'mydocs/profiles/current.json')), false);
});

test('next resume and status surface exact bound profile context and cross-unit advisory', function(t) {
  var root = fixtures.createProject('workflow');
  t.after(function() { fixtures.cleanup(root); });
  var saved = setupBoundTask(root);
  ['next', 'resume', 'status'].forEach(function(command) {
    var result = fixtures.runCli([command, root], root);
    assert.match(result.output, new RegExp(saved.profileDigest), command + ': ' + result.output);
    assert.match(result.output, /AFFECTED_UNITS: api,web/, command + ': ' + result.output);
  });
  var next = fixtures.runCli(['next', root], root);
  assert.match(next.output, /PROFILE_ADVISORY: cross-unit/);
  assert.match(next.output, /Interface Contract/);
  assert.match(next.output, /Compatibility/);
});

test('generated agent instructions and source skill enforce exact revision and human confirm boundaries', function(t) {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-profile-agent-'));
  t.after(function() { fixtures.cleanup(root); });
  assert.equal(fixtures.runCli(['init', root], root).status, 0);
  ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md'].forEach(function(file) {
    var content = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(content, /project-profile-revision/);
    assert.match(content, /exact revision/i);
    assert.match(content, /profile confirm.*explicit.*user authorization/i);
    assert.match(content, /commandRefs.*must not.*executed/i);
    assert.match(content, /must not.*install.*Provider/i);
  });
  var skill = fs.readFileSync(path.resolve(__dirname, '..', 'SKILL.md'), 'utf8');
  assert.match(skill, /project-profile-revision/);
  assert.match(skill, /profile confirm.*explicit.*user authorization/i);
  assert.match(skill, /commandRefs.*must not.*executed/i);
});

