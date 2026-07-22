'use strict';

var fs = require('fs');
var path = require('path');
var contract = require('./contract');

function loadVerificationConfig(projectDir) {
  var file = path.join(path.resolve(projectDir), '.sdd-verification.json');
  if (!fs.existsSync(file)) return { schemaVersion: 1, providers: {} };
  var value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw contract.verificationError('CONFIG_SCHEMA_INVALID', 'invalid verification config JSON', {
      path: file,
      cause: error.message
    });
  }
  return contract.validateVerificationConfig(value);
}

module.exports = { loadVerificationConfig: loadVerificationConfig };
