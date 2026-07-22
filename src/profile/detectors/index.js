'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var boundary = require('../boundary');
var errors = require('../errors');

var MANIFESTS = {
  'pom.xml': { kind: 'maven', language: 'java', runtime: 'jvm' },
  'build.gradle': { kind: 'gradle', language: 'java', runtime: 'jvm' },
  'build.gradle.kts': { kind: 'gradle', language: 'kotlin', runtime: 'jvm' },
  'pyproject.toml': { kind: 'pyproject', language: 'python', runtime: 'python' },
  'go.mod': { kind: 'go-module', language: 'go', runtime: 'go' },
  'Cargo.toml': { kind: 'cargo', language: 'rust', runtime: 'native' }
};
var FRONTEND = { react: 'react', vue: 'vue', svelte: 'svelte', '@angular/core': 'angular', next: 'next' };
var BACKEND = { express: 'express', fastify: 'fastify', koa: 'koa', '@nestjs/core': 'nestjs', next: 'next' };
var SAFE_SCRIPTS = ['build', 'test', 'lint', 'typecheck', 'dev', 'start'];

function sha(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function relRoot(relativeFile) {
  var dir = path.posix.dirname(relativeFile.replace(/\\/g, '/'));
  return dir === '.' ? '.' : dir;
}
function slug(value) {
  var raw = String(value || '').split('/').pop().replace(/^@/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return raw && /^[A-Za-z]/.test(raw) ? raw : 'unit';
}
function uniqueId(base, used) {
  var value = base;
  var index = 2;
  while (used[value]) { value = base + '-' + index; index++; }
  used[value] = true;
  return value;
}
function evidenceId(unitId, index) { return 'ev-' + unitId + '-' + String(index).padStart(3, '0'); }
function frameworkFacts(dependencies, unit, evidenceIndex) {
  var frameworks = [];
  Object.keys(dependencies).sort().forEach(function(name) {
    var roles = [];
    if (FRONTEND[name]) roles.push('frontend');
    if (BACKEND[name]) roles.push('backend');
    if (!roles.length) return;
    var id = evidenceId(unit.id, evidenceIndex.value++);
    unit.evidence.push({ id: id, path: unit.manifests[0], kind: 'dependency', claim: 'framework dependency: ' + name, confidence: 'high' });
    roles.forEach(function(role) { if (unit.roles.indexOf(role) === -1) unit.roles.push(role); });
    var framework = FRONTEND[name] || BACKEND[name];
    if (!frameworks.some(function(item) { return item.id === framework; })) frameworks.push({ id: framework, confidence: 'high', evidenceIds: [id] });
  });
  unit.frameworks = frameworks;
}

function nodeUnit(file, content, used, allFiles) {
  var parsed;
  try { parsed = JSON.parse(content); }
  catch (error) { throw errors.profileError('SDD_PROFILE_MANIFEST_INVALID', 'package.json is invalid JSON', { path: file.relative }); }
  var root = relRoot(file.relative);
  var id = uniqueId(slug(parsed.name || (root === '.' ? 'root' : path.posix.basename(root))), used);
  var unit = { id: id, root: root, roles: [], languages: ['javascript'], runtimes: ['node'], frameworks: [], manifests: [file.relative], commandRefs: [], evidence: [] };
  var ev = { value: 1 };
  var dependencies = Object.assign({}, parsed.dependencies || {}, parsed.devDependencies || {}, parsed.peerDependencies || {}, parsed.optionalDependencies || {});
  frameworkFacts(dependencies, unit, ev);
  var declaredRoles = parsed.sddProfile && Array.isArray(parsed.sddProfile.roles) ? parsed.sddProfile.roles : [];
  declaredRoles.forEach(function(role) {
    var eid = evidenceId(unit.id, ev.value++);
    unit.evidence.push({ id: eid, path: file.relative, kind: 'manifest-declaration', claim: 'declared role: ' + boundary.safeText(role, 64), confidence: 'high' });
    if (unit.roles.indexOf(role) === -1) unit.roles.push(role);
  });
  if (!unit.roles.length) unit.roles.push('unknown');
  if (unit.roles.indexOf('frontend') !== -1 && unit.roles.indexOf('backend') === -1) unit.runtimes = ['browser'];
  if (allFiles.some(function(item) { return item.relative.startsWith(root === '.' ? '' : root + '/') && /\.(?:ts|tsx)$/.test(item.relative); })) unit.languages.push('typescript');
  Object.keys(parsed.scripts || {}).sort().forEach(function(name) {
    if (SAFE_SCRIPTS.indexOf(name) !== -1) unit.commandRefs.push({ kind: 'npm-script', name: name, source: file.relative });
  });
  return { unit: unit, packageName: parsed.name || '', dependencies: Object.keys(dependencies).sort(), evidenceIndex: ev };
}

function genericUnit(file, used) {
  var name = path.posix.basename(file.relative);
  var meta = MANIFESTS[name];
  if (!meta && /\.csproj$/i.test(name)) meta = { kind: 'dotnet-project', language: 'csharp', runtime: 'dotnet' };
  if (!meta) return null;
  var root = relRoot(file.relative);
  var id = uniqueId(slug(root === '.' ? meta.kind : path.posix.basename(root)), used);
  var evId = evidenceId(id, 1);
  return {
    unit: { id: id, root: root, roles: ['unknown'], languages: [meta.language], runtimes: [meta.runtime], frameworks: [], manifests: [file.relative], commandRefs: [], evidence: [
      { id: evId, path: file.relative, kind: 'manifest', claim: 'detected build manifest: ' + meta.kind, confidence: 'high' }
    ] }
  };
}

function detect(projectDir, limits) {
  var files = boundary.walkBounded(projectDir, limits);
  var manifestFiles = files.filter(function(file) {
    var name = path.posix.basename(file.relative);
    return name === 'package.json' || !!MANIFESTS[name] || /\.csproj$/i.test(name);
  });
  var used = {};
  var records = [];
  var sources = [];
  manifestFiles.forEach(function(file) {
    var buffer = fs.readFileSync(file.absolute);
    var content = buffer.toString('utf8');
    var record = path.posix.basename(file.relative) === 'package.json'
      ? nodeUnit(file, content, used, files)
      : genericUnit(file, used);
    if (!record) return;
    records.push(record);
    sources.push({ path: file.relative, kind: record.unit.manifests[0].endsWith('package.json') ? 'package-json' : 'manifest', size: buffer.length, sha256: sha(buffer) });
  });
  var byPackage = {};
  records.forEach(function(record) { if (record.packageName) byPackage[record.packageName] = record; });
  var relations = [];
  records.forEach(function(record) {
    (record.dependencies || []).forEach(function(name) {
      var target = byPackage[name];
      if (!target || target.unit.id === record.unit.id) return;
      var id = evidenceId(record.unit.id, record.evidenceIndex.value++);
      record.unit.evidence.push({ id: id, path: record.unit.manifests[0], kind: 'internal-dependency', claim: 'internal package dependency: ' + name, confidence: 'high' });
      relations.push({ from: record.unit.id, to: target.unit.id, kind: 'depends-on', evidenceIds: [id], confidence: 'high' });
    });
  });
  return { sourceSnapshot: sources, units: records.map(function(record) { return record.unit; }), relations: relations };
}

module.exports = { detect: detect };
