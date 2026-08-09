'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { runSddCli } = require('./helpers/test-cli');

function optionsFor(root) {
  return {
    cwd: root,
    env: Object.assign({}, process.env, { SDD_TEST_CLI_MARKER: 'explicit-input' })
  };
}

test('runSddCli uses the repository CLI and returns successful output', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-test-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = runSddCli(['--help'], optionsFor(root));

  assert.deepEqual(Object.keys(result).sort(), ['output', 'status']);
  assert.equal(result.status, 0);
  assert.match(result.output, /Usage: sdd/);
});

test('runSddCli forwards the explicit cwd and env into the fixed CLI process', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-test-cli-'));
  const probe = path.join(root, 'probe.cjs');
  const evidence = path.join(root, 'evidence.json');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(probe, [
    "'use strict';",
    "const fs = require('node:fs');",
    "fs.writeFileSync(process.env.SDD_TEST_CLI_PROBE_FILE, JSON.stringify({ cwd: process.cwd(), marker: process.env.SDD_TEST_CLI_MARKER }), 'utf8');"
  ].join('\n'), 'utf8');

  const result = runSddCli(['--help'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      NODE_OPTIONS: [process.env.NODE_OPTIONS, '--require=' + probe].filter(Boolean).join(' '),
      SDD_TEST_CLI_MARKER: 'explicit-input',
      SDD_TEST_CLI_PROBE_FILE: evidence
    })
  });

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(evidence, 'utf8')), {
    cwd: root,
    marker: 'explicit-input'
  });
});

test('runSddCli returns combined output for a non-zero CLI result', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-test-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = runSddCli(['not-a-command'], optionsFor(root));

  assert.equal(result.status, 1);
  assert.match(result.output, /unknown command 'not-a-command'/);
});
