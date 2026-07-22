'use strict';

var createServer = require('../../../src/commands/console').createServer;
var parentPid = Number(process.argv[2]);
var port = Number(process.argv[3] || 4799);
var server = createServer();
var closing = false;

function close() {
  if (closing) return;
  closing = true;
  clearInterval(watchdog);
  server.close(function() { process.exit(0); });
  setTimeout(function() { process.exit(0); }, 2000).unref();
}

var watchdog = setInterval(function() {
  try { process.kill(parentPid, 0); } catch (_) { close(); }
}, 250);
watchdog.unref();
process.on('SIGTERM', close);
process.on('SIGINT', close);
server.listen(port, '127.0.0.1');
