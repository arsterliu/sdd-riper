'use strict';

var createReporter = require('../playwright-shared/reporter-lifecycle').createReporter;

module.exports = createReporter({
  errorMessage: 'SDD visual reporter requires outputFile and nonce',
  capability: 'visual-gate',
  mapTest: function(test, result) {
    var project = test.parent && typeof test.parent.project === 'function' ? test.parent.project().name : '';
    return {
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
    };
  }
});
