'use strict';

var catalog = require('./catalog');

var ROLE_ORDER = ['frontend', 'backend', 'contract', 'library', 'tool'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function diagnostic(code, severity, message, details) {
  var value = { code: code, severity: severity, message: message };
  if (details && Object.keys(details).length) value.details = details;
  return value;
}

function normalizeScope(profile, declared) {
  var requested = (declared || []).filter(Boolean);
  var diagnostics = [];
  if (requested.indexOf('project') !== -1 && requested.length !== 1) {
    diagnostics.push(diagnostic('scope-ambiguous', 'blocking',
      'affected-units must use project alone or explicit unit ids, not both.'));
    return { effectiveUnitIds: [], diagnostics: diagnostics, blocking: true };
  }

  var known = {};
  (profile.units || []).forEach(function(unit) { known[unit.id] = true; });
  if (requested.length === 1 && requested[0] === 'project') {
    return {
      effectiveUnitIds: Object.keys(known).sort(),
      diagnostics: diagnostics,
      blocking: false
    };
  }

  var seen = {};
  var effective = [];
  requested.forEach(function(id) {
    if (seen[id]) return;
    seen[id] = true;
    if (!known[id]) {
      diagnostics.push(diagnostic('affected-unit-unknown', 'blocking',
        'affected unit is not present in the exact Profile: ' + id + '.', { unitId: id }));
      return;
    }
    effective.push(id);
  });
  return { effectiveUnitIds: effective, diagnostics: diagnostics, blocking: diagnostics.length > 0 };
}

function addFocus(focuses, rule, reason) {
  var current = focuses[rule.focus];
  if (!current) {
    current = focuses[rule.focus] = {
      id: rule.focus,
      recommendedCapabilities: rule.capabilities.slice(),
      reasons: []
    };
  }
  current.reasons.push(reason);
}

function stableDiagnostics(values) {
  return values.sort(function(a, b) {
    var left = a.code + ':' + JSON.stringify(a.details || {}) + ':' + a.message;
    var right = b.code + ':' + JSON.stringify(b.details || {}) + ':' + b.message;
    return left.localeCompare(right);
  });
}

function mapAcs(acFacts, diagnostics) {
  var mappings = [];
  (acFacts || []).forEach(function(ac) {
    var capability = catalog.capabilityForVerification(ac.verification);
    if (!capability) {
      diagnostics.push(diagnostic('verification-unmapped', 'attention',
        'Acceptance Criteria uses an unsupported Verification value: ' + ac.verification + '.', { acId: ac.acId }));
      return;
    }
    mappings.push({
      acId: ac.acId,
      verification: ac.verification,
      verificationCapability: capability
    });
  });
  return mappings;
}

function collectFocus(profile, effectiveUnitIds, diagnostics) {
  var selected = {};
  effectiveUnitIds.forEach(function(id) { selected[id] = true; });
  var units = (profile.units || []).slice().sort(function(a, b) { return a.id.localeCompare(b.id); });
  var focuses = {};

  ROLE_ORDER.forEach(function(role) {
    units.forEach(function(unit) {
      if (!selected[unit.id] || unit.roles.indexOf(role) === -1) return;
      addFocus(focuses, catalog.roleRule(role), { kind: 'role', unitId: unit.id, role: role });
    });
  });

  units.forEach(function(unit) {
    if (!selected[unit.id] || unit.roles.indexOf('unknown') === -1) return;
    diagnostics.push(diagnostic('role-unknown', 'attention',
      'exact Profile keeps an unknown role without quality-policy inference: ' + unit.id + '.', { unitId: unit.id }));
  });

  (profile.relations || []).slice().sort(function(a, b) {
    return (a.from + ':' + a.to + ':' + a.kind).localeCompare(b.from + ':' + b.to + ':' + b.kind);
  }).forEach(function(relation) {
    var fromSelected = !!selected[relation.from];
    var toSelected = !!selected[relation.to];
    if (!fromSelected && !toSelected) return;
    if (!fromSelected || !toSelected) {
      diagnostics.push(diagnostic('related-unit-out-of-scope', 'attention',
        'related unit is outside affected scope: ' + relation.from + ' -> ' + relation.to + '.', {
          from: relation.from,
          to: relation.to,
          kind: relation.kind
        }));
      return;
    }
    var rule = catalog.relationRule(relation.kind);
    if (!rule) {
      diagnostics.push(diagnostic('relation-kind-unmapped', 'attention',
        'relation kind has no quality-policy mapping: ' + relation.kind + '.', {
          from: relation.from,
          to: relation.to,
          kind: relation.kind
        }));
      return;
    }
    addFocus(focuses, rule, {
      kind: 'relation',
      from: relation.from,
      to: relation.to,
      relationKind: relation.kind
    });
  });

  return Object.keys(focuses).map(function(id) { return focuses[id]; });
}

function blockedPlan(input, diagnostics) {
  var source = clone(input.source || {});
  source.profile = source.profile || null;
  source.declaredAffectedUnits = source.declaredAffectedUnits || [];
  source.effectiveAffectedUnits = [];
  return {
    schemaVersion: 1,
    policyVersion: catalog.POLICY_VERSION,
    source: source,
    acFacts: clone(input.acFacts || []),
    policyFocus: [],
    acMappings: [],
    e2eReadiness: null,
    diagnostics: stableDiagnostics(diagnostics),
    blocking: true
  };
}

function buildQualityPlan(input) {
  input = input || {};
  var diagnostics = (input.diagnostics || []).map(clone);
  if (!input.profile) {
    if (!diagnostics.some(function(item) {
      return item.code === 'profile-required' || item.code === 'profile-reference-invalid';
    })) {
      diagnostics.push(diagnostic('profile-required', 'blocking',
        'a confirmed exact Project Profile revision is required before quality policy can be projected.'));
    }
    return blockedPlan(input, diagnostics);
  }

  var scope = normalizeScope(input.profile, input.source && input.source.declaredAffectedUnits);
  diagnostics = diagnostics.concat(scope.diagnostics);
  if (input.blocking || scope.blocking) return blockedPlan(input, diagnostics);

  var source = clone(input.source || {});
  source.profile = source.profile || null;
  source.declaredAffectedUnits = source.declaredAffectedUnits || [];
  source.effectiveAffectedUnits = scope.effectiveUnitIds.slice();
  var acFacts = clone(input.acFacts || []);
  var acMappings = mapAcs(acFacts, diagnostics);
  var policyFocus = collectFocus(input.profile, scope.effectiveUnitIds, diagnostics);

  return {
    schemaVersion: 1,
    policyVersion: catalog.POLICY_VERSION,
    source: source,
    acFacts: acFacts,
    policyFocus: policyFocus,
    acMappings: acMappings,
    e2eReadiness: input.e2eReadiness || null,
    diagnostics: stableDiagnostics(diagnostics),
    blocking: false
  };
}

module.exports = {
  buildQualityPlan: buildQualityPlan,
  normalizeScope: normalizeScope
};
