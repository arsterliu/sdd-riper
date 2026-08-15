const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const { runCli } = require('./helpers/sdd-fixtures');

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeBuffer(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 0);
  return Buffer.concat([head, Buffer.from(type), data, trailer]);
}

function solidPng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let row = 0; row < height; row++) {
    raw[row * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) Buffer.from(rgba).copy(raw, row * (width * 4 + 1) + 1 + x * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function visualSpec() {
  return [
    '---', 'task-name: "checkout-ui"', 'mode: micro', 'autonomy-mode: "auto"', 'autonomy-mode-source: "fixture"', 'status: draft',
    'context-source: "mydocs/context/checkout-ui"', 'visual-evidence: "required"',
    'visual-evidence-file: "mydocs/context/checkout-ui/visual-evidence.json"', '---',
    '## Acceptance Criteria',
    '### AC-013: ordinary e2e compatibility', 'Requirement: the established Playwright gate still runs.', 'Type: e2e',
    'Verification: e2e', 'Provider: web-e2e',
    '## Plan', 'Scope: fixture', 'Touched Files: fixture', 'Change: fixture', 'Impact Scope: fixture', 'Data Impact: fixture',
    'Interface Impact: fixture', 'Acceptance: fixture', 'Verification: fixture', 'Blast Radius: fixture',
    'Plan Approved By: agent:fixture', 'Approved At: 2026-08-04T00:00:00Z', 'Gate Evidence: fixture', ''
  ].join('\n');
}

function contract() {
  return {
    schemaVersion: 1, mode: 'fidelity',
    sources: [{ id: 'design', type: 'screenshot', path: 'design.png' }],
    scenarios: [{ id: 'checkout-default', route: '/checkout', state: 'default', viewport: { width: 2, height: 1 }, sourceId: 'design', baseline: { path: 'baseline.png', status: 'approved' } }],
    approval: { approvedBy: 'human:design-owner', approvedAt: '2026-08-04T00:00:00Z' }
  };
}

function visualTest(title, color) {
  return [
    "const { test } = require('@playwright/test');",
    "test('" + title + "', async ({ page }, testInfo) => {",
    '  await page.setViewportSize({ width: 2, height: 1 });',
    "  await page.setContent('<style>html,body{margin:0;width:2px;height:1px;background:rgb(" + color.join(',') + ");}</style>');",
    "  const current = testInfo.outputPath('current.png');",
    '  await page.screenshot({ path: current });',
    "  await testInfo.attach('sdd-visual:checkout-default', { path: current, contentType: 'image/png' });",
    '});', ''
  ].join('\n');
}

function mutatingVisualTest() {
  return [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    visualTest('writes outside Playwright output', [255, 255, 255]).replace("  await page.setViewportSize", "  fs.writeFileSync(path.join(__dirname, '..', 'visual-mutation.txt'), 'unexpected');\n  await page.setViewportSize")
  ].join('\n');
}

function fixture() {
  const source = path.join(__dirname, 'fixtures/playwright-workspace');
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-playwright-'));
  fs.cpSync(source, projectDir, { recursive: true, filter: sourcePath => !/[\\/](mydocs|\.sdd-verification\.json)([\\/]|$)/.test(sourcePath) });
  write(path.join(projectDir, 'playwright.config.js'), "module.exports = { testDir: './tests', testMatch: '*.visual.spec.js', projects: [{ name: 'chromium', use: { browserName: 'chromium' } }] };\n");
  write(path.join(projectDir, 'playwright.e2e.config.js'), "module.exports = { testDir: './tests', testMatch: 'smoke.spec.js', projects: [{ name: 'chromium', use: { browserName: 'chromium' } }] };\n");
  write(path.join(projectDir, 'tests/pass.visual.spec.js'), visualTest('captures white checkout', [255, 255, 255]));
  write(path.join(projectDir, 'tests/fail.visual.spec.js'), visualTest('captures changed checkout', [255, 0, 0]));
  write(path.join(projectDir, 'tests/mutating.visual.spec.js'), mutatingVisualTest());
  write(path.join(projectDir, 'mydocs/specs/v1.0-checkout-ui.md'), visualSpec());
  writeBuffer(path.join(projectDir, 'mydocs/context/checkout-ui/design.png'), solidPng(2, 1, [255, 255, 255, 255]));
  writeBuffer(path.join(projectDir, 'mydocs/context/checkout-ui/baseline.png'), solidPng(2, 1, [255, 255, 255, 255]));
  fs.writeFileSync(path.join(projectDir, 'mydocs/context/checkout-ui/visual-evidence.json'), JSON.stringify(contract(), null, 2));
  fs.writeFileSync(path.join(projectDir, '.sdd-verification.json'), JSON.stringify({ schemaVersion: 1, providers: {
    'web-e2e': { adapter: 'playwright-test', workspaceRoot: '.', packageRoot: '.', config: 'playwright.e2e.config.js', projects: ['chromium'] },
    'web-visual': { adapter: 'playwright-visual', workspaceRoot: '.', packageRoot: '.', config: 'playwright.config.js', projects: ['chromium'] }
  } }, null, 2));
  fs.writeFileSync(path.join(projectDir, 'sdd.visual.config.json'), JSON.stringify({ schemaVersion: 1, scenarios: {
    'checkout-default': { testFile: 'tests/pass.visual.spec.js', testTitle: 'captures white checkout', project: 'chromium', threshold: 0, masks: [] }
  } }, null, 2));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', XDG_CONFIG_HOME: path.join(projectDir, '.xdg') };
  fs.mkdirSync(env.XDG_CONFIG_HOME, { recursive: true });
  execFileSync('git', ['init'], { cwd: projectDir, env });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectDir, env });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: projectDir, env });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: projectDir, env });
  execFileSync('git', ['add', '.'], { cwd: projectDir, env });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: projectDir, env });
  return { projectDir, specPath: path.join(projectDir, 'mydocs/specs/v1.0-checkout-ui.md') };
}

test('playwright-visual creates auditable PASS and FAIL visual Runs from approved baselines', { timeout: 120000 }, () => {
  const { projectDir, specPath } = fixture();
  const pass = runCli(['verify', 'visual', projectDir, '--spec', specPath], projectDir);
  assert.equal(pass.status, 0, pass.output);
  assert.match(pass.output, /gate=PASS/);

  const e2e = runCli(['verify', 'run', projectDir, '--spec', specPath, '--ac', 'AC-013'], projectDir);
  assert.equal(e2e.status, 0, e2e.output);
  assert.match(e2e.output, /provider=web-e2e gate=PASS/);

  const configPath = path.join(projectDir, 'sdd.visual.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.scenarios['checkout-default'].testFile = 'tests/fail.visual.spec.js';
  config.scenarios['checkout-default'].testTitle = 'captures changed checkout';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  const fail = runCli(['verify', 'visual', projectDir, '--spec', specPath], projectDir);
  assert.equal(fail.status, 1, fail.output);
  assert.match(fail.output, /gate=FAIL/);

  const baselinePath = path.join(projectDir, 'mydocs/context/checkout-ui/baseline.png');
  const baseline = fs.readFileSync(baselinePath);
  fs.writeFileSync(baselinePath, 'not-a-png');
  const invalidImage = runCli(['verify', 'visual', projectDir, '--spec', specPath], projectDir);
  assert.equal(invalidImage.status, 2, invalidImage.output);
  assert.match(invalidImage.output, /gate=BLOCKED/);
  fs.writeFileSync(baselinePath, baseline);

  config.scenarios['checkout-default'].testFile = 'tests/mutating.visual.spec.js';
  config.scenarios['checkout-default'].testTitle = 'writes outside Playwright output';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  const mutated = runCli(['verify', 'visual', projectDir, '--spec', specPath], projectDir);
  assert.equal(mutated.status, 2, mutated.output);
  assert.match(mutated.output, /gate=BLOCKED/);
  fs.rmSync(path.join(projectDir, 'visual-mutation.txt'));

  fs.rmSync(path.join(projectDir, '.playwright-browsers'), { recursive: true, force: true });
  fs.mkdirSync(path.join(projectDir, '.playwright-browsers'));
  const blocked = runCli(['verify', 'visual', projectDir, '--spec', specPath], projectDir);
  assert.equal(blocked.status, 2, blocked.output);
  assert.match(blocked.output, /SDD_VERIFY_BROWSER_NOT_INSTALLED/);

  const runsRoot = path.join(projectDir, 'mydocs/runs/visual');
  const runs = fs.readdirSync(runsRoot).filter(name => !name.startsWith('.staging-')).map(name => JSON.parse(fs.readFileSync(path.join(runsRoot, name, 'run.json'), 'utf8')));
  assert.equal(runs.length, 5);
  assert.deepEqual(runs.map(run => run.gateDecision).sort(), ['BLOCKED', 'BLOCKED', 'BLOCKED', 'FAIL', 'PASS']);
  assert.equal(runs.filter(run => run.gateDecision !== 'BLOCKED').every(run => run.attachments.length === 2), true);
  const blockedRuns = runs.filter(run => run.gateDecision === 'BLOCKED');
  assert.equal(blockedRuns.every(run => run.visual.scenarios.length === 0), true);
  assert.equal(blockedRuns.every(run => run.attachments.length === 0), true);
  assert.equal(runs.find(run => run.gateDecision === 'PASS').visual.scenarios[0].masks.length, 0);
  assert.deepEqual(runs.find(run => run.diagnostics.some(item => item.code === 'BROWSER_NOT_INSTALLED')).diagnostics.map(item => item.code), ['BROWSER_NOT_INSTALLED']);
  assert.equal(runs.some(run => run.diagnostics.some(item => item.code === 'VISUAL_IMAGE_INVALID')), true);
  const mutatedRun = runs.find(run => run.diagnostics.some(item => item.code === 'WORKTREE_MUTATED'));
  assert.equal(mutatedRun.gateDecision, 'BLOCKED');
  assert.equal(mutatedRun.freshness, 'stale');
  assert.deepEqual(mutatedRun.visual.scenarios, []);
  assert.deepEqual(mutatedRun.attachments, []);
  assert.equal(fs.readdirSync(path.join(projectDir, 'mydocs/runs/verification')).length > 0, true);
});
