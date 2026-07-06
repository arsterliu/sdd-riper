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
      !/^[A-Za-z][A-Za-z0-9 /&_-]*:\s*$/.test(line) &&
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
      if (/^[A-Za-z][A-Za-z0-9 /&_-]*:[ \t]*/.test(next)) break;
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

function learningTriggers(specContent, executeLog, challengeVerdict) {
  var triggers = [];
  executionStatuses(executeLog).forEach(function(status) {
    if (/^(BUGFIX|BUGFIX_ESCALATED|DEVIATED_MINOR|DEVIATED_MAJOR)$/.test(status)) {
      triggers.push(status + ' in Execute Log');
    }
  });
  if (/\bPASS_WITH_CONCERNS\b/i.test(challengeVerdict || '')) {
    triggers.push('PASS_WITH_CONCERNS challenge verdict');
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

function collectLearningFiles(projectDir) {
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
  return files;
}

function listLearningFiles(projectDir, limit) {
  var files = collectLearningFiles(projectDir);
  files.sort(function(a, b) { return b.mtimeMs - a.mtimeMs; });
  return files.slice(0, limit || 5).map(function(item) { return item.path; });
}

// Lightweight, deterministic, dependency-free tokenizer for lexical recall.
// English/number words (>2 chars, non-stopword) stay word-level; CJK runs are
// emitted as character bigrams so Chinese text overlaps without a segmenter.
var STOPWORDS = {
  the: 1, and: 1, for: 1, are: 1, was: 1, with: 1, that: 1, this: 1, from: 1,
  has: 1, have: 1, not: 1, but: 1, you: 1, your: 1, all: 1, any: 1, can: 1,
  其中: 1, 并且: 1, 因为: 1, 所以: 1, 以及: 1, 这个: 1, 那个: 1, 不会: 1
};
function tokenize(text) {
  var s = String(text || '').toLowerCase();
  var tokens = [];
  (s.match(/[a-z0-9]+/g) || []).forEach(function(w) {
    if (w.length > 2 && !STOPWORDS[w]) tokens.push(w);
  });
  (s.match(/[一-龥]+/g) || []).forEach(function(run) {
    if (run.length === 1) { tokens.push(run); return; }
    for (var i = 0; i < run.length - 1; i++) {
      var bg = run.slice(i, i + 2);
      if (!STOPWORDS[bg]) tokens.push(bg);
    }
  });
  return tokens;
}

function overlapCount(querySet, tokens) {
  var seen = {}, count = 0;
  tokens.forEach(function(t) {
    if (!seen[t] && querySet[t]) { seen[t] = 1; count++; }
  });
  return count;
}

function labelText(section, label) {
  var lines = stripHtmlComments(section).split(/\r?\n/);
  var re = new RegExp('^' + escapeRegExp(label) + ':[ \\t]*(.*)$', 'i');
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].trim().match(re);
    if (!m) continue;
    var parts = [];
    if (m[1] && m[1].trim()) parts.push(m[1].trim());
    for (var j = i + 1; j < lines.length; j++) {
      var nx = lines[j].trim();
      if (!nx || /^#+\s/.test(nx) || nx.indexOf('<!--') === 0) continue;
      if (/^[A-Za-z][A-Za-z0-9 /&_-]*:[ \t]*/.test(nx)) break;
      parts.push(nx);
    }
    return parts.join(' ');
  }
  return '';
}

function learningMeta(filePath) {
  var content = common.extractSection(filePath, 'Learning Record', 500) || '';
  return {
    path: filePath,
    taskName: common.getFrontmatterField(filePath, 'task-name') || path.basename(filePath),
    appliesWhen: labelText(content, 'Applies When'),
    decisionRule: labelText(content, 'Decision Rule'),
    observedProblem: labelText(content, 'Observed Problem'),
    trigger: labelText(content, 'Trigger')
  };
}

// Relevance-ranked recall: score each learning's match surface
// (Applies When weighted x2, plus Decision Rule / Observed Problem / title)
// against the query by token overlap. When no learning shares any token with
// the query, fall back to mtime recency so behavior never regresses below the
// old listLearningFiles. Returns absolute paths, most relevant first.
function recallLearnings(projectDir, queryText, limit) {
  var files = collectLearningFiles(projectDir);
  if (!files.length) return [];
  var qTokens = tokenize(queryText);
  var querySet = {};
  qTokens.forEach(function(t) { querySet[t] = 1; });
  var scored = files.map(function(f) {
    var meta = learningMeta(f.path);
    var score = 0;
    if (qTokens.length) {
      score = overlapCount(querySet, tokenize(meta.appliesWhen)) * 2
        + overlapCount(querySet, tokenize([meta.decisionRule, meta.observedProblem, meta.taskName].join(' ')));
    }
    return { path: f.path, mtimeMs: f.mtimeMs, score: score };
  });
  var maxScore = scored.reduce(function(m, s) { return s.score > m ? s.score : m; }, 0);
  if (maxScore > 0) {
    scored.sort(function(a, b) { return b.score !== a.score ? b.score - a.score : b.mtimeMs - a.mtimeMs; });
  } else {
    scored.sort(function(a, b) { return b.mtimeMs - a.mtimeMs; });
  }
  return scored.slice(0, limit || 5).map(function(item) { return item.path; });
}

// Project-level aggregation: structured metadata for every learning, newest
// first. Backs `sdd learnings` (no --for) as a browsable knowledge base.
function buildLearningIndex(projectDir) {
  var files = collectLearningFiles(projectDir);
  files.sort(function(a, b) { return b.mtimeMs - a.mtimeMs; });
  return files.map(function(f) {
    var meta = learningMeta(f.path);
    meta.relativePath = common.relativeToProject(projectDir, f.path);
    return meta;
  });
}

module.exports = {
  REQUIRED_LABELS: REQUIRED_LABELS,
  firstRealLine: firstRealLine,
  labelHasContent: labelHasContent,
  learningTriggers: learningTriggers,
  learningArtifact: learningArtifact,
  validateLearningContent: validateLearningContent,
  listLearningFiles: listLearningFiles,
  tokenize: tokenize,
  recallLearnings: recallLearnings,
  buildLearningIndex: buildLearningIndex
};
