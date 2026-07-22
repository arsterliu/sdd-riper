'use strict';

var contract = require('./contract');
var playwrightTest = require('./adapters/playwright-test/manifest');

var REGISTRY = Object.freeze({ 'playwright-test': playwrightTest });

function resolveAdapter(adapterId) {
  var manifest = REGISTRY[adapterId];
  if (!manifest) {
    throw contract.verificationError('ADAPTER_NOT_REGISTERED', 'adapter is not registered: ' + adapterId, {
      adapterId: adapterId
    });
  }
  return manifest;
}

function requireCapability(manifest, capability) {
  if (!manifest || !Array.isArray(manifest.capabilities) || manifest.capabilities.indexOf(capability) === -1) {
    var code = capability === 'gate' ? 'CAPABILITY_NOT_GATE' : 'CAPABILITY_NOT_SUPPORTED';
    throw contract.verificationError(code, 'adapter capability is not available: ' + capability, {
      adapterId: manifest && manifest.id,
      capability: capability
    });
  }
  return manifest;
}

module.exports = {
  resolveAdapter: resolveAdapter,
  requireCapability: requireCapability
};
