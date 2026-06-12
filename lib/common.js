const fs = require('fs');
const path = require('path');
const SCAFFOLD_ROOT = path.resolve(__dirname, '..');

function getConfigFile(projectDir) {
  return path.join(projectDir, '.sdd-config');
}

function isValidDocsDirName(name) {
  return /^[A-Za-z0-9._-]+$/.test(name) && name !== '.' && name !== '..';
}

function getDocsDir(projectDir) {
  const configFile = getConfigFile(projectDir);
  let docsDir = 'mydocs';
  if (fs.existsSync(configFile)) {
    const content = fs.readFileSync(configFile, 'utf-8');
    const m = content.match(/^DOCS_DIR="?([^"\r\n]+)"?/m);
    if (m) {
      const configured = m[1].trim();
      if (configured && isValidDocsDirName(configured)) docsDir = configured;
    }
  }
  return docsDir;
}

function getDocsRoot(projectDir) {
  return path.join(projectDir, getDocsDir(projectDir));
}

function getMode(projectDir) {
  const configFile = getConfigFile(projectDir);
  if (fs.existsSync(configFile)) {
    const content = fs.readFileSync(configFile, 'utf-8');
    const m = content.match(/^MODE="?([^"\r\n]+)"?/m);
    if (m && (m[1] === 'lite' || m[1] === 'micro')) return m[1];
  }
  return 'standard';
}

function getSpecTemplate(projectDir, explicitMode) {
  let mode = explicitMode || getMode(projectDir);
  if (!['lite', 'micro'].includes(mode)) mode = 'standard';
  return path.join(SCAFFOLD_ROOT, 'templates', 'spec-' + mode + '.md');
}

function versionExists(dir, name, ver) {
  return fs.existsSync(path.join(dir, ver + '-' + name + '.md'));
}

function findLatestSpec(specsDir) {
  if (!fs.existsSync(specsDir)) return '';
  var files = fs.readdirSync(specsDir).filter(function(f) { return f.endsWith('.md') && f !== '.gitkeep'; });
  var taskMap = new Map();
  files.forEach(function(f) {
    var m = f.match(/^v(\d+)\.(\d+)-(.+)\.md$/);
    if (!m) return;
    var major = parseInt(m[1], 10), minor = parseInt(m[2], 10), taskName = m[3];
    var fullPath = path.join(specsDir, f);
    var mtime = 0;
    try { mtime = fs.statSync(fullPath).mtimeMs; } catch (e) {}
    var existing = taskMap.get(taskName);
    if (!existing || mtime > existing.maxMtime) {
      taskMap.set(taskName, { maxMtime: mtime, bestFile: fullPath, bestMajor: major, bestMinor: minor });
    } else if (mtime === existing.maxMtime &&
      (major > existing.bestMajor || (major === existing.bestMajor && minor > existing.bestMinor))) {
      existing.bestFile = fullPath; existing.bestMajor = major; existing.bestMinor = minor;
    }
  });
  var latestTask = '', latestMtime = 0;
  taskMap.forEach(function(info, tn) {
    if (info.maxMtime > latestMtime) { latestMtime = info.maxMtime; latestTask = tn; }
  });
  if (!latestTask) return '';
  var bestSpec = '', bestMajor = 0, bestMinor = -1;
  files.forEach(function(f) {
    var m = f.match(/^v(\d+)\.(\d+)-(.+)\.md$/);
    if (!m || m[3] !== latestTask) return;
    var major = parseInt(m[1], 10), minor = parseInt(m[2], 10);
    if (major > bestMajor || (major === bestMajor && minor > bestMinor)) {
      bestMajor = major; bestMinor = minor; bestSpec = path.join(specsDir, f);
    }
  });
  return bestSpec;
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
    var regex = new RegExp('^' + field + ':\s*');
    if (regex.test(line)) {
      return line.replace(regex, '').replace(/"/g, '').replace(/#.*$/, '').trim();
    }
  }
  return '';
}

function normalizeSlug(name) {
  var slug = name.replace(/ /g, '-');
  var m = slug.match(/^v\d+\.\d+-(.+)$/);
  return m ? m[1] : slug;
}

function shouldSuggestCodeMap(projectDir, docsDir) {
  docsDir = docsDir || 'mydocs';
  var codemapDir = path.join(projectDir, docsDir, 'codemap');
  if (fs.existsSync(codemapDir)) {
    var hasMd = fs.readdirSync(codemapDir).some(function(f) { return f.endsWith('.md') && f !== '.gitkeep'; });
    if (hasMd) return '';
  }
  var srcExts = ['.js','.ts','.jsx','.tsx','.py','.go','.java','.cs','.rb','.php','.rs','.cpp','.c'];
  var skipDirs = ['node_modules','.git','vendor','dist','build','target'];
  var srcCount = 0;
  function countFiles(dir, depth) {
    if (depth > 6) return;
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    entries.forEach(function(e) {
      if (e.isDirectory()) {
        if (skipDirs.indexOf(e.name) === -1 && !e.name.startsWith('.')) countFiles(path.join(dir, e.name), depth + 1);
      } else if (e.isFile() && srcExts.indexOf(path.extname(e.name)) !== -1) {
        srcCount++;
      }
    });
  }
  countFiles(projectDir, 0);
  if (srcCount <= 10) return '';
  var markers = ['package.json','go.mod','pyproject.toml','pom.xml','Cargo.toml','build.gradle','requirements.txt','manage.py','setup.py','setup.cfg','Gemfile','composer.json','Makefile','Dockerfile'];
  var hasMarker = markers.some(function(m) { return fs.existsSync(path.join(projectDir, m)); });
  if (!hasMarker) return '';
  return '\n[HINT] 检测到目标项目已存在 ' + srcCount + ' 个源码文件，且尚未建立 CodeMap。\n  建议先建立 CodeMap 再进入 Research，帮助 AI 快速理解模块结构：\n    sdd create-codemap ' + projectDir + ' [--module <name>]';
}

module.exports = {
  getConfigFile: getConfigFile,
  isValidDocsDirName: isValidDocsDirName,
  getDocsDir: getDocsDir,
  getDocsRoot: getDocsRoot,
  getMode: getMode,
  getSpecTemplate: getSpecTemplate,
  versionExists: versionExists,
  findLatestSpec: findLatestSpec,
  extractSection: extractSection,
  sectionIsEmpty: sectionIsEmpty,
  subsectionIsEmpty: subsectionIsEmpty,
  findSourceSpec: findSourceSpec,
  getFrontmatterField: getFrontmatterField,
  normalizeSlug: normalizeSlug,
  shouldSuggestCodeMap: shouldSuggestCodeMap,
  SCAFFOLD_ROOT: SCAFFOLD_ROOT
};
