'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const migratedTests = [
  'tests/visual-context-discovery.test.js',
  'tests/visual-evidence-contract.test.js',
  'tests/visual-contract-inspection.test.js',
  'tests/visual-verification-cli.test.js',
  'tests/visual-verification-config.test.js'
];

test('迁移目标保留原有的可观察测试行为', () => {
  const result = spawnSync(process.execPath, ['--test'].concat(migratedTests), {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, String(result.stdout || '') + String(result.stderr || ''));
});
