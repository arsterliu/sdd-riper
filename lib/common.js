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
  const m = content.match(new RegExp('^' + key + '="?([^"\\r\\n]+)"?', 'm'));
  return m ? m[1].trim() : '';
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
  const mode = readConfigValue(projectDir, 'MODE');
  if (mode === 'lite' || mode === 'micro') return mode;
  return 'standard';
}

function getGatePolicy(projectDir) {
  var value = readConfigValue(projectDir, 'GATE_POLICY');
  return ['manual', 'auto', 'advisory'].indexOf(value) !== -1 ? value : 'auto';
}

function getCruisePolicy(projectDir) {
  var value = readConfigValue(projectDir, 'CRUISE_POLICY');
  return ['off', 'assisted', 'autonomous'].indexOf(value) !== -1 ? value : 'autonomous';
}

function getCruiseMaxIterations(projectDir) {
  var raw = readConfigValue(projectDir, 'CRUISE_MAX_ITERATIONS');
  var value = parseInt(raw, 10);
  return value > 0 ? value : 5;
}

function getSpecTemplate(projectDir, explicitMode) {
  let mode = explicitMode || getMode(projectDir);
  if (!['lite', 'micro'].includes(mode)) mode = 'standard';
  return path.join(SCAFFOLD_ROOT, 'templates', 'spec-' + mode + '.md');
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
    var m = f.match(/^v(\d+)\.(\d+)-(.+)\.md$/);
    if (!m) return;
    var fullPath = path.join(specsDir, f);
    var mtime = 0;
    try { mtime = fs.statSync(fullPath).mtimeMs; } catch (e) {}
    candidates.push({
      path: fullPath,
      major: parseInt(m[1], 10),
      minor: parseInt(m[2], 10),
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

function findSourceSpec(dir, slug, archivedOnly) {
  if (!fs.existsSync(dir)) return '';
  var files = fs.readdirSync(dir).filter(function(f) { return f.endsWith('.md') && f !== '.gitkeep'; });
  var bestFile = '', bestMajor = 0, bestMinor = -1;
  files.forEach(function(f) {
    var m = f.match(/^v(\d+)\.(\d+)-(.+)\.md$/);
    if (!m || m[3] !== slug) return;
    var major = parseInt(m[1], 10), minor = parseInt(m[2], 10);
    if (archivedOnly) {
      var status = getFrontmatterField(path.join(dir, f), 'status');
      if (status !== 'archived') return;
    }
    if (major > bestMajor || (major === bestMajor && minor > bestMinor)) {
      bestMajor = major; bestMinor = minor; bestFile = path.join(dir, f);
    }
  });
  return bestFile;
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
  var m = slug.match(/^v\d+\.\d+-(.+)$/);
  return m ? m[1] : slug;
}

module.exports = {
  getConfigFile: getConfigFile,
  readConfigValue: readConfigValue,
  isValidDocsDirName: isValidDocsDirName,
  getDocsDir: getDocsDir,
  getDocsRoot: getDocsRoot,
  getMode: getMode,
  getGatePolicy: getGatePolicy,
  getCruisePolicy: getCruisePolicy,
  getCruiseMaxIterations: getCruiseMaxIterations,
  getSpecTemplate: getSpecTemplate,
  versionExists: versionExists,
  findLatestSpec: findLatestSpec,
  extractSection: extractSection,
  sectionIsEmpty: sectionIsEmpty,
  subsectionIsEmpty: subsectionIsEmpty,
  findSourceSpec: findSourceSpec,
  getFrontmatterField: getFrontmatterField,
  resolveProjectPath: resolveProjectPath,
  relativeToProject: relativeToProject,
  normalizeSlug: normalizeSlug,
  SCAFFOLD_ROOT: SCAFFOLD_ROOT
};
