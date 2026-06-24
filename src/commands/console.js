var fs = require('fs');
var http = require('http');
var path = require('path');
var url = require('url');
var childProcess = require('child_process');
var execFile = childProcess.execFile;
var execFileSync = childProcess.execFileSync;
var common = require('../../lib/common');
var specIndex = require('../core/spec-index');
var projectIndexer = require('../core/project-indexer');

var WEB_ROOT = path.resolve(__dirname, '..', 'web');

function readRequestBody(req, callback) {
  var body = '';
  req.on('data', function(chunk) {
    body += chunk;
    if (body.length > 1024 * 1024) req.destroy();
  });
  req.on('end', function() { callback(body); });
}

function projectInfo(projectDir) {
  if (!projectDir) {
    return {
      projectDir: '',
      docsDir: '',
      docsRoot: '',
      configured: false,
      cwd: process.cwd()
    };
  }
  var resolved = path.resolve(projectDir);
  var docsRoot = common.getDocsRoot(resolved);
  return {
    projectDir: resolved,
    docsDir: common.getDocsDir(resolved),
    docsRoot: docsRoot,
    configured: fs.existsSync(docsRoot),
    cwd: process.cwd()
  };
}

function browseProjectDir() {
  if (process.platform !== 'win32') {
    throw new Error('Folder picker is only implemented on Windows. Start console from the project root and use Load Launch Folder.');
  }
  var script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$dialog.Description = "Select an SDD project directory"',
    '$dialog.ShowNewFolderButton = $false',
    'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '  Write-Output $dialog.SelectedPath',
    '}'
  ].join('; ');
  return execFileSync('powershell.exe', [
    '-NoProfile',
    '-STA',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], { encoding: 'utf-8', windowsHide: false }).trim();
}

function requireProject(currentProjectDir, res) {
  var info = projectInfo(currentProjectDir);
  if (!info.configured) {
    sendJson(res, 400, {
      error: 'Project not selected or not initialized.',
      project: info
    });
    return null;
  }
  return info;
}

function summarizeProject(projectDir, opts) {
  opts = opts || {};
  var info = projectInfo(projectDir);
  var summary = {
    projectDir: info.projectDir || path.resolve(projectDir || ''),
    name: path.basename(path.resolve(projectDir || '.')),
    docsDir: info.docsDir,
    configured: info.configured,
    total: 0,
    active: 0,
    ready: 0,
    issueCount: 0,
    counts: {},
    latestSpec: null,
    error: ''
  };
  if (!info.configured) {
    summary.error = 'Project is not initialized.';
    return summary;
  }
  try {
    var snapshot = projectIndexer.getSnapshot(info.projectDir, { refresh: !!opts.refresh });
    var indexedSummary = projectIndexer.summarize(snapshot);
    Object.keys(indexedSummary).forEach(function(key) {
      summary[key] = indexedSummary[key];
    });
  } catch (e) {
    summary.configured = false;
    summary.error = e.message || String(e);
  }
  return summary;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(filePath).pipe(res);
}

function contentTypeFor(filePath) {
  var ext = path.extname(filePath);
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.html') return 'text/html; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function staticPath(pathname) {
  if (pathname === '/') return path.join(WEB_ROOT, 'index.html');
  var clean = pathname.replace(/^\/+/, '');
  var resolved = path.resolve(WEB_ROOT, clean);
  if (resolved !== WEB_ROOT && !resolved.startsWith(WEB_ROOT + path.sep)) return '';
  return resolved;
}

function isInsideProject(projectDir, filePath) {
  var root = path.resolve(projectDir);
  var resolved = path.resolve(filePath);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function artifactLabel(artifactType) {
  if (artifactType === 'spec') return 'Spec';
  if (artifactType === 'design') return 'Design';
  if (artifactType === 'executeLog') return 'Execute Log';
  if (artifactType === 'learning') return 'Learning';
  return 'Artifact';
}

function resolveArtifactTarget(projectDir, specId, artifactType) {
  var spec = specIndex.getSpec(projectDir, specId);
  if (!spec) throw new Error('Spec not found.');
  var targetPath = '';
  var relativePath = '';
  if (artifactType === 'spec') {
    relativePath = spec.relativePath;
    targetPath = path.join(projectDir, relativePath);
  } else if (artifactType === 'design' || artifactType === 'executeLog' || artifactType === 'learning') {
    var artifact = spec.artifacts && spec.artifacts[artifactType];
    if (artifact && artifact.notRequired) throw new Error('Artifact is not required for this spec.');
    relativePath = artifact && artifact.relativePath ? artifact.relativePath : '';
    targetPath = artifact && artifact.path ? artifact.path : '';
  } else {
    throw new Error('Unknown artifact type.');
  }
  if (!targetPath || !fs.existsSync(targetPath)) throw new Error('Artifact file does not exist.');
  if (!isInsideProject(projectDir, targetPath)) throw new Error('Artifact path is outside the selected project.');
  return {
    artifact: artifactType,
    label: artifactLabel(artifactType),
    path: path.resolve(targetPath),
    relativePath: relativePath || common.relativeToProject(projectDir, targetPath)
  };
}

function readArtifact(projectDir, specId, artifactType) {
  var target = resolveArtifactTarget(projectDir, specId, artifactType);
  return {
    artifact: target.artifact,
    label: target.label,
    relativePath: target.relativePath,
    content: fs.readFileSync(target.path, 'utf-8')
  };
}

function openLocalPath(filePath, callback) {
  if (process.platform === 'win32') {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', filePath], { windowsHide: true }, callback);
    return;
  }
  if (process.platform === 'darwin') {
    execFile('open', [filePath], callback);
    return;
  }
  execFile('xdg-open', [filePath], callback);
}

function createServer(projectDir, opts) {
  opts = opts || {};
  var currentProjectDir = projectDir ? path.resolve(projectDir) : '';
  return http.createServer(function(req, res) {
    var parsed = url.parse(req.url, true);
    var pathname = parsed.pathname || '/';
    try {
      if (req.method === 'GET' && pathname === '/api/project') {
        sendJson(res, 200, projectInfo(currentProjectDir));
        return;
      }
      if (req.method === 'POST' && pathname === '/api/projects/summary') {
        readRequestBody(req, function(body) {
          try {
            var payload = body ? JSON.parse(body) : {};
            var dirs = Array.isArray(payload.projectDirs) ? payload.projectDirs : [];
            var seen = {};
            var projects = dirs.filter(function(dir) {
              if (!dir) return false;
              var resolved = path.resolve(String(dir));
              if (seen[resolved]) return false;
              seen[resolved] = true;
              return true;
            }).map(function(dir) { return summarizeProject(dir, { refresh: !!payload.refresh }); });
            sendJson(res, 200, { projects: projects });
          } catch (e) {
            sendJson(res, 400, { error: e.message || String(e) });
          }
        });
        return;
      }
      if (req.method === 'POST' && pathname === '/api/project/browse') {
        try {
          var selectedPath = opts.browseProjectDir ? opts.browseProjectDir() : browseProjectDir();
          if (!selectedPath) {
            sendJson(res, 200, { cancelled: true, project: projectInfo(currentProjectDir) });
            return;
          }
          var selectedInfo = projectInfo(selectedPath);
          if (!selectedInfo.configured) {
            sendJson(res, 400, {
              error: 'Selected directory is not initialized. Run sdd init first.',
              project: selectedInfo
            });
            return;
          }
          currentProjectDir = selectedInfo.projectDir;
          projectIndexer.enqueueRefresh(currentProjectDir, false);
          sendJson(res, 200, selectedInfo);
        } catch (e) {
          sendJson(res, 500, { error: e.message || String(e) });
        }
        return;
      }
      if (req.method === 'POST' && pathname === '/api/project') {
        readRequestBody(req, function(body) {
          try {
            var payload = body ? JSON.parse(body) : {};
            var requested = payload.projectDir ? path.resolve(String(payload.projectDir)) : '';
            var info = projectInfo(requested);
            if (!requested || !info.configured) {
              sendJson(res, 400, {
                error: 'Project directory is not initialized. Run sdd init first.',
                project: info
              });
              return;
            }
            currentProjectDir = requested;
            projectIndexer.enqueueRefresh(currentProjectDir, false);
            sendJson(res, 200, info);
          } catch (e) {
            sendJson(res, 400, { error: e.message || String(e) });
          }
        });
        return;
      }
      if (req.method === 'GET' && pathname === '/api/specs') {
        var listProject = requireProject(currentProjectDir, res);
        if (!listProject) return;
        var snapshot = projectIndexer.getSnapshot(listProject.projectDir, { refresh: parsed.query.refresh === '1' });
        sendJson(res, 200, snapshot);
        return;
      }
      var detailMatch = pathname.match(/^\/api\/specs\/([^/]+)$/);
      if (req.method === 'GET' && detailMatch) {
        var detailProject = requireProject(currentProjectDir, res);
        if (!detailProject) return;
        var spec = specIndex.getSpec(detailProject.projectDir, detailMatch[1]);
        if (!spec) sendJson(res, 404, { error: 'Spec not found.' });
        else sendJson(res, 200, spec);
        return;
      }
      var validateMatch = pathname.match(/^\/api\/specs\/([^/]+)\/validate$/);
      if (req.method === 'POST' && validateMatch) {
        var validateProject = requireProject(currentProjectDir, res);
        if (!validateProject) return;
        sendJson(res, 200, specIndex.validateSpec(validateProject.projectDir, validateMatch[1]));
        return;
      }
      var artifactMatch = pathname.match(/^\/api\/specs\/([^/]+)\/artifact$/);
      if (req.method === 'GET' && artifactMatch) {
        var artifactProject = requireProject(currentProjectDir, res);
        if (!artifactProject) return;
        try {
          sendJson(res, 200, readArtifact(artifactProject.projectDir, artifactMatch[1], parsed.query.artifact || 'spec'));
        } catch (e) {
          sendJson(res, 400, { error: e.message || String(e) });
        }
        return;
      }
      var openMatch = pathname.match(/^\/api\/specs\/([^/]+)\/open$/);
      if (req.method === 'POST' && openMatch) {
        var openProject = requireProject(currentProjectDir, res);
        if (!openProject) return;
        readRequestBody(req, function(body) {
          try {
            var payload = body ? JSON.parse(body) : {};
            var target = resolveArtifactTarget(openProject.projectDir, openMatch[1], payload.artifact || 'spec');
            var opener = opts.openFile || openLocalPath;
            opener(target.path, function(err) {
              if (err) sendJson(res, 500, { error: err.message || String(err), target: target });
              else sendJson(res, 200, { opened: true, target: target });
            });
          } catch (e) {
            sendJson(res, 400, { error: e.message || String(e) });
          }
        });
        return;
      }
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed.' });
        return;
      }
      var filePath = staticPath(pathname);
      if (!filePath) {
        sendJson(res, 403, { error: 'Forbidden.' });
        return;
      }
      sendFile(res, filePath, contentTypeFor(filePath));
    } catch (e) {
      sendJson(res, 500, { error: e.message || String(e) });
    }
  });
}

function run(projectDir, opts) {
  opts = opts || {};
  var initialProject = projectDir ? path.resolve(projectDir) : '';
  if (initialProject && !fs.existsSync(common.getDocsRoot(initialProject))) {
    console.error('[WARN] Initial project is not initialized. Select a project in the console.');
    initialProject = '';
  }
  var port = parseInt(opts.port || '4789', 10);
  var host = opts.host || '127.0.0.1';
  var server = createServer(initialProject);
  server.listen(port, host, function() {
    console.log('[SDD Console] ' + (initialProject || 'no project selected'));
    console.log('URL: http://' + host + ':' + port);
    console.log('Press Ctrl+C to stop.');
  });
}

module.exports = run;
module.exports.createServer = createServer;
