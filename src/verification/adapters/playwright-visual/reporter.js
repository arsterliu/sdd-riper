'use strict';

var fs = require('fs');

function VisualReporter(options) {
  options = options || {};
  this.outputFile = options.outputFile || process.env.SDD_VERIFICATION_OUTPUT;
  this.nonce = options.nonce || process.env.SDD_VERIFICATION_NONCE;
  if (!this.outputFile || !this.nonce) throw new Error('SDD visual reporter requires outputFile and nonce');
}

VisualReporter.prototype.emit = function(event) {
  fs.appendFileSync(this.outputFile, JSON.stringify(event) + '\n', 'utf8');
};

VisualReporter.prototype.onBegin = function() {
  this.emit({ type: 'hello', nonce: this.nonce, handshakeVersion: 1, capabilities: ['visual-gate'] });
};

VisualReporter.prototype.onTestEnd = function(test, result) {
  var project = test.parent && typeof test.parent.project === 'function' ? test.parent.project().name : '';
  this.emit({ type: 'test', test: {
    id: test.id,
    title: test.title,
    project: project,
    expectedStatus: test.expectedStatus,
    status: result.status,
    retry: result.retry,
    duration: result.duration,
    errors: (result.errors || []).map(function(error) { return { message: error.message || String(error) }; }),
    attachments: (result.attachments || []).map(function(attachment) {
      return { name: attachment.name, contentType: attachment.contentType, path: attachment.path || '' };
    })
  } });
};

VisualReporter.prototype.onEnd = function(result) {
  this.emit({ type: 'end', status: result.status });
};

module.exports = VisualReporter;
