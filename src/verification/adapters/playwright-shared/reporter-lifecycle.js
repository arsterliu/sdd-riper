'use strict';

var fs = require('fs');

function createReporter(configuration) {
  function Reporter(options) {
    options = options || {};
    this.outputFile = options.outputFile || process.env.SDD_VERIFICATION_OUTPUT;
    this.nonce = options.nonce || process.env.SDD_VERIFICATION_NONCE;
    if (!this.outputFile || !this.nonce) throw new Error(configuration.errorMessage);
  }

  Reporter.prototype.emit = function(event) {
    fs.appendFileSync(this.outputFile, JSON.stringify(event) + '\n', 'utf8');
  };

  Reporter.prototype.onBegin = function() {
    this.emit({ type: 'hello', nonce: this.nonce, handshakeVersion: 1, capabilities: [configuration.capability] });
  };

  Reporter.prototype.onTestEnd = function(test, result) {
    this.emit({ type: 'test', test: configuration.mapTest(test, result) });
  };

  Reporter.prototype.onEnd = function(result) {
    this.emit({ type: 'end', status: result.status });
  };

  return Reporter;
}

module.exports = { createReporter: createReporter };
