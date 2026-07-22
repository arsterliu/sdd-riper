const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runCli } = require('./helpers/sdd-fixtures');

test('playwright-test adapter completes a real Chromium smoke contract', { timeout: 120000 }, () => {
  const source = path.join(__dirname, 'fixtures/playwright-workspace');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-real-playwright-'));
  fs.cpSync(source, root, { recursive: true, filter: sourcePath => !/[\\/](node_modules|mydocs|\.sdd-verification\.json)([\\/]|$)/.test(sourcePath) });
  fs.cpSync(path.join(source, 'node_modules'), path.join(root, 'node_modules'), { recursive: true });
  const env = { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    XDG_CONFIG_HOME: path.join(root, '.xdg'), PLAYWRIGHT_BROWSERS_PATH: path.join(source, '.playwright-browsers') };
  fs.mkdirSync(env.XDG_CONFIG_HOME, { recursive: true });
  const previous = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = env.PLAYWRIGHT_BROWSERS_PATH;
  try {
    execFileSync('git', ['init'], { cwd: root, env });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, env });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root, env });
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, env });
    execFileSync('git', ['add', '.'], { cwd: root, env });
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root, env });
    const initialized = runCli(['verify', 'init', root, '--provider', 'web-e2e', '--adapter', 'playwright-test',
      '--workspace-root', '.', '--package-root', '.', '--config', 'playwright.config.js', '--project', 'chromium'], root);
    assert.equal(initialized.status, 0, initialized.output);
    const result = runCli(['verify', 'run', root, '--spec', path.join(root, 'spec.md')], root);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /gate=PASS/);
  } finally {
    if (previous === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = previous;
  }
});
