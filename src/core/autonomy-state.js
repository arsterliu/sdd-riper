const crypto = require('crypto');
const labelFacts = require('./label-facts');
const workflowPolicy = require('./workflow-policy');

const START = '<!-- sdd-autonomy:start -->';
const END = '<!-- sdd-autonomy:end -->';

function section(content, name) {
  const lines = String(content || '').split(/\r?\n/);
  const heading = '## ' + name;
  const start = lines.findIndex(function(line) { return line.trim() === heading; });
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

function normalize(value) {
  return String(value || '').split(/\r?\n/).map(function(line) { return line.trim().replace(/\s+/g, ' '); })
    .filter(Boolean).join('\n');
}

function digest(value) {
  return 'sha256:' + crypto.createHash('sha256').update(normalize(value), 'utf8').digest('hex');
}

function withoutControlBlock(content) {
  const start = String(content || '').indexOf(START);
  const end = String(content || '').indexOf(END);
  return start >= 0 && end >= start ? content.slice(0, start) + content.slice(end + END.length) : String(content || '');
}

function canonical(content) {
  return withoutControlBlock(content).replace(/<!--[\s\S]*?-->/g, '').replace(/^Research Reviewed (?:By|At):.*$/gmi, '');
}

function confirmedRequirement(content) {
  const mode = workflowPolicy.frontmatter(content, 'mode') || 'standard';
  if (mode === 'standard') return section(content, 'Research').match(/^### Confirmed Requirement\s*\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/m)?.[1] || '';
  return section(content, 'Confirmed Requirement') ||
    (mode === 'lite' ? section(content, 'Research').match(/^### Confirmed Requirement\s*\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/m)?.[1] || '' : '');
}

function risksText(content) {
  const intake = section(content, 'Intake');
  const lines = intake.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === '### Risks');
  if (start !== -1) {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^###\s+\S/.test(lines[i])) { end = i; break; }
    }
    return lines.slice(start + 1, end).join('\n');
  }
  return workflowPolicy.label(intake, 'Risks');
}

function scopeSnapshot(content) {
  if (workflowPolicy.version(content) !== workflowPolicy.STREAMLINED) return digest(section(withoutControlBlock(content), 'Intake'));
  const body = canonical(content);
  return workflowPolicy.digest(['streamlined-v1 scope', section(body, 'Intake'), confirmedRequirement(body)].join('\n'));
}

function riskSnapshot(content) {
  if (workflowPolicy.version(content) !== workflowPolicy.STREAMLINED) {
    return digest(section(withoutControlBlock(content), 'Intake').match(/### Risks[\s\S]*?(?=^### |$)/mi)?.[0] || '');
  }
  const body = canonical(content);
  const signals = workflowPolicy.parseSignals(body).signals.slice().sort().join(',');
  return workflowPolicy.digest(['streamlined-v1 risk', signals, risksText(body)].join('\n'));
}
function planSnapshot(content) {
  const body = section(withoutControlBlock(content), 'Plan');
  return workflowPolicy.version(content) === workflowPolicy.STREAMLINED ? workflowPolicy.digest(body) : digest(body);
}
function researchSnapshot(content) {
  if (workflowPolicy.version(content) !== workflowPolicy.STREAMLINED) return digest(section(withoutControlBlock(content), 'Research'));
  const body = canonical(content);
  const pieces = [section(body, 'Intake'), section(body, 'Research')];
  ['Requirement Review', 'Findings', 'Open Questions', 'Assumptions', 'Confirmed Requirement']
    .forEach(name => pieces.push(section(body, name)));
  return workflowPolicy.digest(['streamlined-v1 research'].concat(pieces).join('\n'));
}
function innovateSnapshot(content) {
  const body = section(withoutControlBlock(content), 'Innovate Options');
  return workflowPolicy.version(content) === workflowPolicy.STREAMLINED ? workflowPolicy.digest(body) : digest(body);
}
function riskFlagsSnapshot(flags) { return digest((flags || []).slice().sort().join('\n')); }
function gateSnapshot(content, gate) {
  if (gate === 'Research') return researchSnapshot(content);
  if (gate === 'Innovate') return innovateSnapshot(content);
  return planSnapshot(content);
}

const LABELS = {
  'Event Type': 'eventType', 'Mode': 'mode', 'Gate': 'gate', 'Decision': 'decision',
  'Scope Digest': 'scopeDigest', 'Risk Snapshot': 'riskSnapshot', 'Plan Digest': 'planDigest',
  'Authorized Actors': 'authorizedActors', 'Authorized By': 'authorizedBy', 'Authorized At': 'authorizedAt',
  'Authorization Evidence': 'authorizationEvidence', 'Invalidated At': 'invalidatedAt', 'Invalidation Reason': 'invalidationReason'
};

function parseEvents(content) {
  const start = String(content || '').indexOf(START);
  const end = String(content || '').indexOf(END);
  if (start < 0 || end < start) return [];
  const body = content.slice(start, end);
  return body.split(/^### Event: /m).slice(1).map(function(block) {
    const lines = block.split(/\r?\n/);
    const event = { eventId: lines.shift().trim() };
    Object.keys(LABELS).forEach(function(label) { event[LABELS[label]] = ''; });
    lines.forEach(function(line) {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match && LABELS[match[1]]) event[LABELS[match[1]]] = match[2];
    });
    return event;
  });
}

function eventText(event) {
  const lines = ['### Event: ' + event.eventId];
  Object.keys(LABELS).forEach(function(label) { lines.push(label + ': ' + (event[LABELS[label]] || '')); });
  return lines.join('\n') + '\n\n';
}

function appendEvent(content, event) {
  content = String(content || '');
  if (content.indexOf(START) < 0 || content.indexOf(END) < 0) {
    content = content.replace(/\s*$/, '') + '\n\n' + START + '\n## Autonomy Control\nAutonomy Schema: 1\n\n' + END + '\n';
  }
  return content.replace(END, eventText(event) + END);
}

function frontmatter(content, field) {
  return workflowPolicy.frontmatter(content, field);
}

function resolve(content, options) {
  options = options || {};
  const mode = frontmatter(content, 'autonomy-mode');
  const source = frontmatter(content, 'autonomy-mode-source');
  const scope = scopeSnapshot(content);
  const risk = workflowPolicy.version(content) === workflowPolicy.STREAMLINED
    ? riskSnapshot(content) : (options.riskSnapshot || riskSnapshot(content));
  const plan = planSnapshot(content);
  const events = parseEvents(content);
  const approvedGates = [];
  let active = null;
  let taskAuthorization = null;
  let planActivation = null;
  let latestGateApprovalAt = '';
  events.forEach(function(event) {
    if (event.eventType === 'invalidation') {
      active = null;
      taskAuthorization = null;
      planActivation = null;
      latestGateApprovalAt = '';
      approvedGates.splice(0);
    }
    if (event.eventType === 'task_authorization' && event.decision === 'authorized') {
      taskAuthorization = event;
      active = event;
      planActivation = null;
    }
    if (event.eventType === 'plan_authorization' && event.decision === 'authorized') active = event;
    if (event.eventType === 'plan_activation' && event.decision === 'activated') planActivation = event;
    if (event.eventType === 'gate_approval' && event.decision === 'approved' && event.mode === mode &&
        event.scopeDigest === scope && event.riskSnapshot === risk &&
        event.planDigest === gateSnapshot(content, event.gate)) {
      const previous = approvedGates.indexOf(event.gate);
      if (previous !== -1) approvedGates.splice(previous, 1);
      approvedGates.push(event.gate);
      if (event.authorizedAt && (!latestGateApprovalAt || Date.parse(event.authorizedAt) > Date.parse(latestGateApprovalAt))) {
        latestGateApprovalAt = event.authorizedAt;
      }
    }
  });
  const approvedBy = labelFacts.sameLineLabelValue(content, 'Plan Approved By');
  const approvedAt = labelFacts.sameLineLabelValue(content, 'Approved At');
  const evidence = labelFacts.sameLineLabelValue(content, 'Gate Evidence');
  const planApproved = !!approvedAt && (/^human:[^:\s]+$/i.test(approvedBy) ||
    (mode === 'auto' && /^agent:[^:\s]+$/i.test(approvedBy) && !!evidence));
  let fresh = !!active && active.mode === mode && active.scopeDigest === scope && active.riskSnapshot === risk &&
    (active.eventType !== 'plan_authorization' || active.planDigest === plan);
  if (mode === 'auto' && taskAuthorization && planApproved) {
    fresh = fresh && !!planActivation && planActivation.mode === mode && planActivation.scopeDigest === scope &&
      planActivation.riskSnapshot === risk && planActivation.planDigest === plan;
  }
  let stopReason = '';
  if (!mode) stopReason = 'migration_required';
  else if ((mode === 'auto' || mode === 'supervised') && !fresh) {
    if (!active) stopReason = 'task_authorization_required';
    else if (active.scopeDigest !== scope) stopReason = 'scope_changed';
    else if (active.riskSnapshot !== risk) stopReason = 'risk_changed';
    else if (mode === 'auto' && taskAuthorization && planApproved && !planActivation) stopReason = 'plan_activation_required';
    else stopReason = 'authorization_stale';
  }
  return {
    mode: mode, modeSource: source, authorizationState: mode === 'human' ? 'not-applicable' : (fresh ? 'active' : 'required'),
    scopeDigest: scope, riskSnapshot: risk, planDigest: plan,
    authorizedActors: fresh ? active.authorizedActors.split(',').filter(Boolean) : [],
    stopReason: stopReason, approvedGates: approvedGates, events: events,
    taskAuthorization: taskAuthorization, planActivation: planActivation,
    activeAuthorization: fresh ? active : null,
    authorizationAt: mode === 'human' ? latestGateApprovalAt : (fresh && active ? active.authorizedAt : '')
  };
}

module.exports = { scopeSnapshot, riskSnapshot, riskFlagsSnapshot, planSnapshot, researchSnapshot, innovateSnapshot, gateSnapshot, parseEvents, appendEvent, resolve, START, END };
