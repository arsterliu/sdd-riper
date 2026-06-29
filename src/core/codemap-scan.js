// Source-code scanner that populates CodeMap sections from real project structure.
// Deterministic, no AST — regex-based heuristics good enough for a skeleton.

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
  while ((m = re3.exec(content)) !== null) names.push(m[1]);
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

// Main scan function — returns structured data for codemap generation
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
  var srcDir = path.join(projectDir, 'src');
  var libDir = path.join(projectDir, 'lib');

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

// Render scan result into codemap Markdown content
function renderCodemap(moduleName, projectDir, scanResult) {
  var pkgFile = path.join(projectDir, 'package.json');
  var projectName = moduleName;
  try {
    var pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
    projectName = pkg.name || moduleName;
  } catch (e) { /* ignore */ }

  var lines = [];
  lines.push('---');
  lines.push('project: ' + projectName);
  lines.push('module: ' + moduleName);
  lines.push('updated-at: ' + new Date().toISOString().slice(0, 10));
  lines.push('last-reason: Auto-scanned by sdd init');
  lines.push('---');
  lines.push('');
  lines.push('<!--');
  lines.push('CodeMap 是模块级活文档：跨任务复用，仅在架构事实变更时更新。');
  lines.push('若以下任一维度发生变化，请同步更新 updated-at 与 last-reason。');
  lines.push('-->');
  lines.push('');
  lines.push('# ' + moduleName + ' CodeMap');
  lines.push('');

  // Entry Points
  lines.push('## 入口点（Entry Points）');
  if (scanResult.entryPoints.length) {
    scanResult.entryPoints.forEach(function(ep) {
      lines.push('- **' + ep.type + '** (`' + ep.file + '`)：' + ep.commands.map(function(c) { return '`sdd ' + c + '`'; }).join('、'));
    });
  } else {
    lines.push('<!-- 触发方式：HTTP 路由 / CLI 命令 / 事件监听 / 消息队列 / 定时任务 -->');
  }
  lines.push('');

  // Module Boundaries
  lines.push('## 模块边界（Module Boundaries）');
  if (scanResult.moduleBoundaries.length) {
    scanResult.moduleBoundaries.forEach(function(mb) {
      lines.push('- **' + mb.name + '**：' + mb.fileCount + ' 个文件');
    });
  } else {
    lines.push('<!--');
    lines.push('- 本模块负责：');
    lines.push('- 委托给其他模块：');
    lines.push('- 对外暴露的接口：');
    lines.push('-->');
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
    lines.push('<!-- 组件 → 文件路径 → 职责（一行一个） -->');
  }
  lines.push('');

  // Core Call Chain — leave as mermaid skeleton (too complex to auto-infer)
  lines.push('## 核心调用链路（Core Call Chain）');
  lines.push('<!--');
  lines.push('```mermaid');
  lines.push('graph LR');
  lines.push('  A[入口] --> B[核心处理] --> C[输出]');
  lines.push('```');
  lines.push('-->');
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
    lines.push('<!--');
    lines.push('- 内部模块依赖：');
    lines.push('- 外部依赖（第三方库 / API / DB / MQ）：');
    lines.push('-->');
  }
  lines.push('');

  // Risks — leave as skeleton
  lines.push('## 风险点（Risks）');
  lines.push('<!-- 已知风险、脆弱依赖、需注意的边界条件 -->');

  return lines.join('\n') + '\n';
}

module.exports = { scan: scan, renderCodemap: renderCodemap };
