const crypto = require('crypto');

const STREAMLINED = 'streamlined-v1';
const LEGACY = 'legacy-v1';
const HIGH = new Set([
  'irreversible', 'data-migration', 'security', 'privacy', 'billing', 'auth',
  'compliance', 'public-api', 'persistent-schema'
]);
const MEDIUM = new Set(['cross-module', 'design-latitude', 'multi-scenario']);
const ADDITIONAL = new Set(['multi-step']);
const ALLOWED = new Set([...HIGH, ...MEDIUM, ...ADDITIONAL, 'none']);
const MODE_FLOOR = { micro: 0, lite: 1, standard: 2 };
const TIERS = ['low', 'medium', 'high'];

function section(content, heading) {
  const lines = String(content || '').split(/\r?\n/);
  const marker = '## ' + heading;
  const start = lines.findIndex(line => line.trim() === marker);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

function label(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = String(content || '').match(new RegExp('^' + escaped + ':[ \\t]*(.*)$', 'mi'));
  return found ? found[1].trim() : '';
}

function frontmatter(content, name) {
  const block = String(content || '').match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!block) return '';
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = block[1].match(new RegExp('^' + escaped + ':[ \\t]*["\\\']?([^"\\\'\\r\\n#]+)', 'm'));
  return found ? found[1].trim() : '';
}

function version(content) {
  return frontmatter(content, 'workflow-policy') || LEGACY;
}

function normalize(content) {
  return String(content || '').replace(/<!--[^]*?-->/g, '')
    .split(/\r?\n/).map(line => {
      const compact = line.trim().replace(/\s+/g, ' ')
        .replace(/^([A-Za-z][A-Za-z0-9 /&_-]*):\s*/, '$1: ');
      return compact.replace(/^Risk Signals: (.*)$/i, (_, values) =>
        'Risk Signals: ' + values.split(',').map(value => value.trim().toLowerCase()).sort().join(','));
    })
    .filter(Boolean).join('\n');
}

function digest(content) {
  return 'sha256:' + crypto.createHash('sha256').update(normalize(content), 'utf8').digest('hex');
}

function parseSignals(content) {
  const raw = label(section(content, 'Intake'), 'Risk Signals');
  if (!raw) return { raw, signals: [], issues: ['Risk Signals is required.'] };
  const signals = raw.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const issues = [];
  if (!signals.length) issues.push('Risk Signals is required.');
  const unknown = signals.filter(value => !ALLOWED.has(value));
  if (unknown.length) issues.push('Risk Signals contains unknown values: ' + [...new Set(unknown)].join(', ') + '.');
  if (new Set(signals).size !== signals.length) issues.push('Risk Signals contains duplicate values.');
  if (signals.includes('none') && signals.length > 1) issues.push('Risk Signals none must be used alone.');
  return { raw, signals, issues };
}

function evaluate(content, mode) {
  const policy = version(content);
  const parsed = parseSignals(content);
  const issues = parsed.issues.slice();
  if (policy !== STREAMLINED) issues.unshift('Unknown workflow-policy: ' + policy + '.');
  if (!Object.hasOwn(MODE_FLOOR, mode)) issues.push('Unknown Spec mode: ' + mode + '.');
  const hasHigh = parsed.signals.some(value => HIGH.has(value));
  const hasMedium = parsed.signals.some(value => MEDIUM.has(value));
  const level = Math.max(MODE_FLOOR[mode] || 0, hasHigh ? 2 : (hasMedium ? 1 : 0));
  const tier = TIERS[level];
  const flags = [];
  parsed.signals.forEach(value => {
    const flag = ({ 'data-migration': 'migration', 'persistent-schema': 'migration',
      auth: 'security', privacy: 'security', compliance: 'security' })[value] || value;
    if (HIGH.has(value) && !flags.includes(flag)) flags.push(flag);
  });
  return {
    version: policy, mode, tier, signals: parsed.signals, flags, issues,
    requiresDesign: tier === 'high' || parsed.signals.includes('design-latitude'),
    requiresLog: tier !== 'low' || parsed.signals.includes('multi-step'),
    requiresDesignReview: tier === 'high',
    requiresCompletionReview: tier !== 'low'
  };
}

function designDigest(designContent) {
  const body = String(designContent || '').replace(/^---\r?\n[^]*?\r?\n---\r?\n/, '');
  return digest(body);
}

function designReviewDigest(specContent, designContent) {
  const inputs = ['Intake', 'Research', 'Requirement Review', 'Findings', 'Open Questions',
    'Assumptions', 'Confirmed Requirement', 'Acceptance Criteria']
    .map(name => section(specContent, name));
  return digest(['streamlined-v1 design-review', ...inputs, designDigest(designContent)].join('\n'));
}

module.exports = { STREAMLINED, LEGACY, HIGH, MEDIUM, ALLOWED, section, label, frontmatter,
  version, normalize, digest, parseSignals, evaluate, designDigest, designReviewDigest };
