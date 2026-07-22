var path = require('path');
var common = require('../../lib/common');
var specIndex = require('./spec-index');

var TTL_MS = 10000;
var snapshots = new Map();

function now() {
  return Date.now();
}

function emptySnapshot(projectDir) {
  return {
    projectDir: projectDir,
    docsDir: common.getDocsDir(projectDir),
    docsRoot: common.getDocsRoot(projectDir),
    specs: [],
    counts: {},
    state: 'indexing',
    stale: true,
    indexedAt: 0,
    refreshStartedAt: 0,
    error: ''
  };
}

function summarize(snapshot) {
  var specs = snapshot.specs || [];
  return {
    projectDir: snapshot.projectDir,
    docsDir: snapshot.docsDir,
    docsRoot: snapshot.docsRoot,
    state: snapshot.state,
    stale: snapshot.stale,
    indexedAt: snapshot.indexedAt,
    refreshStartedAt: snapshot.refreshStartedAt,
    error: snapshot.error,
    total: specs.length,
    active: specs.filter(function(spec) { return spec.phase !== 'archived'; }).length,
    awaitingArchiveAuthorization: specs.filter(function(spec) { return spec.phase === 'archive_authorization'; }).length,
    issueCount: 0,
    issueCountLightweight: true,
    counts: snapshot.counts || {},
    latestSpec: specs[0] || null
  };
}

function normalizeProjectDir(projectDir) {
  return path.resolve(projectDir);
}

function build(projectDir) {
  var indexed = specIndex.listSpecs(projectDir, { lightweight: true });
  return {
    projectDir: indexed.projectDir,
    docsDir: indexed.docsDir,
    docsRoot: indexed.docsRoot,
    specs: indexed.specs,
    counts: indexed.counts,
    state: 'ready',
    stale: false,
    indexedAt: now(),
    refreshStartedAt: 0,
    error: ''
  };
}

function enqueueRefresh(projectDir, force) {
  projectDir = normalizeProjectDir(projectDir);
  var existing = snapshots.get(projectDir);
  if (existing && existing.state === 'indexing' && !force) return existing;
  var base = existing || emptySnapshot(projectDir);
  base.state = 'indexing';
  base.stale = true;
  base.refreshStartedAt = now();
  snapshots.set(projectDir, base);
  setImmediate(function() {
    try {
      snapshots.set(projectDir, build(projectDir));
    } catch (e) {
      var failed = snapshots.get(projectDir) || emptySnapshot(projectDir);
      failed.state = 'error';
      failed.stale = true;
      failed.error = e.message || String(e);
      failed.refreshStartedAt = 0;
      snapshots.set(projectDir, failed);
    }
  });
  return base;
}

function getSnapshot(projectDir, opts) {
  opts = opts || {};
  projectDir = normalizeProjectDir(projectDir);
  var snapshot = snapshots.get(projectDir);
  if (!snapshot) return enqueueRefresh(projectDir, false);
  var expired = snapshot.indexedAt && now() - snapshot.indexedAt > (opts.ttlMs || TTL_MS);
  if (opts.refresh || expired) {
    enqueueRefresh(projectDir, !!opts.refresh);
    var current = snapshots.get(projectDir) || snapshot;
    current.stale = true;
    return current;
  }
  return snapshot;
}

function clear() {
  snapshots.clear();
}

module.exports = {
  getSnapshot: getSnapshot,
  enqueueRefresh: enqueueRefresh,
  summarize: summarize,
  clear: clear,
  TTL_MS: TTL_MS
};
