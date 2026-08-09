'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { makeTempDir, writeText, writeBuffer, writeJson } = require('./helpers/test-fs');

function remove(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test('makeTempDir creates distinct directories using the caller prefix', (t) => {
  const first = makeTempDir('sdd-test-fs-');
  const second = makeTempDir('sdd-test-fs-');
  t.after(() => remove(first));
  t.after(() => remove(second));

  assert.notEqual(first, second);
  assert.equal(path.basename(first).startsWith('sdd-test-fs-'), true);
  assert.equal(fs.statSync(first).isDirectory(), true);
  assert.equal(fs.statSync(second).isDirectory(), true);
});

test('writeText creates parent directories and preserves text exactly', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-test-fs-'));
  const file = path.join(root, 'nested', 'note.txt');
  t.after(() => remove(root));

  writeText(file, '第一行\nsecond line');

  assert.equal(fs.readFileSync(file, 'utf8'), '第一行\nsecond line');
});

test('writeBuffer creates parent directories and preserves bytes exactly', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-test-fs-'));
  const file = path.join(root, 'nested', 'payload.bin');
  const value = Buffer.from([0x00, 0x0a, 0xff]);
  t.after(() => remove(root));

  writeBuffer(file, value);

  assert.deepEqual(fs.readFileSync(file), value);
});

test('writeJson creates parent directories and serializes the caller value', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-test-fs-'));
  const file = path.join(root, 'nested', 'value.json');
  const value = { name: 'fixture', nested: { enabled: true } };
  t.after(() => remove(root));

  writeJson(file, value);

  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), value);
});
