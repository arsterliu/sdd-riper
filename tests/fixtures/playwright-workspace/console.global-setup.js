'use strict';

var fs = require('fs');
var http = require('http');
var path = require('path');
var spawn = require('child_process').spawn;
var fixtures = require('../../helpers/verification-fixtures');
var stateFile = path.join(__dirname, '.console-e2e-state.json');

function ready() {
  return new Promise(function(resolve) {
    var request = http.get('http://127.0.0.1:4799/', function(response) {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('error', function() { resolve(false); });
    request.setTimeout(500, function() { request.destroy(); resolve(false); });
  });
}

async function waitUntilReady(child) {
  var deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Console E2E server exited before readiness.');
    if (await ready()) return;
    await new Promise(function(resolve) { setTimeout(resolve, 100); });
  }
  throw new Error('Console E2E server did not become ready on port 4799.');
}

module.exports = async function() {
  if (fs.existsSync(stateFile)) {
    var stale = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (!await fixtures.terminateOwnedServer(stale)) throw new Error('Refusing to terminate unowned stale Console E2E server.');
    if (!fixtures.cleanupOwnedProject(stale)) throw new Error('Refusing to delete unowned stale Console E2E directory.');
    fs.rmSync(stateFile, { force: true });
  }
  var state = fixtures.createConsoleE2EProject();
  var serverScript = path.resolve(__dirname, 'console.server.js');
  var child = spawn(process.execPath, [serverScript, String(process.pid), '4799'], {
    cwd: path.resolve(__dirname, '../../..'), stdio: 'ignore', windowsHide: true
  });
  child.unref();
  state.serverPid = child.pid;
  if (!fixtures.recordServerOwner(state)) throw new Error('Unable to bind Console server PID to fixture ownership marker.');
  fs.writeFileSync(stateFile, JSON.stringify(state), 'utf8');
  try { await waitUntilReady(child); }
  catch (error) {
    try { process.kill(child.pid, 'SIGTERM'); } catch (_) {}
    fixtures.cleanupOwnedProject(state);
    fs.rmSync(stateFile, { force: true });
    throw error;
  }
};
