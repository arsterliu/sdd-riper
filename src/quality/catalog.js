'use strict';

var POLICY_VERSION = '1';

var ROLE_RULES = {
  frontend: { focus: 'frontend-behavior', capabilities: ['unit-evidence', 'e2e-evidence'] },
  backend: { focus: 'backend-behavior', capabilities: ['unit-evidence', 'integration-evidence'] },
  contract: { focus: 'contract-compatibility', capabilities: ['integration-evidence'] },
  library: { focus: 'consumer-compatibility', capabilities: ['unit-evidence', 'integration-evidence'] },
  tool: { focus: 'tool-behavior', capabilities: ['unit-evidence', 'manual-evidence'] }
};

var RELATION_RULES = {
  'depends-on': { focus: 'cross-unit-boundary', capabilities: ['integration-evidence'] }
};

var VERIFICATION_CAPABILITIES = {
  unit: 'unit-evidence',
  integration: 'integration-evidence',
  e2e: 'e2e-evidence',
  manual: 'manual-evidence'
};

function cloneRule(rule) {
  if (!rule) return null;
  return { focus: rule.focus, capabilities: rule.capabilities.slice() };
}

function roleRule(role) {
  return cloneRule(ROLE_RULES[role]);
}

function relationRule(kind) {
  return cloneRule(RELATION_RULES[kind]);
}

function capabilityForVerification(verification) {
  return VERIFICATION_CAPABILITIES[verification] || null;
}

module.exports = {
  POLICY_VERSION: POLICY_VERSION,
  roleRule: roleRule,
  relationRule: relationRule,
  capabilityForVerification: capabilityForVerification
};
