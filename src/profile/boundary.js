'use strict';

var fs = require('fs');
var path = require('path');
var errors = require('./errors');

var DEFAULT_SKIP = ['node_modules', '.git', 'dist', 'build', 'target', 'vendor'];

function inside(root, target) {
  var relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function normalizedRelative(value) {
  return String(value || '').replace(/\\/g, '/');
}

function resolveContained(root, relative, options) {
  options = options || {};
  root = path.resolve(root);
  var raw = String(relative || '');
  if (!raw || path.isAbsolute(raw)) {
    throw errors.profileError('SDD_PROFILE_PATH_ESCAPE', 'path must be project-relative', { path: raw });
  }
  var target = path.resolve(root, raw);
  if (!inside(root, target)) {
    throw errors.profileError('SDD_PROFILE_PATH_ESCAPE', 'path escapes project root', { path: raw });
  }
  if (fs.existsSync(target)) {
    var rootReal = fs.realpathSync(root);
    var targetReal = fs.realpathSync(target);
    if (!inside(rootReal, targetReal)) {
      throw errors.profileError('SDD_PROFILE_PATH_ESCAPE', 'real path escapes project root', { path: raw });
    }
  } else if (options.mustExist) {
    throw errors.profileError('SDD_PROFILE_PATH_MISSING', 'path does not exist', { path: raw });
  }
  return target;
}

function readContainedUtf8(root, relative, maxBytes) {
  var file = resolveContained(root, relative, { mustExist: true });
  var stat = fs.statSync(file);
  if (!stat.isFile()) throw errors.profileError('SDD_PROFILE_PATH_INVALID', 'path is not a file', { path: relative });
  maxBytes = maxBytes || 1024 * 1024;
  if (stat.size > maxBytes) throw errors.profileError('SDD_PROFILE_SCAN_LIMIT', 'file exceeds read limit', { path: relative, size: stat.size });
  return fs.readFileSync(file, 'utf8');
}

function walkBounded(root, options) {
  options = Object.assign({ maxDepth: 8, maxFiles: 20000, maxFileSize: 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024, skipDirs: DEFAULT_SKIP }, options || {});
  root = path.resolve(root);
  var files = [];
  var totalBytes = 0;
  function walk(dir, depth) {
    if (depth > options.maxDepth) throw errors.profileError('SDD_PROFILE_SCAN_LIMIT', 'scan depth limit exceeded', { maxDepth: options.maxDepth });
    var entries = fs.readdirSync(dir, { withFileTypes: true }).sort(function(a, b) { return a.name.localeCompare(b.name); });
    entries.forEach(function(entry) {
      if (entry.isSymbolicLink()) return;
      var absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (options.skipDirs.indexOf(entry.name) !== -1 || (entry.name.startsWith('.') && entry.name !== '.github')) return;
        walk(absolute, depth + 1);
        return;
      }
      if (!entry.isFile()) return;
      var stat = fs.statSync(absolute);
      if (stat.size > options.maxFileSize) throw errors.profileError('SDD_PROFILE_SCAN_LIMIT', 'file size limit exceeded', { path: normalizedRelative(path.relative(root, absolute)) });
      files.push({ absolute: absolute, relative: normalizedRelative(path.relative(root, absolute)), size: stat.size });
      totalBytes += stat.size;
      if (files.length > options.maxFiles || totalBytes > options.maxTotalBytes) {
        throw errors.profileError('SDD_PROFILE_SCAN_LIMIT', 'scan budget exceeded', { files: files.length, bytes: totalBytes });
      }
    });
  }
  walk(root, 0);
  return files;
}

function safeText(value, maxLength) {
  var text = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  maxLength = maxLength || 256;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

module.exports = {
  DEFAULT_SKIP: DEFAULT_SKIP,
  inside: inside,
  normalizedRelative: normalizedRelative,
  readContainedUtf8: readContainedUtf8,
  resolveContained: resolveContained,
  safeText: safeText,
  walkBounded: walkBounded
};
