var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var MANIFEST = '.sdd-skill-manifest.json';

function listFiles(root, entry, result) {
  var full = path.join(root, entry);
  if (!fs.existsSync(full)) return;
  var stat = fs.statSync(full);
  if (stat.isDirectory()) {
    fs.readdirSync(full).sort().forEach(function(name) {
      listFiles(root, path.join(entry, name), result);
    });
    return;
  }
  if (entry.replace(/\\/g, '/') === MANIFEST) return;
  result.push(entry.replace(/\\/g, '/'));
}

function fingerprint(root, entries) {
  var files = [];
  (entries || []).slice().sort().forEach(function(entry) {
    listFiles(root, entry, files);
  });
  var hash = crypto.createHash('sha256');
  files.sort().forEach(function(relative) {
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, relative)));
    hash.update('\0');
  });
  return hash.digest('hex');
}

function writeManifest(targetDir, data) {
  fs.writeFileSync(path.join(targetDir, MANIFEST), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

module.exports = {
  MANIFEST: MANIFEST,
  fingerprint: fingerprint,
  writeManifest: writeManifest
};
