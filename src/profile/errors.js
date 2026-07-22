'use strict';

class ProfileError extends Error {
  constructor(code, message, details, exitCode) {
    super(code + ': ' + message);
    this.name = 'ProfileError';
    this.code = code;
    this.details = details || {};
    this.exitCode = exitCode || 2;
  }
}

function profileError(code, message, details, exitCode) {
  return new ProfileError(code, message, details, exitCode);
}

module.exports = { ProfileError: ProfileError, profileError: profileError };
