const governanceContract = require('./governance-contract');

const MIGRATION_REQUIRED = 'SDD_AUTONOMY_MIGRATION_REQUIRED';
const LEGACY_FIELDS = Object.freeze(['APPROVAL_POLICY', 'CRUISE_ENABLED']);

function isMode(value) {
  return governanceContract.autonomyModes.indexOf(value) !== -1;
}

function projectState(values) {
  values = values || {};
  const legacyFields = LEGACY_FIELDS.filter(function(field) {
    return String(values[field] || '').trim() !== '';
  });
  const mode = String(values.AUTONOMY_MODE || '').trim();

  if (legacyFields.length) {
    return { ok: false, mode: '', issue: 'legacy', code: MIGRATION_REQUIRED, legacyFields: legacyFields };
  }
  if (!mode) {
    return { ok: false, mode: '', issue: 'missing', code: MIGRATION_REQUIRED, legacyFields: [] };
  }
  if (!isMode(mode)) {
    return { ok: false, mode: '', issue: 'invalid', code: MIGRATION_REQUIRED, legacyFields: [] };
  }
  return { ok: true, mode: mode, issue: '', legacyFields: [] };
}

module.exports = Object.freeze({
  MIGRATION_REQUIRED: MIGRATION_REQUIRED,
  LEGACY_FIELDS: LEGACY_FIELDS,
  isMode: isMode,
  projectState: projectState
});
