'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var errors = require('./errors');

var FILE_LIMIT = 25 * 1024 * 1024;
var RUN_LIMIT = 100 * 1024 * 1024;

function inside(root, target) {
  var relative = path.relative(root, target);
  return relative === '' || (!!relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function safeName(value) { return path.basename(String(value || 'attachment')).replace(/[^A-Za-z0-9._-]/g, '_'); }

function copyAttachments(attachmentRoot, staging, attachments) {
  var total = 0;
  return (attachments || []).map(function(item, index) {
    var candidate = path.resolve(item.source);
    if (!inside(attachmentRoot, candidate) || !fs.existsSync(candidate)) errors.fail('PATH_ESCAPE', 'attachment escapes Provider workspaceRoot', { path: item.source });
    var source = fs.realpathSync(candidate);
    if (!inside(attachmentRoot, source)) errors.fail('PATH_ESCAPE', 'attachment realpath escapes Provider workspaceRoot', { path: item.source });
    var size = fs.statSync(source).size;
    if (size > FILE_LIMIT) errors.fail('ATTACHMENT_TOO_LARGE', 'attachment exceeds 25 MiB', { path: item.source });
    total += size;
    if (total > RUN_LIMIT) errors.fail('ATTACHMENTS_TOO_LARGE', 'run attachments exceed 100 MiB');
    var sha256 = digest(source);
    var relative = path.join('artifacts', sha256 + '-' + index + '-' + safeName(item.name)).replace(/\\/g, '/');
    fs.copyFileSync(source, path.join(staging, relative));
    return { path: relative, name: item.name || safeName(source), mediaType: item.mediaType || 'application/octet-stream', size: size, sha256: sha256 };
  });
}

module.exports = { copyAttachments: copyAttachments, FILE_LIMIT: FILE_LIMIT, RUN_LIMIT: RUN_LIMIT };
