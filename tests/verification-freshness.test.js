const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { captureCodeState, sameCodeState } = require('../src/verification/fingerprint');

process.env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-fingerprint-'));
  process.env.XDG_CONFIG_HOME = path.join(root, '.xdg');
  fs.mkdirSync(process.env.XDG_CONFIG_HOME, { recursive: true });
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root });
  fs.writeFileSync(path.join(root, 'app.js'), 'one\n');
  execFileSync('git', ['add', 'app.js'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: root });
  return root;
}

test('binds HEAD, staged, unstaged and untracked content into code state', () => {
  const root = repo();
  const clean = captureCodeState(root, 'mydocs');
  assert.ok(sameCodeState(clean, captureCodeState(root, 'mydocs')));
  fs.writeFileSync(path.join(root, 'app.js'), 'two\n');
  const changed = captureCodeState(root, 'mydocs');
  assert.notEqual(changed.aggregateDigest, clean.aggregateDigest);
  execFileSync('git', ['add', 'app.js'], { cwd: root });
  assert.notEqual(captureCodeState(root, 'mydocs').aggregateDigest, changed.aggregateDigest);
  fs.writeFileSync(path.join(root, 'new.txt'), 'new');
  assert.notEqual(captureCodeState(root, 'mydocs').aggregateDigest, changed.aggregateDigest);
});

test('excludes docs root evidence output from code mutation checks', () => {
  const root = repo();
  const before = captureCodeState(root, 'mydocs');
  fs.mkdirSync(path.join(root, 'mydocs/runs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'mydocs/runs/result.json'), '{}');
  assert.ok(sameCodeState(before, captureCodeState(root, 'mydocs')));
});
