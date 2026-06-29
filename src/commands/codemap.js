// On-demand source-code scanner for CodeMap.
// Outputs a computed architecture view to stdout — no file is persisted.
// Deterministic, regex-based heuristics (no AST).

var fs = require('fs');
var path = require('path');

var SRC_EXTS = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.java', '.cs', '.rb', '.php', '.rs', '.cpp', '.c'];
var SKIP_DIRS = ['node_modules', '.git', 'vendor', 'dist', 'build', 'target', 'test', 'tests', '__tests__', 'spec'];

function isSrcFile(name) {
  return SRC_EXTS.indexOf(path.extname(name)) !== -1;
}

function isSkipDir(name) {
  return SKIP_DIRS.indexOf(name) !== -1 || name.startsWith('.');
}

// Collect all source files under projectDir (depth-limited)
function collectSrcFiles(projectDir, maxDepth) {
  maxDepth = maxDepth || 8;
  var files = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    entries.forEach(function(e) {
      var full = path.join(dir, e.name);
      if (e.isDirectory() && !isSkipDir(e.name)) walk(full, depth + 1);
      else if (e.isFile() && isSrcFile(e.name)) files.push(full);
    });
  }
  walk(projectDir, 0);
  return files;
}

// Extract CLI command names from a commander-based bin file
function extractCliCommands(binContent) {
  var cmds = [];
  // Match .command('name') or .command('name <arg>') — capture the first word
  var re = /\.command\(['"]([\w-]+)/g;
  var m;
  while ((m = re.exec(binContent)) !== null) {
    if (cmds.indexOf(m[1]) === -1) cmds.push(m[1]);
  }
  return cmds;
}

// Extract require/import targets from a source file
function extractRequires(content) {
  var deps = [];
  var re = /(?:require\(|from\s+)\s*['"]([^'"]+)['"]/g;
  var m;
  while ((m = re.exec(content)) !== null) {
    var dep = m[1];
    // Keep only relative (internal) requires
    if (dep.startsWith('.') || dep.startsWith('/')) deps.push(dep);
  }
  return deps;
}

// Extract module.exports or export function names
function extractExports(content) {
  var names = [];
  // Strip single-line comments to avoid false matches
  var code = content.replace(/\/\/.*$/gm, '');
  // module.exports = { name: ... } and module.exports.name
  var re1 = /module\.exports\.(\w+)/g;
  var m;
  while ((m = re1.exec(code)) !== null) names.push(m[1]);
  // module.exports = { name: ... }
  var objMatch = code.match(/module\.exports\s*=\s*\{([^}]+)\}/);
  if (objMatch) {
    var re2 = /(\w+)\s*:/g;
    while ((m = re2.exec(objMatch[1])) !== null) {
      if (names.indexOf(m[1]) === -1) names.push(m[1]);
    }
  }
  // export function name
  var re3 = /export\s+function\s+(\w+)/g;
  while ((m = re3.exec(code)) !== null) names.push(m[1]);
  return names;
}

// Infer a one-line role from file path heuristics
function inferRole(relPath) {
  var parts = relPath.replace(/\\/g, '/').split('/');
  var fname = parts[parts.length - 1].replace(/\.\w+$/, '');
  if (fname.startsWith('_')) return '(internal helper)';
  if (fname === 'index') return '(package entry)';
  if (parts.indexOf('commands') !== -1) return 'CLI command handler';
  if (parts.indexOf('core') !== -1) return 'core workflow logic';
  if (parts.indexOf('lib') !== -1) return 'shared utility library';
  if (parts.indexOf('web') !== -1) return 'web/console layer';
  if (parts.indexOf('models') !== -1) return 'data model';
  if (parts.indexOf('routes') !== -1) return 'route handler';
  return '';
}

// Main scan function — returns structured data
function scan(projectDir) {
  var result = {
    entryPoints: [],
    moduleBoundaries: [],
    keyComponents: [],
    internalDeps: [],
    externalDeps: []
  };

  // 1. Entry points — CLI commands from bin/
  var binDir = path.join(projectDir, 'bin');
  if (fs.existsSync(binDir)) {
    try {
      var binFiles = fs.readdirSync(binDir);
      binFiles.forEach(function(f) {
        if (!isSrcFile(f)) return;
        var content = fs.readFileSync(path.join(binDir, f), 'utf-8');
        var cmds = extractCliCommands(content);
        if (cmds.length) {
          result.entryPoints.push({ type: 'CLI', file: 'bin/' + f, commands: cmds });
        }
      });
    } catch (e) { /* ignore */ }
  }

  // 2. Source files — module boundaries and key components
  var srcFiles = collectSrcFiles(projectDir);

  // Group by top-level directory under src/ or lib/
  var boundaryMap = {};
  srcFiles.forEach(function(full) {
    var rel = path.relative(projectDir, full).replace(/\\/g, '/');
    // Skip test files
    if (rel.indexOf('tests/') !== -1 || rel.indexOf('test/') !== -1) return;
    var parts = rel.split('/');
    var boundary = parts.length > 1 ? parts[0] + '/' + parts[1] : parts[0];
    if (!boundaryMap[boundary]) boundaryMap[boundary] = [];
    boundaryMap[boundary].push({ full: full, rel: rel });
  });

  result.moduleBoundaries = Object.keys(boundaryMap).sort().map(function(b) {
    return { name: b, fileCount: boundaryMap[b].length };
  });

  // Key components — each source file with its exports and role
  srcFiles.forEach(function(full) {
    var rel = path.relative(projectDir, full).replace(/\\/g, '/');
    if (rel.indexOf('tests/') !== -1 || rel.indexOf('test/') !== -1) return;
    try {
      var content = fs.readFileSync(full, 'utf-8');
      var exports = extractExports(content);
      var requires = extractRequires(content);
      var role = inferRole(rel);
      result.keyComponents.push({ path: rel, exports: exports, role: role });
      requires.forEach(function(r) {
        var dep = r.replace(/\\/g, '/');
        if (result.internalDeps.indexOf(dep) === -1) result.internalDeps.push(dep);
      });
    } catch (e) { /* ignore unreadable */ }
  });

  // 3. External dependencies from package.json
  var pkgFile = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgFile)) {
    try {
      var pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
      var deps = Object.keys(pkg.dependencies || {});
      var devDeps = Object.keys(pkg.devDependencies || {});
      result.externalDeps = deps.concat(devDeps).sort();
    } catch (e) { /* ignore */ }
  }

  return result;
}

// Render scan result into Markdown (stdout, not a file)
function render(projectDir, scanResult) {
  var pkgFile = path.join(projectDir, 'package.json');
  var projectName = path.basename(projectDir);
  try {
    var pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
    projectName = pkg.name || projectName;
  } catch (e) { /* ignore */ }

  var lines = [];
  lines.push('# CodeMap: ' + projectName);
  lines.push('');
  lines.push('<!-- Auto-generated by `sdd codemap`. Not persisted — re-run when architecture changes. -->');
  lines.push('');

  // Entry Points
  lines.push('## 入口点（Entry Points）');
  if (scanResult.entryPoints.length) {
    scanResult.entryPoints.forEach(function(ep) {
      lines.push('- **' + ep.type + '** (`' + ep.file + '`)：' + ep.commands.map(function(c) { return '`sdd ' + c + '`'; }).join('、'));
    });
  } else {
    lines.push('(未检测到 CLI 入口点)');
  }
  lines.push('');

  // Module Boundaries
  lines.push('## 模块边界（Module Boundaries）');
  if (scanResult.moduleBoundaries.length) {
    scanResult.moduleBoundaries.forEach(function(mb) {
      lines.push('- **' + mb.name + '**：' + mb.fileCount + ' 个文件');
    });
  } else {
    lines.push('(未检测到源码目录)');
  }
  lines.push('');

  // Key Components
  lines.push('## 关键组件（Key Components）');
  if (scanResult.keyComponents.length) {
    scanResult.keyComponents.forEach(function(kc) {
      var desc = '- `' + kc.path + '`';
      if (kc.exports.length) desc += ' → ' + kc.exports.map(function(e) { return '`' + e + '`'; }).join(', ');
      if (kc.role) desc += ' — ' + kc.role;
      lines.push(desc);
    });
  } else {
    lines.push('(未检测到源码文件)');
  }
  lines.push('');

  // Core Call Chain — leave as mermaid skeleton (too complex to auto-infer)
  lines.push('## 核心调用链路（Core Call Chain）');
  lines.push('<!-- 需 AI 或人工根据调用关系补充 -->');
  lines.push('');

  // Dependencies
  lines.push('## 依赖（Dependencies）');
  if (scanResult.externalDeps.length || scanResult.internalDeps.length) {
    if (scanResult.externalDeps.length) {
      lines.push('**外部依赖**：' + scanResult.externalDeps.map(function(d) { return '`' + d + '`'; }).join('、'));
    }
    if (scanResult.internalDeps.length) {
      lines.push('**内部模块依赖**：' + scanResult.internalDeps.slice(0, 20).map(function(d) { return '`' + d + '`'; }).join('、'));
      if (scanResult.internalDeps.length > 20) lines.push('  …及其他 ' + (scanResult.internalDeps.length - 20) + ' 个');
    }
  } else {
    lines.push('(未检测到依赖)');
  }
  lines.push('');

  // Risks — leave as skeleton
  lines.push('## 风险点（Risks）');
  lines.push('<!-- 需 AI 或人工根据实际风险补充 -->');

  return lines.join('\n') + '\n';
}

// CLI entry point
function run(projectDir, opts) {
  var common = require('../../lib/common');
  var docsDir = common.getDocsDir(projectDir);
  var docsRoot = path.join(projectDir, docsDir);
  if (!fs.existsSync(docsRoot)) {
    console.error('[ERROR] Not initialized. Run: sdd init <dir>');
    process.exit(1);
  }
  var result = scan(projectDir);
  console.log(render(projectDir, result));
}

module.exports = { scan: scan, render: render, run: run };
