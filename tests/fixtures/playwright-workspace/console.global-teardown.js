'use strict';

var fs = require('fs');
var path = require('path');
var fixtures = require('../../helpers/verification-fixtures');
var stateFile = path.join(__dirname, '.console-e2e-state.json');

module.exports = async function() {
  if (!fs.existsSync(stateFile)) return;
  var state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (!await fixtures.terminateOwnedServer(state)) throw new Error('Refusing to terminate unowned Console E2E server.');
  if (!fixtures.cleanupOwnedProject(state)) throw new Error('Refusing to delete unowned Console E2E directory: ' + state.projectDir);
  fs.rmSync(stateFile, { force: true });
};
