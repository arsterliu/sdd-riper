const providerReadiness = require('../verification/readiness');
const artifactSnapshot = require('./artifact-snapshot');
const common = require('../../lib/common');

function governanceContract() {
  return require('./governance-contract');
}

function sectionText(content, heading) {
  const escaped = String(heading).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(content || '').match(new RegExp('^## ' + escaped + '\\s*\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))', 'm'));
  return match ? match[1] : '';
}

function firstRealLine(content) {
  return String(content || '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/).map(function(line) {
    return line.trim();
  }).find(function(line) {
    return line && !/^#+\s/.test(line) && !line.startsWith('|') && !/^[-:]+$/.test(line) && !/^[A-Za-z][A-Za-z0-9 /&_-]*:\s*$/.test(line);
  }) || '';
}

function planApprovalFacts(content, autonomyMode) {
  const approvedBy = artifactSnapshot.labelValue(content, 'Plan Approved By');
  const approvedAt = artifactSnapshot.labelValue(content, 'Approved At');
  const evidence = artifactSnapshot.labelValue(content, 'Gate Evidence');
  const agent = /^agent:[^:\s]+$/i.test(approvedBy);
  const human = /^human:[^:\s]+$/i.test(approvedBy);
  return {
    approvedBy: approvedBy,
    approvedAt: approvedAt,
    evidence: evidence,
    agent: agent,
    human: human,
    satisfied: !!approvedAt && (autonomyMode === 'auto'
      ? (human || (agent && !!evidence))
      : human)
  };
}

function acceptanceFacts(content, mode) {
  const section = sectionText(content, 'Acceptance Criteria');
  const lines = String(section || '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const blocks = [];
  let current = null;
  lines.forEach(function(line) {
    const match = line.trim().match(/^(?:#{2,6}\s+|[-*]\s*)?(AC-\d+)\b/i);
    if (match) {
      current = { id: match[1].toUpperCase(), lines: [line] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  });
  if (!blocks.length) {
    return {
      present: !!firstRealLine(section),
      blocks: [],
      issues: mode === 'micro' ? [] : ['Acceptance Criteria should include at least one AC-### item.']
    };
  }
  const issues = [];
  blocks.forEach(function(block) {
    if (!/^AC-\d{3}$/.test(block.id)) {
      issues.push('AC id must be zero-padded three digits (AC-###): ' + block.id + '. Non-three-digit ids get no AC Coverage evidence and block archive.');
    }
  });
  const normalizedBlocks = blocks.map(function(block) {
    const text = block.lines.join('\n');
    const verification = artifactSnapshot.labelValue(text, 'Verification');
    const automated = artifactSnapshot.labelValue(text, 'Automated');
    const test = artifactSnapshot.labelValue(text, 'Test');
    const manualEvidence = artifactSnapshot.labelValue(text, 'Manual Evidence');
    const scenarios = [];
    const scenarioRegex = /^Scenario:\s*(.+)$/gim;
    let scenario;
    while ((scenario = scenarioRegex.exec(text)) !== null) scenarios.push(scenario[1].trim());
    if (mode !== 'micro') {
      if (!verification) issues.push('Acceptance Criteria missing Verification for: ' + block.id + '.');
      if (/^yes$/i.test(automated) && !test) issues.push('Automated Acceptance Criteria require Test for: ' + block.id + '.');
      if (governanceContract().requiresProvider(verification) && !test && !manualEvidence) issues.push('E2E Acceptance Criteria require Test or Manual Evidence for: ' + block.id + '.');
      if (/\bmanual\b/i.test(verification) && !manualEvidence) issues.push('Manual Acceptance Criteria require Manual Evidence for: ' + block.id + '.');
    }
    return {
      id: block.id,
      verification: verification,
      automated: automated,
      test: test,
      manualEvidence: manualEvidence,
      scenarios: scenarios
    };
  });
  return { present: !!firstRealLine(section), blocks: normalizedBlocks, issues: issues };
}

function normalizeCoverageTestValue(value) {
  const original = String(value || '').trim();
  if (!original) return { test: '', issue: '' };
  const codeSpan = original.match(/^`([^`\r\n]+)`$/);
  const normalized = (codeSpan ? codeSpan[1] : original).trim();
  const commandLike = /^(?:npm|pnpm|yarn|node|npx|bun|pytest|python|go|cargo|mvn|gradle|make)\b/i.test(normalized) ||
    /\s--(?:\s|$)/.test(normalized);
  const multiPath = /[;,]\s*\S+/.test(normalized);
  const narrativeLike = /^(?:covered|verified|validated|tested|manual|manually|see|refer|evidence|handled|checked)\b/i.test(normalized) ||
    /^(?:已|由|见|参见|手工|人工|验证|覆盖)/.test(normalized);
  if (commandLike) return { test: normalized, issue: 'command' };
  if (multiPath) return { test: normalized, issue: 'multi-path' };
  if (narrativeLike) return { test: normalized, issue: 'narrative' };
  return { test: normalized, issue: '' };
}

function acCoverageRecords(executeLogContent) {
  const records = [];
  common.scanExecuteLog(executeLogContent).forEach(function(step) {
    let current = null;
    let coverageActive = false;
    let scenariosActive = false;
    step.lines.forEach(function(line) {
      if (/^AC Coverage:\s*$/.test(line)) {
        coverageActive = true;
        current = null;
        scenariosActive = false;
        return;
      }
      if (!coverageActive || !line.trim()) return;
      if (!line.startsWith(' ')) {
        coverageActive = false;
        current = null;
        scenariosActive = false;
        return;
      }
      const ac = line.match(/^  - (AC-\d{1,6}): (PASS|FAIL|SKIPPED)\s*$/);
      if (ac) {
        current = {
          id: ac[1],
          result: ac[2],
          malformedId: !/^AC-\d{3}$/.test(ac[1]),
          scenarios: [],
          test: '',
          method: '',
          reason: '',
          approvedBy: '',
          approvedAt: '',
          testIssue: ''
        };
        records.push(current);
        scenariosActive = false;
        return;
      }
      if (!current) return;
      if (/^    Scenarios:\s*$/.test(line)) {
        scenariosActive = true;
        return;
      }
      const field = line.match(/^    (Reason|Approved By|Approved At|Test|Method):\s*(.*)$/);
      if (field) {
        const key = field[1].toLowerCase();
        if (key === 'reason') current.reason = field[2].trim();
        if (key === 'approved by') current.approvedBy = field[2].trim();
        if (key === 'approved at') current.approvedAt = field[2].trim();
        if (key === 'test') {
          const normalizedTest = normalizeCoverageTestValue(field[2]);
          current.test = normalizedTest.test;
          current.testIssue = normalizedTest.issue;
        }
        if (key === 'method') current.method = field[2].trim();
        scenariosActive = false;
        return;
      }
      const scenario = scenariosActive && line.match(/^      - "([^"]+)": (PASS|FAIL)\s*$/);
      if (scenario) {
        current.scenarios.push({ name: scenario[1], result: scenario[2] });
        return;
      }
      if (/^    /.test(line)) scenariosActive = false;
    });
  });
  return records;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidIsoTimestamp(value) {
  const text = String(value || '');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):?(\d{2}))$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] ? Number(match[8]) : 0;
  const offsetMinute = match[9] ? Number(match[9]) : 0;
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return false;
  if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return false;
  return !Number.isNaN(Date.parse(text));
}

function coverageRecordMap(records) {
  const coverageMap = {};
  (records || []).forEach(function(record) {
    if (!record || !record.id) return;
    const existing = coverageMap[record.id];
    if (!existing) {
      coverageMap[record.id] = Object.assign({}, record, {
        scenarios: Array.isArray(record.scenarios) ? record.scenarios.slice() : []
      });
      return;
    }
    const latest = Object.assign({}, record);
    if (!latest.test) {
      latest.test = existing.test;
      latest.testIssue = existing.testIssue;
    }
    if (!latest.method) latest.method = existing.method;
    if (latest.result === 'SKIPPED' && existing.result === 'SKIPPED') {
      if (!latest.reason) latest.reason = existing.reason;
      if (!latest.approvedBy) latest.approvedBy = existing.approvedBy;
      if (!latest.approvedAt) latest.approvedAt = existing.approvedAt;
    }
    latest.scenarios = (existing.scenarios || []).slice();
    (record.scenarios || []).forEach(function(scenario) {
      if (!latest.scenarios.some(function(existingScenario) { return existingScenario.name === scenario.name; })) {
        latest.scenarios.push(scenario);
      }
    });
    coverageMap[record.id] = latest;
  });
  return coverageMap;
}

function acCoverageFacts(snapshot, acceptance) {
  return {
    declarations: acceptance.blocks.map(function(block) {
      return {
        id: block.id,
        verification: block.verification,
        test: block.test,
        scenarios: block.scenarios
      };
    }),
    records: acCoverageRecords(snapshot.executeLog && snapshot.executeLog.content || '')
  };
}

function coverageFacts(snapshot) {
  snapshot = snapshot || {};
  return acCoverageFacts(snapshot, acceptanceFacts(snapshot.content || '', snapshot.mode || 'standard'));
}

function archiveProviderReadiness() {
  return {
    state: 'ready',
    requiredProviders: [],
    missingProviders: [],
    issues: []
  };
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.keys(value).forEach(function(key) {
    freezeDeep(value[key]);
  });
  return Object.freeze(value);
}

function collectGateFacts(snapshot, options) {
  snapshot = snapshot || {};
  options = options || {};
  const inspectProviderReadiness = options.inspectProviderReadiness || function(currentSnapshot) {
    return providerReadiness.inspect(
      currentSnapshot.content || '',
      currentSnapshot.projectDir,
      currentSnapshot.specPath
    );
  };
  const providerFacts = snapshot.location !== 'archive' && snapshot.projectDir
    ? inspectProviderReadiness(snapshot)
    : archiveProviderReadiness();

  const acceptance = acceptanceFacts(snapshot.content || '', snapshot.mode || 'standard');
  return freezeDeep({
    location: snapshot.location,
    mode: snapshot.mode || 'standard',
    acceptance: acceptance,
    planApproval: planApprovalFacts(snapshot.content || '', snapshot.autonomyMode || 'supervised'),
    acCoverage: acCoverageFacts(snapshot, acceptance),
    providerReadiness: providerFacts
  });
}

module.exports = {
  collectGateFacts,
  hasSubstantiveContent: function(content) { return !!firstRealLine(content); },
  planApprovalFacts: planApprovalFacts,
  acCoverageRecords: acCoverageRecords,
  coverageRecordMap: coverageRecordMap,
  coverageFacts: coverageFacts,
  isValidIsoTimestamp: isValidIsoTimestamp
};
