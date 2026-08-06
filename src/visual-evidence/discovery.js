'use strict';

var fs = require('fs');
var path = require('path');

var MAX_DEPTH = 5;
var MAX_ENTRIES = 500;
var MAX_FILE_SIZE = 1024 * 1024;
var MAX_TEXT_BYTES = 64 * 1024;

var MATERIAL_KINDS = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.svg': 'image',
  '.pdf': 'document',
  '.md': 'text',
  '.txt': 'text'
};

function frontmatterValue(content, key) {
  var match = String(content || '').match(new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*"?([^"\\r\\n]*)"?\\s*$', 'm'));
  return match ? match[1].trim() : '';
}

function isInside(parentPath, childPath) {
  var relative = path.relative(parentPath, childPath);
  return relative === '' || (relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function isRealpathInside(parentPath, childPath) {
  try { return isInside(fs.realpathSync(parentPath), fs.realpathSync(childPath)); }
  catch (error) { return false; }
}

function relativePath(contextPath, entryPath) {
  return path.relative(contextPath, entryPath).split(path.sep).join('/');
}

function materialKind(filePath) {
  return MATERIAL_KINDS[path.extname(filePath).toLowerCase()] || '';
}

function scenarioHints(relative) {
  var name = path.basename(relative, path.extname(relative)).toLowerCase();
  return ['desktop', 'mobile', 'empty', 'error'].filter(function(hint) {
    return new RegExp('(?:^|[-_.\\s])' + hint + '(?:$|[-_.\\s])').test(name);
  });
}

function extractUrls(filePath) {
  var fileDescriptor = fs.openSync(filePath, 'r');
  var content;
  try {
    var buffer = Buffer.alloc(MAX_TEXT_BYTES);
    var bytesRead = fs.readSync(fileDescriptor, buffer, 0, MAX_TEXT_BYTES, 0);
    content = buffer.toString('utf8', 0, bytesRead);
  } finally {
    fs.closeSync(fileDescriptor);
  }
  var urls = [];
  var match;
  var expression = /https?:\/\/[^\s<>"'`]+/g;
  while ((match = expression.exec(content))) {
    var reference = match[0].replace(/[.,;:!?)}\]]+$/, '');
    if (reference && urls.indexOf(reference) === -1) urls.push(reference);
  }
  return urls.sort();
}

function discover(specPath, projectDir) {
  var empty = { materials: [], candidates: [], gaps: [], questions: [], diagnostics: [] };
  var specContent;
  try { specContent = fs.readFileSync(specPath, 'utf-8'); }
  catch (error) {
    empty.diagnostics.push({ code: 'VISUAL_CONTEXT_SPEC_UNREADABLE' });
    return empty;
  }

  var contextRef = frontmatterValue(specContent, 'context-source');
  if (!contextRef) {
    empty.diagnostics.push({ code: 'VISUAL_CONTEXT_PATH_MISSING' });
    return empty;
  }

  var projectPath;
  var contextPath = path.resolve(projectDir, contextRef);
  try { projectPath = fs.realpathSync(projectDir); }
  catch (error) {
    empty.diagnostics.push({ code: 'VISUAL_CONTEXT_PROJECT_UNREADABLE' });
    return empty;
  }
  if (!isInside(projectPath, contextPath) || !fs.existsSync(contextPath)) {
    empty.diagnostics.push({ code: 'VISUAL_CONTEXT_PATH_OUTSIDE_PROJECT' });
    return empty;
  }

  var contextRealPath;
  try { contextRealPath = fs.realpathSync(contextPath); }
  catch (error) {
    empty.diagnostics.push({ code: 'VISUAL_CONTEXT_PATH_UNREADABLE' });
    return empty;
  }
  if (!isInside(projectPath, contextRealPath)) {
    empty.diagnostics.push({ code: 'VISUAL_CONTEXT_PATH_OUTSIDE_PROJECT' });
    return empty;
  }

  var result = { materials: [], candidates: [], gaps: [], questions: [], diagnostics: [] };
  var remainingEntries = MAX_ENTRIES;
  var visibleEntries = 0;
  var stopped = false;
  var limitExceeded = false;

  function addDiagnostic(code, entryPath) {
    var diagnostic = { code: code };
    if (entryPath) diagnostic.path = relativePath(contextPath, entryPath);
    result.diagnostics.push(diagnostic);
  }

  function visit(directoryPath, depth) {
    if (stopped) return;
    if (!isRealpathInside(contextRealPath, directoryPath)) {
      addDiagnostic('VISUAL_CONTEXT_PATH_OUTSIDE_CONTEXT', directoryPath);
      return;
    }
    var directory;
    try { directory = fs.opendirSync(directoryPath); }
    catch (error) { addDiagnostic('VISUAL_CONTEXT_DIRECTORY_UNREADABLE', directoryPath); return; }

    try {
      var entry;
      while (!stopped && (entry = directory.readSync())) {
        if (remainingEntries === 0) {
          addDiagnostic('VISUAL_CONTEXT_ENTRY_LIMIT');
          limitExceeded = true;
          stopped = true;
          break;
        }
        remainingEntries -= 1;
        visibleEntries += 1;

        var entryPath = path.join(directoryPath, entry.name);
        if (entry.isSymbolicLink()) {
          var linkedPath;
          try { linkedPath = fs.realpathSync(entryPath); }
          catch (error) { addDiagnostic('VISUAL_CONTEXT_SYMLINK_UNREADABLE', entryPath); continue; }
          if (!isInside(contextRealPath, linkedPath)) addDiagnostic('VISUAL_CONTEXT_SYMLINK_OUTSIDE_CONTEXT', entryPath);
          else addDiagnostic('VISUAL_CONTEXT_SYMLINK_UNSUPPORTED', entryPath);
          continue;
        }

        if (entry.isDirectory()) {
          if (depth + 1 > MAX_DEPTH) {
            addDiagnostic('VISUAL_CONTEXT_DEPTH_LIMIT', entryPath);
            continue;
          }
          visit(entryPath, depth + 1);
          continue;
        }
        if (!entry.isFile()) continue;
        if (!isRealpathInside(contextRealPath, entryPath)) {
          addDiagnostic('VISUAL_CONTEXT_PATH_OUTSIDE_CONTEXT', entryPath);
          continue;
        }

        var stat;
        try { stat = fs.statSync(entryPath); }
        catch (error) { addDiagnostic('VISUAL_CONTEXT_FILE_UNREADABLE', entryPath); continue; }
        if (stat.size > MAX_FILE_SIZE) {
          addDiagnostic('VISUAL_CONTEXT_FILE_SIZE_LIMIT', entryPath);
          continue;
        }

        var relative = relativePath(contextPath, entryPath);
        var kind = materialKind(entryPath);
        if (!kind) {
          result.questions.push({
            code: 'VISUAL_CONTEXT_MATERIAL_UNCLASSIFIED',
            materialPath: relative,
            prompt: '该材料的用途是什么？'
          });
          continue;
        }

        result.materials.push({ path: relative, kind: kind });
        scenarioHints(relative).forEach(function(hint) {
          result.candidates.push({ kind: 'scenario-hint', materialPath: relative, confidence: 'low', hint: hint });
        });
        if (kind === 'text') {
          try {
            extractUrls(entryPath).forEach(function(reference) {
              result.candidates.push({ kind: 'reference', materialPath: relative, confidence: 'low', reference: reference });
            });
          } catch (error) {
            addDiagnostic('VISUAL_CONTEXT_TEXT_UNREADABLE', entryPath);
          }
        }
      }
    } finally {
      directory.closeSync();
    }
  }

  visit(contextPath, 0);
  if (limitExceeded) {
    return {
      materials: [],
      candidates: [],
      gaps: [],
      questions: [],
      diagnostics: [{ code: 'VISUAL_CONTEXT_ENTRY_LIMIT' }]
    };
  }
  result.materials.sort(function(a, b) { return a.path.localeCompare(b.path); });
  result.candidates.sort(function(a, b) {
    var pathOrder = a.materialPath.localeCompare(b.materialPath);
    if (pathOrder) return pathOrder;
    var kindOrder = a.kind === b.kind ? 0 : (a.kind === 'scenario-hint' ? -1 : 1);
    if (kindOrder) return kindOrder;
    return String(a.hint || a.reference).localeCompare(String(b.hint || b.reference));
  });
  result.questions.sort(function(a, b) { return String(a.materialPath || '').localeCompare(String(b.materialPath || '')); });
  result.diagnostics.sort(function(a, b) {
    var pathOrder = String(a.path || '').localeCompare(String(b.path || ''));
    return pathOrder || a.code.localeCompare(b.code);
  });
  if (visibleEntries === 0) {
    result.gaps.push({ code: 'VISUAL_CONTEXT_EMPTY' });
    result.questions.push({ code: 'VISUAL_CONTEXT_MATERIALS_NEEDED', prompt: '请补充设计图、参考截图或文字视觉说明。' });
  } else if (result.materials.length) {
    result.gaps.push({ code: 'VISUAL_CONTEXT_MAPPING_REQUIRED' });
  }
  return result;
}

module.exports = {
  discover: discover,
  _private: {
    MAX_DEPTH: MAX_DEPTH,
    MAX_ENTRIES: MAX_ENTRIES,
    MAX_FILE_SIZE: MAX_FILE_SIZE,
    MAX_TEXT_BYTES: MAX_TEXT_BYTES,
    isInside: isInside,
    isRealpathInside: isRealpathInside,
    materialKind: materialKind,
    scenarioHints: scenarioHints
  }
};
