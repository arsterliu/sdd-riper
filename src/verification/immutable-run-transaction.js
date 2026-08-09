'use strict';

var fs = require('fs');
var path = require('path');
var attachmentStore = require('./attachment-store');

var STATIC_NAMESPACES = { verification: true, visual: true };

function inside(root, target) {
  var relative = path.relative(root, target);
  return relative === '' || (!!relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function createImmutableRunCommitter(namespace, onCollision) {
  if (!Object.prototype.hasOwnProperty.call(STATIC_NAMESPACES, namespace)) {
    throw new Error('immutable transaction requires a static namespace');
  }
  if (typeof onCollision !== 'function') throw new Error('immutable transaction requires a collision handler');

  return function commitImmutableRun(projectRoot, docsDir, run, attachmentRoot, attachments) {
    if (!run || !/^[A-Za-z0-9._-]+$/.test(String(run.runId || ''))) {
      throw new Error('immutable transaction requires a validated runId');
    }
    var trustedProjectRoot = fs.realpathSync(path.resolve(projectRoot));
    var runsRoot = path.resolve(trustedProjectRoot, docsDir, 'runs', namespace);
    if (!inside(trustedProjectRoot, runsRoot)) {
      throw new Error('immutable transaction requires a trusted project root and docs directory');
    }
    var finalDir = path.join(runsRoot, run.runId);
    fs.mkdirSync(runsRoot, { recursive: true });
    if (fs.existsSync(finalDir)) onCollision(run.runId);
    var staging = path.join(runsRoot, '.staging-' + run.runId + '-' + process.pid + '-' + Date.now());
    fs.mkdirSync(path.join(staging, 'artifacts'), { recursive: true });
    try {
      var records = attachmentStore.copyAttachments(attachmentRoot, staging, attachments);
    var value = Object.assign({}, run, { attachments: records });
    fs.writeFileSync(path.join(staging, 'run.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
      if (fs.existsSync(finalDir)) onCollision(run.runId);
    fs.renameSync(staging, finalDir);
    return { runDir: finalDir, run: value };
    } catch (error) {
      fs.rmSync(staging, { recursive: true, force: true });
      throw error;
    }
  };
}

module.exports = { createImmutableRunCommitter: createImmutableRunCommitter };
