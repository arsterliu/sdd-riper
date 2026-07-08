const fs = require('fs');
const path = require('path');
const SCAFFOLD_ROOT = path.resolve(__dirname, '..');

function getConfigFile(projectDir) {
  return path.join(projectDir, '.sdd-config');
}

function readConfigValue(projectDir, key) {
  const configFile = getConfigFile(projectDir);
  if (!fs.existsSync(configFile)) return '';
  const content = fs.readFileSync(configFile, 'utf-8');
  const re = new RegExp('^' + key + '="?([^"\\r\\n]+)"?', 'gm');
  let match;
  let value = '';
  while ((match = re.exec(content)) !== null) {
    value = match[1].trim();
  }
  return value;
}

function isValidDocsDirName(name) {
  return /^[A-Za-z0-9._-]+$/.test(name) && name !== '.' && name !== '..';
}

function getDocsDir(projectDir) {
  let docsDir = 'mydocs';
  const configured = readConfigValue(projectDir, 'DOCS_DIR');
  if (configured && isValidDocsDirName(configured)) docsDir = configured;
  return docsDir;
}

function getDocsRoot(projectDir) {
  return path.join(projectDir, getDocsDir(projectDir));
}

function getMode(projectDir) {
  return 'micro';
}

function getApprovalPolicy(projectDir) {
  var value = readConfigValue(projectDir, 'APPROVAL_POLICY');
  if (value === 'agent' || value === 'human') return value;
  return 'agent';
}

function getCruiseEnabled(projectDir) {
  var value = readConfigValue(projectDir, 'CRUISE_ENABLED').toLowerCase();
  if (value === 'true' || value === '1' || value === 'yes' || value === 'on') return true;
  if (value === 'false' || value === '0' || value === 'no' || value === 'off') return false;
  return true;
}

function getCruiseMaxIterations(projectDir) {
  var raw = readConfigValue(projectDir, 'CRUISE_MAX_ITERATIONS');
  var value = parseInt(raw, 10);
  return value > 0 ? value : 5;
}

function getSpecTemplate(projectDir, explicitMode) {
  let mode = explicitMode || getMode(projectDir);
  if (!['standard', 'lite', 'micro'].includes(mode)) mode = 'micro';
  return path.join(SCAFFOLD_ROOT, 'templates', 'spec-' + mode + '.md');
}

function isValidSpecVersion(version) {
  return /^v\d+\.\d+(?:\.\d+)?$/.test(version || '');
}

function parseSpecFileName(fileName) {
  var m = String(fileName || '').match(/^v(\d+)\.(\d+)(?:\.(\d+))?-(.+)\.md$/);
  if (!m) return null;
  return {
    version: 'v' + m[1] + '.' + m[2] + (m[3] ? '.' + m[3] : ''),
    slug: m[4],
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: m[3] ? parseInt(m[3], 10) : 0
  };
}

function parseSpecRef(name) {
  var ref = path.basename(String(name || '').replace(/\\/g, '/')).replace(/ /g, '-');
  var m = ref.match(/^v(\d+)\.(\d+)(?:\.(\d+))?-(.+?)(?:\.md)?$/);
  if (!m) return null;
  return {
    version: 'v' + m[1] + '.' + m[2] + (m[3] ? '.' + m[3] : ''),
    slug: m[4],
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: m[3] ? parseInt(m[3], 10) : 0
  };
}

function versionExists(dir, name, ver) {
  return fs.existsSync(path.join(dir, ver + '-' + name + '.md'));
}

// Selects the default "active" spec. Deterministic and not led by file mtime
// (which git checkout/clone/touch resets): filter out archived specs, return a
// single non-archived spec directly, otherwise order by frontmatter date, then
// version, with mtime only as the last tie-break. Falls back to the full set
// when nothing is non-archived. Signature and return semantics are unchanged.
function findLatestSpec(specsDir) {
  if (!fs.existsSync(specsDir)) return '';
  var files = fs.readdirSync(specsDir).filter(function(f) { return f.endsWith('.md') && f !== '.gitkeep'; });
  var candidates = [];
  files.forEach(function(f) {
    var parsed = parseSpecFileName(f);
    if (!parsed) return;
    var fullPath = path.join(specsDir, f);
    var mtime = 0;
    try { mtime = fs.statSync(fullPath).mtimeMs; } catch (e) {}
    candidates.push({
      path: fullPath,
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch,
      status: getFrontmatterField(fullPath, 'status') || '',
      date: getFrontmatterField(fullPath, 'date') || '',
      mtime: mtime
    });
  });
  if (!candidates.length) return '';
  var active = candidates.filter(function(c) { return c.status !== 'archived'; });
  var pool = active.length ? active : candidates;
  if (pool.length === 1) return pool[0].path;
  pool.sort(function(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1; // newer date first; empty date sorts last
    if (a.major !== b.major) return b.major - a.major;
    if (a.minor !== b.minor) return b.minor - a.minor;
    if (a.patch !== b.patch) return b.patch - a.patch;
    return b.mtime - a.mtime;
  });
  return pool[0].path;
}

function extractSection(filePath, pattern, maxLines) {
  if (!fs.existsSync(filePath)) return '';
  maxLines = maxLines || 200;
  var content = fs.readFileSync(filePath, 'utf-8');
  var lines = content.split(/\r?\n/);
  var found = false, count = 0;
  var result = [];
  var regex = new RegExp('^## .*' + pattern);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^## /.test(line)) {
      if (found) break;
      if (regex.test(line)) { found = true; }
      continue;
    }
    if (found) {
      if (maxLines > 0 && count >= maxLines) { result.push('[TRUNCATED]'); break; }
      result.push(line);
      count++;
    }
  }
  return result.join('\n');
}

function sectionIsEmpty(filePath, sectionPattern) {
  if (!fs.existsSync(filePath)) return true;
  var content = fs.readFileSync(filePath, 'utf-8');
  var lines = content.split(/\r?\n/);
  var inSection = false, hasContent = false, inComment = false;
  var headingRegex = new RegExp(sectionPattern);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^##[^#]/.test(line)) {
      if (inSection) return !hasContent;
      if (headingRegex.test(line)) { inSection = true; hasContent = false; inComment = false; }
      continue;
    }
    if (!inSection) continue;
    if (/<!--/.test(line)) inComment = true;
    if (/-->/.test(line)) { inComment = false; continue; }
    if (!inComment && line.trim() && !/^<!--/.test(line)) hasContent = true;
  }
  return inSection ? !hasContent : true;
}

function subsectionIsEmpty(filePath, sectionPattern) {
  if (!fs.existsSync(filePath)) return true;
  var content = fs.readFileSync(filePath, 'utf-8');
  var lines = content.split(/\r?\n/);
  var inSection = false, hasContent = false, inComment = false;
  var headingRegex = new RegExp(sectionPattern);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^###/.test(line)) {
      if (inSection) return !hasContent;
      if (headingRegex.test(line)) { inSection = true; hasContent = false; inComment = false; }
      continue;
    }
    if (/^##[^#]/.test(line)) { if (inSection) return !hasContent; continue; }
    if (!inSection) continue;
    if (/<!--/.test(line)) inComment = true;
    if (/-->/.test(line)) { inComment = false; continue; }
    if (!inComment && line.trim() && !/^<!--/.test(line)) hasContent = true;
  }
  return inSection ? !hasContent : true;
}

function completionVerificationStatus(executeLogContent) {
  var lines = String(executeLogContent || '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  var inCompletion = false;
  var status = '';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (/^Step:\s*/i.test(line)) {
      inCompletion = /^Step:\s*completion-verification\s*$/i.test(line);
      continue;
    }
    if (!inCompletion) continue;
    var m = line.match(/^Status:\s*([A-Z_]+)/i);
    if (m) {
      status = m[1].toUpperCase();
      inCompletion = false;
      continue;
    }
    if (/^---$/.test(line) && i > 0) continue;
  }
  return status;
}

function completionVerificationDone(executeLogContent) {
  return completionVerificationStatus(executeLogContent) === 'DONE';
}

function extractLastStepTimestamp(executeLogContent) {
  var latest = null;
  String(executeLogContent || '').split(/\r?\n/).forEach(function(line) {
    var m = line.match(/^\s*Timestamp:\s*(.+)$/i);
    if (!m) return;
    var raw = m[1].trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return;
    var t = new Date(raw);
    if (!Number.isNaN(t.getTime()) && (!latest || t > latest)) {
      latest = t;
    }
  });
  return latest;
}

function findSourceSpec(dir, slug, archivedOnly) {
  if (!fs.existsSync(dir)) return '';
  var files = fs.readdirSync(dir).filter(function(f) { return f.endsWith('.md') && f !== '.gitkeep'; });
  var bestFile = '', bestMajor = 0, bestMinor = -1, bestPatch = -1;
  files.forEach(function(f) {
    var parsed = parseSpecFileName(f);
    if (!parsed || parsed.slug !== slug) return;
    if (archivedOnly) {
      var status = getFrontmatterField(path.join(dir, f), 'status');
      if (status !== 'archived') return;
    }
    if (parsed.major > bestMajor ||
        (parsed.major === bestMajor && parsed.minor > bestMinor) ||
        (parsed.major === bestMajor && parsed.minor === bestMinor && parsed.patch > bestPatch)) {
      bestMajor = parsed.major;
      bestMinor = parsed.minor;
      bestPatch = parsed.patch;
      bestFile = path.join(dir, f);
    }
  });
  return bestFile;
}

function findSourceSpecByRef(dir, specRef, archivedOnly) {
  var parsed = parseSpecRef(specRef);
  if (!parsed) return findSourceSpec(dir, normalizeSlug(specRef), archivedOnly);
  var fullPath = path.join(dir, parsed.version + '-' + parsed.slug + '.md');
  if (!fs.existsSync(fullPath)) return '';
  if (archivedOnly) {
    var status = getFrontmatterField(fullPath, 'status');
    if (status !== 'archived') return '';
  }
  return fullPath;
}

function getFrontmatterField(filePath, field) {
  if (!fs.existsSync(filePath)) return '';
  var content = fs.readFileSync(filePath, 'utf-8');
  var lines = content.split(/\r?\n/);
  var inFront = false, started = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === '---') {
      if (!started) { started = true; inFront = true; continue; }
      else if (inFront) break;
    }
    if (!inFront) continue;
    var regex = new RegExp('^' + field + ':\\s*');
    if (regex.test(line)) {
      return line.replace(regex, '').replace(/"/g, '').replace(/#.*$/, '').trim();
    }
  }
  return '';
}

function resolveProjectPath(projectDir, maybeRelative) {
  if (!maybeRelative) return '';
  if (path.isAbsolute(maybeRelative)) return maybeRelative;
  return path.join(projectDir, maybeRelative);
}

function relativeToProject(projectDir, targetPath) {
  if (!targetPath) return '';
  return path.relative(projectDir, targetPath).replace(/\\/g, '/');
}

function normalizeSlug(name) {
  var slug = name.replace(/ /g, '-');
  var m = slug.match(/^v\d+\.\d+(?:\.\d+)?-(.+)$/);
  return m ? m[1] : slug;
}

module.exports = {
  getConfigFile: getConfigFile,
  readConfigValue: readConfigValue,
  isValidDocsDirName: isValidDocsDirName,
  getDocsDir: getDocsDir,
  getDocsRoot: getDocsRoot,
  getMode: getMode,
  getApprovalPolicy: getApprovalPolicy,
  getCruiseEnabled: getCruiseEnabled,
  getCruiseMaxIterations: getCruiseMaxIterations,
  getSpecTemplate: getSpecTemplate,
  isValidSpecVersion: isValidSpecVersion,
  parseSpecFileName: parseSpecFileName,
  parseSpecRef: parseSpecRef,
  versionExists: versionExists,
  findLatestSpec: findLatestSpec,
  extractSection: extractSection,
  sectionIsEmpty: sectionIsEmpty,
  subsectionIsEmpty: subsectionIsEmpty,
  completionVerificationStatus: completionVerificationStatus,
  completionVerificationDone: completionVerificationDone,
  extractLastStepTimestamp: extractLastStepTimestamp,
  findSourceSpec: findSourceSpec,
  findSourceSpecByRef: findSourceSpecByRef,
  getFrontmatterField: getFrontmatterField,
  resolveProjectPath: resolveProjectPath,
  relativeToProject: relativeToProject,
  normalizeSlug: normalizeSlug,
  SCAFFOLD_ROOT: SCAFFOLD_ROOT
};
