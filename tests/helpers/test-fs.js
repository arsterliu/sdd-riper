'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function writeBuffer(filePath, buffer) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

function writeJson(filePath, value) {
  writeText(filePath, JSON.stringify(value, null, 2));
}

module.exports = {
  makeTempDir,
  writeText,
  writeBuffer,
  writeJson
};
