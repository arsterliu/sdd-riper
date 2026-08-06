'use strict';

module.exports = Object.freeze({
  id: 'playwright-visual',
  verificationContractRange: '^1.0.0',
  runtime: Object.freeze({ kind: 'node', nodeRange: '>=18.0.0' }),
  transport: Object.freeze({ kind: 'process' }),
  capabilities: Object.freeze(['visual-gate']),
  providerConfigSchema: Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: Object.freeze(['adapter', 'workspaceRoot', 'packageRoot', 'config', 'projects'])
  }),
  testedToolRange: '>=1.42.0 <2.0.0',
  handshakeVersion: 1,
  statusModelVersion: 1
});
