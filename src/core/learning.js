var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

var REQUIRED_LABELS = [
  'Source Spec',
  'Trigger',
  'Observed Problem',
  'Root Cause',
  'Decision Rule',
  'Applies When',
  'Recommended Action',
  'Evidence'
];

function stripHtmlComments(text) {
  return String(text || '').replace(/<!--[\s\S]*?-->/g, '');
}

function firstRealLine(text) {
  return stripHtmlComments(text).split(/\r?\n/).map(function(line) {
    return line.trim();
  }).find(function(line) {
    return line &&
      !line.startsWith('|') &&
      !/^#+\s/.test(line) &&
      !/^[A-Za-z][A-Za-z0-9 /_-]*:\s*$/.test(line) &&
      !/^[-:]+$/.test(line);
  }) || '';
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelHasContent(section, label) {
  var lines = stripHtmlComments(section).split(/\r?\n/);
  var labelRegex = new RegExp('^' + escapeRegExp(label) + ':[ \\t]*(.*)$', 'i');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var m = line.match(labelRegex);
    if (!m) continue;
    if (m[1] && m[1].trim()) return true;
    for (var j = i + 1; j < lines.length; j++) {
      var next = lines[j].trim();
      if (!next || next.startsWith('<!--') || next.startsWith('|') || /^#+\s/.test(next)) continue;
      if (/^[A-Za-z][A-Za-z0-9 /_-]*:[ \t]*/.test(next)) break;
      return true;
    }
    continue;
  }
  return false;
}

function executionStatuses(executeLog) {
  var statuses = [];
  var seen = {};
  String(executeLog || '').replace(/^Status:[ \t]*([A-Z_]+)/gmi, function(_, status) {
    var normalized = status.toUpperCase();
    if (!seen[normalized]) {
      seen[normalized] = true;
      statuses.push(normalized);
    }
    return _;
  });
  return statuses;
}

function learningTriggers(specContent, executeLog, reviewLine) {
  var triggers = [];
  executionStatuses(executeLog).forEach(function(status) {
    if (/^(BUGFIX|BUGFIX_ESCALATED|DEVIATED_MINOR|DEVIATED_MAJOR)$/.test(status)) {
      triggers.push(status + ' in Execute Log');
    }
  });
  if (/\bPASS_WITH_CONCERNS\b/i.test(reviewLine || '')) {
    triggers.push('PASS_WITH_CONCERNS review verdict');
  }
  var reopened = String(specContent || '').match(/^reopened-from:[ \t]*"?([^"\r\n#]+)"?/m);
  if ((reopened && reopened[1].trim()) || /Reopened from archived context/i.test(specContent || '')) {
    triggers.push('reopened archived work');
  }
  return triggers;
}

function learningArtifact(projectDir, specPath) {
  var ref = common.getFrontmatterField(specPath, 'learning-file');
  var artifactPath = ref ? common.resolveProjectPath(projectDir, ref) : '';
  var exists = !!artifactPath && fs.existsSync(artifactPath);
  return {
    ref: ref,
    path: artifactPath,
    relativePath: artifactPath ? common.relativeToProject(projectDir, artifactPath) : '',
    exists: exists,
    content: exists ? common.extractSection(artifactPath, 'Learning Record', 500) : ''
  };
}

function validateLearningContent(content) {
  if (!firstRealLine(content)) {
    return ['Learning Record is empty.'];
  }
  var missing = REQUIRED_LABELS.filter(function(label) {
    return !labelHasContent(content, label);
  });
  if (missing.length) {
    return ['Learning Record missing required fields: ' + missing.join(', ') + '.'];
  }
  return [];
}

function listLearningFiles(projectDir, limit) {
  var docsRoot = common.getDocsRoot(projectDir);
  var dirs = [path.join(docsRoot, 'learnings'), path.join(docsRoot, 'archive')];
  var files = [];
  dirs.forEach(function(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function(file) {
      if (!/\.learning\.md$/.test(file)) return;
      var filePath = path.join(dir, file);
      try {
        files.push({ path: filePath, mtimeMs: fs.statSync(filePath).mtimeMs });
      } catch (e) {}
    });
  });
  files.sort(function(a, b) { return b.mtimeMs - a.mtimeMs; });
  return files.slice(0, limit || 5).map(function(item) { return item.path; });
}

module.exports = {
  REQUIRED_LABELS: REQUIRED_LABELS,
  firstRealLine: firstRealLine,
  labelHasContent: labelHasContent,
  learningTriggers: learningTriggers,
  learningArtifact: learningArtifact,
  validateLearningContent: validateLearningContent,
  listLearningFiles: listLearningFiles
};
