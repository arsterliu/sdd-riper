'use strict';

function VerificationError(code, message, details) {
  Error.call(this, message);
  this.name = 'VerificationError';
  this.message = message;
  this.code = code;
  this.details = details || {};
  if (Error.captureStackTrace) Error.captureStackTrace(this, VerificationError);
}
VerificationError.prototype = Object.create(Error.prototype);
VerificationError.prototype.constructor = VerificationError;

function fail(code, message, details) {
  throw new VerificationError(code, message, details);
}

module.exports = { VerificationError: VerificationError, fail: fail };
