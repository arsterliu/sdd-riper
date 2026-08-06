const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const discovery = require('../src/visual-evidence/discovery');

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function createSpec(projectDir, taskName) {
  const specPath = path.join(projectDir, 'mydocs', 'specs', 'v1.0-' + taskName + '.md');
  write(specPath, [
    '---',
    'task-name: "' + taskName + '"',
    'context-source: "mydocs/context/' + taskName + '"',
    '---'
  ].join('\n'));
  return specPath;
}

function treeSnapshot(root) {
  const files = [];
  function visit(directory) {
    fs.readdirSync(directory, { withFileTypes: true }).sort(function(a, b) { return a.name.localeCompare(b.name); }).forEach(function(entry) {
      const filePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
      if (entry.isDirectory()) visit(filePath);
      else files.push(relativePath + ':' + fs.readFileSync(filePath).toString('hex'));
    });
  }
  visit(root);
  return files;
}

test('发现本地混合视觉材料、低置信度场景线索和统一 URL 引用，且结果稳定只读', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-discovery-'));
  const taskName = 'checkout-ui';
  const specPath = createSpec(projectDir, taskName);
  const contextDir = path.join(projectDir, 'mydocs', 'context', taskName);

  write(path.join(contextDir, 'assets', 'checkout-desktop.png'), 'image');
  write(path.join(contextDir, 'assets', 'checkout-mobile.svg'), '<svg/>');
  write(path.join(contextDir, 'docs', 'design.pdf'), 'pdf');
  write(path.join(contextDir, 'notes', 'brief.md'), 'See https://www.figma.com/file/abc123/Checkout and https://example.test/reference.');
  write(path.join(contextDir, 'notes', 'links.txt'), 'Prototype: https://prototype.example.test/checkout');
  write(path.join(contextDir, 'unknown.bin'), 'unknown');
  const before = treeSnapshot(contextDir);

  const first = discovery.discover(specPath, projectDir);
  const second = discovery.discover(specPath, projectDir);

  assert.deepEqual(first, second);
  assert.deepEqual(treeSnapshot(contextDir), before);
  assert.deepEqual(first.materials, [
    { path: 'assets/checkout-desktop.png', kind: 'image' },
    { path: 'assets/checkout-mobile.svg', kind: 'image' },
    { path: 'docs/design.pdf', kind: 'document' },
    { path: 'notes/brief.md', kind: 'text' },
    { path: 'notes/links.txt', kind: 'text' }
  ]);
  assert.deepEqual(first.candidates, [
    { kind: 'scenario-hint', materialPath: 'assets/checkout-desktop.png', confidence: 'low', hint: 'desktop' },
    { kind: 'scenario-hint', materialPath: 'assets/checkout-mobile.svg', confidence: 'low', hint: 'mobile' },
    { kind: 'reference', materialPath: 'notes/brief.md', confidence: 'low', reference: 'https://example.test/reference' },
    { kind: 'reference', materialPath: 'notes/brief.md', confidence: 'low', reference: 'https://www.figma.com/file/abc123/Checkout' },
    { kind: 'reference', materialPath: 'notes/links.txt', confidence: 'low', reference: 'https://prototype.example.test/checkout' }
  ]);
  assert.deepEqual(first.gaps, [{ code: 'VISUAL_CONTEXT_MAPPING_REQUIRED' }]);
  assert.deepEqual(first.questions, [{
    code: 'VISUAL_CONTEXT_MATERIAL_UNCLASSIFIED',
    materialPath: 'unknown.bin',
    prompt: '该材料的用途是什么？'
  }]);
  assert.deepEqual(first.diagnostics, []);
});

test('空 Context 报告明确缺口而非抛出异常', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-discovery-'));
  const taskName = 'empty-ui';
  const specPath = createSpec(projectDir, taskName);
  const contextDir = path.join(projectDir, 'mydocs', 'context', taskName);
  fs.mkdirSync(contextDir, { recursive: true });

  const result = discovery.discover(specPath, projectDir);

  assert.deepEqual(result.materials, []);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.gaps, [{ code: 'VISUAL_CONTEXT_EMPTY' }]);
  assert.deepEqual(result.questions, [{ code: 'VISUAL_CONTEXT_MATERIALS_NEEDED', prompt: '请补充设计图、参考截图或文字视觉说明。' }]);
  assert.deepEqual(result.diagnostics, []);
});

test('仅含未知文件的 Context 只询问用途，不误报为空或要求补充材料', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-discovery-'));
  const taskName = 'unknown-only-ui';
  const specPath = createSpec(projectDir, taskName);
  const contextDir = path.join(projectDir, 'mydocs', 'context', taskName);
  write(path.join(contextDir, 'designer-export.sketch'), 'unknown-format');

  const result = discovery.discover(specPath, projectDir);

  assert.deepEqual(result.materials, []);
  assert.deepEqual(result.gaps, []);
  assert.deepEqual(result.questions, [{
    code: 'VISUAL_CONTEXT_MATERIAL_UNCLASSIFIED',
    materialPath: 'designer-export.sketch',
    prompt: '该材料的用途是什么？'
  }]);
  assert.deepEqual(result.diagnostics, []);
});

test('拒绝 Context 内逃逸链接且不读取外部材料', function(t) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-discovery-'));
  const taskName = 'linked-ui';
  const specPath = createSpec(projectDir, taskName);
  const contextDir = path.join(projectDir, 'mydocs', 'context', taskName);
  const outsideDir = path.join(projectDir, 'outside');
  write(path.join(outsideDir, 'secret.md'), 'https://secret.example.test/should-not-be-read');
  fs.mkdirSync(contextDir, { recursive: true });
  try { fs.symlinkSync(outsideDir, path.join(contextDir, 'linked'), 'junction'); }
  catch (error) { t.skip('当前 Windows 未授予目录链接权限'); return; }

  const result = discovery.discover(specPath, projectDir);

  assert.deepEqual(result.materials, []);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.diagnostics, [{ code: 'VISUAL_CONTEXT_SYMLINK_OUTSIDE_CONTEXT', path: 'linked' }]);
});

test('为超深路径和过大文件返回稳定诊断且继续保持只读', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-discovery-'));
  const taskName = 'limited-ui';
  const specPath = createSpec(projectDir, taskName);
  const contextDir = path.join(projectDir, 'mydocs', 'context', taskName);
  write(path.join(contextDir, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'too-deep.png'), 'image');
  write(path.join(contextDir, 'too-large.txt'), 'x'.repeat(1024 * 1024 + 1));
  const before = treeSnapshot(contextDir);

  const result = discovery.discover(specPath, projectDir);

  assert.deepEqual(treeSnapshot(contextDir), before);
  assert.deepEqual(result.materials, []);
  assert.deepEqual(result.diagnostics, [
    { code: 'VISUAL_CONTEXT_DEPTH_LIMIT', path: 'a/b/c/d/e/f' },
    { code: 'VISUAL_CONTEXT_FILE_SIZE_LIMIT', path: 'too-large.txt' }
  ]);
});

test('超过条目上限时给出稳定诊断并停止继续扫描', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-discovery-'));
  const taskName = 'entry-limit-ui';
  const specPath = createSpec(projectDir, taskName);
  const contextDir = path.join(projectDir, 'mydocs', 'context', taskName);
  const limit = discovery._private.MAX_ENTRIES;
  for (let index = 0; index <= limit; index += 1) {
    write(path.join(contextDir, 'image-' + String(index).padStart(4, '0') + '.png'), 'image');
  }

  const result = discovery.discover(specPath, projectDir);

  assert.deepEqual(result.materials, []);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.gaps, []);
  assert.deepEqual(result.questions, []);
  assert.deepEqual(result.diagnostics, [{ code: 'VISUAL_CONTEXT_ENTRY_LIMIT' }]);
});

test('超过全局条目上限的结果不依赖目录枚举顺序', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-discovery-'));
  const taskName = 'entry-order-ui';
  const specPath = createSpec(projectDir, taskName);
  const contextDir = path.join(projectDir, 'mydocs', 'context', taskName);
  for (let index = 0; index <= discovery._private.MAX_ENTRIES; index += 1) {
    write(path.join(contextDir, 'image-' + String(index).padStart(4, '0') + '.png'), 'image');
  }
  const originalOpendirSync = fs.opendirSync;

  function discoverWithOrder(reverse) {
    fs.opendirSync = function(directoryPath) {
      const realDirectory = originalOpendirSync(directoryPath);
      const entries = [];
      let entry;
      try {
        while ((entry = realDirectory.readSync())) entries.push(entry);
      } finally {
        realDirectory.closeSync();
      }
      if (reverse) entries.reverse();
      return {
        readSync: function() { return entries.shift() || null; },
        closeSync: function() {}
      };
    };
    try { return discovery.discover(specPath, projectDir); }
    finally { fs.opendirSync = originalOpendirSync; }
  }

  const forward = discoverWithOrder(false);
  const reverse = discoverWithOrder(true);

  assert.deepEqual(forward, { materials: [], candidates: [], gaps: [], questions: [], diagnostics: [{ code: 'VISUAL_CONTEXT_ENTRY_LIMIT' }] });
  assert.deepEqual(reverse, forward);
});

test('目录扫描使用逐项目录句柄，并在真实目录中保持稳定输出', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-discovery-'));
  const taskName = 'opendir-ui';
  const specPath = createSpec(projectDir, taskName);
  const contextDir = path.join(projectDir, 'mydocs', 'context', taskName);
  write(path.join(contextDir, 'b-mobile.png'), 'image');
  write(path.join(contextDir, 'a-desktop.png'), 'image');
  const originalReaddirSync = fs.readdirSync;
  fs.readdirSync = function() { throw new Error('discover must not read a whole directory into an array'); };
  let first;
  let second;
  try {
    first = discovery.discover(specPath, projectDir);
    second = discovery.discover(specPath, projectDir);
  } finally {
    fs.readdirSync = originalReaddirSync;
  }

  assert.deepEqual(first, second);
  assert.deepEqual(first.materials, [
    { path: 'a-desktop.png', kind: 'image' },
    { path: 'b-mobile.png', kind: 'image' }
  ]);
});

test('受限文本仅用文件描述符读取前缀，发现前段 URL 而不读取后段 URL', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-discovery-'));
  const taskName = 'text-prefix-ui';
  const specPath = createSpec(projectDir, taskName);
  const contextDir = path.join(projectDir, 'mydocs', 'context', taskName);
  const textPath = path.join(contextDir, 'references.txt');
  const firstUrl = 'https://example.test/first';
  const lastUrl = 'https://example.test/last';
  write(textPath, firstUrl + '\n' + 'x'.repeat(70 * 1024) + '\n' + lastUrl);
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = function(filePath) {
    if (path.resolve(filePath) === path.resolve(textPath)) throw new Error('text must be read through a bounded file descriptor');
    return originalReadFileSync.apply(fs, arguments);
  };
  let result;
  try {
    result = discovery.discover(specPath, projectDir);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }

  assert.deepEqual(result.candidates, [{
    kind: 'reference', materialPath: 'references.txt', confidence: 'low', reference: firstUrl
  }]);
  assert.equal(result.candidates.some(function(candidate) { return candidate.reference === lastUrl; }), false);
  assert.deepEqual(result.diagnostics, []);
});

test('realpath containment helper rejects an external child before directory or file access', function() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-discovery-'));
  const contextDir = path.join(projectDir, 'context');
  const insideFile = path.join(contextDir, 'inside.txt');
  const outsideFile = path.join(projectDir, 'outside.txt');
  write(insideFile, 'inside');
  write(outsideFile, 'outside');

  assert.equal(discovery._private.isRealpathInside(contextDir, insideFile), true);
  assert.equal(discovery._private.isRealpathInside(contextDir, outsideFile), false);
});
