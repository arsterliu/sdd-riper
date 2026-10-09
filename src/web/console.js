var state = {
  specs: [],
  counts: {},
  selectedId: '',
  scope: 'all',
  detailRequest: 0,
  projectRequest: 0,
  specsRequest: 0,
  artifactRequest: 0,
  reader: null,
  projectSwitch: Promise.resolve(),
  phase: 'all',
  search: '',
  sort: 'updated',
  detail: null,
  project: null,
  projectDirs: [],
  projectSummaries: [],
  specsPollTimer: null,
  boardPollTimer: null
};

var phases = [
  ['all', 'All'],
  ['research', 'Research'],
  ['innovate', 'Innovate'],
  ['design', 'Design'],
  ['acceptance', 'Acceptance'],
  ['plan', 'Plan'],
  ['execute', 'Execute'],
  ['challenge', 'Challenge'],
  ['learning', 'Learning'],
  ['archive_authorization', 'Awaiting Archive Authorization'],
  ['archived', 'Archived']
];

var narrowScreen = window.matchMedia ? window.matchMedia('(max-width: 700px)') : { matches: false };

var gateDefinitions = [
  ['research', 'Research', 'Confirmed requirement or intake baseline'],
  ['innovate', 'Innovate', 'Options or explicit skip reason'],
  ['design', 'Design', 'Technical design or design note'],
  ['acceptance', 'Acceptance', 'Observable acceptance criteria'],
  ['plan', 'Plan Gate', 'Configured approval gate, with Gate Evidence for agent approval'],
  ['executeLog', 'Execute Log', 'Execution facts recorded with AC Coverage'],
  ['completionVerification', 'Completion Verification', 'Four-axis self-check in Execute Log; formal AC Coverage belongs to execution steps'],
  ['learning', 'Learning', 'Reusable lesson recorded when required'],
  ['challengePass', 'Challenge PASS', 'Independent adversarial review passed']
];

var blockerText = {
  research: 'Research still needs a confirmed requirement or usable intake baseline.',
  innovate: 'Innovate needs options, or a documented skip reason in lite mode.',
  design: 'Design is missing or empty. Standard and lite specs need an external design artifact.',
  acceptance: 'Acceptance criteria are missing or incomplete.',
  plan: 'Plan gate is missing. Fill Plan Approved By and Approved At; agent approval needs Gate Evidence.',
  execute: 'Execute Log is missing or empty. Record the execution facts before Challenge.',
  learning: 'Learning Check is required. Record the reusable lesson before Archive.',
  archive_authorization: 'Completion gates pass. Explicit authorization from the current user is still required before Archive.',
  archived: 'This spec is archived.'
};

function qs(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value == null || value === '' ? '-' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function text(value) {
  return value == null || value === '' ? '-' : String(value);
}

function formatDate(value) {
  if (!value) return '-';
  var d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function storageProjectDirs() {
  try {
    var parsed = JSON.parse(localStorage.getItem('sdd-console-projects') || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

function saveProjectDirs() {
  localStorage.setItem('sdd-console-projects', JSON.stringify(state.projectDirs));
}

function addProjectDir(projectDir) {
  if (!projectDir) return;
  var exists = state.projectDirs.some(function(dir) {
    return dir.toLowerCase() === projectDir.toLowerCase();
  });
  if (!exists) {
    state.projectDirs.unshift(projectDir);
    saveProjectDirs();
  }
}

function removeProjectDir(projectDir) {
  state.projectDirs = state.projectDirs.filter(function(dir) {
    return dir.toLowerCase() !== projectDir.toLowerCase();
  });
  saveProjectDirs();
  renderProjectBoard();
  refreshProjectBoard();
}

function phaseTone(phase) {
  if (phase === 'archive_authorization') return 'waiting';
  if (phase === 'archived') return 'not-started';
  if (phase === 'plan') return 'waiting';
  return 'progress';
}

function validationTone(spec) {
  if (spec.validate.ok) return 'complete';
  if (spec.phase === 'archived') return 'not-started';
  if (spec.phase === 'plan') return 'waiting';
  return 'progress';
}

function readable(value) {
  value = String(value == null ? '' : value).replace(/_/g, ' ');
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '-';
}

function workStateValue(spec) {
  var value = spec && spec.workState;
  if (!value || typeof value !== 'object' || !value.id || !value.label) {
    return { id: 'unavailable', label: 'State unavailable', tone: 'not-started' };
  }
  return {
    id: String(value.id),
    label: String(value.label),
    tone: value.tone === 'complete' || value.tone === 'progress' || value.tone === 'waiting'
      ? value.tone : 'not-started'
  };
}

function gateValue(spec, key) {
  var workflowGate = {
    research: 'research',
    innovate: 'innovate',
    design: 'design',
    acceptance: 'acceptance',
    plan: 'plan',
    executeLog: 'execute',
    completionVerification: 'completion',
    learning: 'learning',
    challengePass: 'challenge'
  }[key];
  if (workflowGate && spec.workflow && spec.workflow.gates && spec.workflow.gates[workflowGate]) {
    return spec.workflow.gates[workflowGate].state === 'pass';
  }
  return !!spec.completion[key];
}

function gateStats(spec) {
  var total = gateDefinitions.length;
  var done = gateDefinitions.filter(function(gate) { return gateValue(spec, gate[0]); }).length;
  return { done: done, total: total };
}

function gateNotRequired(spec, key) {
  var artifacts = spec.artifacts || {};
  if (key === 'design') return !!(artifacts.design && artifacts.design.notRequired);
  if (key === 'executeLog') return !!(artifacts.executeLog && artifacts.executeLog.notRequired);
  if (key === 'challengePass') return !!(spec.workflow && spec.workflow.policyRequirements &&
    spec.workflow.policyRequirements.completionReview === false &&
    spec.workflow.challengeVerdict === 'NOT_REQUIRED');
  return false;
}

function gatePhase(key) {
  if (key === 'executeLog' || key === 'completionVerification') return 'execute';
  if (key === 'challengePass') return 'learning';
  return key;
}

function gateTone(spec, key) {
  if (gateNotRequired(spec, key)) return 'not-started';
  if (key === 'challengePass' && spec.workflow && spec.workflow.gates &&
      spec.workflow.gates.challenge && spec.workflow.gates.challenge.state === 'failed') return 'bad';
  if (gateValue(spec, key)) return 'complete';
  var phase = gatePhase(key);
  if (spec.phase === phase) return phase === 'plan' ? 'waiting' : 'progress';
  return 'not-started';
}

function previewUrl(specId, artifact) {
  return '/preview.html?spec=' + encodeURIComponent(specId) + '&artifact=' + encodeURIComponent(artifact);
}

function filteredSpecs() {
  var specs = ConsoleView.filterTasks(state.specs, state.search, state.scope).filter(function(spec) {
    return state.phase === 'all' || spec.phase === state.phase;
  });

  specs.sort(function(a, b) {
    if (state.sort === 'name') return text(a.taskName).localeCompare(text(b.taskName));
    if (state.sort === 'phase') return text(a.phase).localeCompare(text(b.phase)) || text(a.taskName).localeCompare(text(b.taskName));
    if (state.sort === 'issues') return (b.validate.issueCount || 0) - (a.validate.issueCount || 0);
    return text(b.updatedAt).localeCompare(text(a.updatedAt));
  });
  return specs;
}

function renderMetrics() {
  var total = state.specs.length;
  var active = state.specs.filter(function(spec) { return workStateValue(spec).id !== 'archived'; }).length;
  var needsRepair = state.specs.filter(function(spec) { return workStateValue(spec).id === 'needs_repair'; }).length;
  var awaitingAuthorization = state.specs.filter(function(spec) {
    return workStateValue(spec).id === 'awaiting_archive_authorization';
  }).length;
  qs('metric-total').textContent = total;
  qs('metric-active').textContent = active;
  qs('metric-blocked').textContent = needsRepair;
  qs('metric-ready').textContent = awaitingAuthorization;
}

function projectSpark(summary) {
  var counts = summary.counts || {};
  var complete = summary.awaitingArchiveAuthorization || 0;
  var progress = (counts.research || 0) + (counts.innovate || 0) + (counts.design || 0) +
    (counts.acceptance || 0) + (counts.execute || 0) + (counts.learning || 0);
  var waiting = counts.plan || 0;
  var notStarted = counts.archived || 0;
  return [
    '<span class="mini-gate waiting" title="awaiting archive authorization: ' + esc(complete) + '"></span>',
    '<span class="mini-gate progress" title="in progress: ' + esc(progress) + '"></span>',
    '<span class="mini-gate waiting" title="waiting approval: ' + esc(waiting) + '"></span>',
    '<span class="mini-gate not-started" title="archived: ' + esc(notStarted) + '"></span>'
  ].join('');
}

function renderProjectBoard() {
  var root = qs('project-board-list');
  root.innerHTML = '';
  qs('project-board-summary').textContent = '(' + state.projectDirs.length + ')';
  if (!state.projectDirs.length) {
    root.innerHTML = '<div class="empty-list"><strong>No projects tracked</strong><span>Choose a folder to add an SDD project to this board.</span></div>';
    return;
  }
  state.projectSummaries.forEach(function(summary) {
    var active = state.project && state.project.projectDir &&
      summary.projectDir.toLowerCase() === state.project.projectDir.toLowerCase();
    var card = document.createElement('div');
    card.className = 'project-card' + (active ? ' active' : '') + (summary.configured ? '' : ' invalid');
    card.innerHTML = [
      '<div class="project-card-head">',
      '<h3>' + esc(summary.name || summary.projectDir) + '</h3>',
      '<button type="button" data-remove="' + esc(summary.projectDir) + '">移除</button>',
      '</div>',
      '<div class="project-card-path">' + esc(summary.projectDir) + '</div>',
      summary.state === 'indexing' ? '<div class="project-card-path">Indexing...</div>' : '',
      '<div class="project-stats">',
      '<div><span>Total</span><strong>' + esc(summary.total || 0) + '</strong></div>',
      '<div><span>Active</span><strong>' + esc(summary.active || 0) + '</strong></div>',
      '<div><span>Awaiting Auth</span><strong>' + esc(summary.awaitingArchiveAuthorization || 0) + '</strong></div>',
      '<div><span>Gates</span><strong>' + esc(summary.issueCountLightweight ? 'Open' : (summary.issueCount || 0)) + '</strong></div>',
      '</div>',
      '<div class="phase-spark">' + projectSpark(summary) + '</div>',
      summary.error ? '<div class="project-card-path">' + esc(summary.error) + '</div>' : '',
      '<button type="button" class="project-load"' + (summary.configured ? '' : ' disabled') + '>载入 ' + esc(summary.name || summary.projectDir) + '</button>'
    ].join('');
    card.addEventListener('click', function(event) {
      var remove = event.target.getAttribute('data-remove');
      if (remove) {
        event.stopPropagation();
        removeProjectDir(remove);
        return;
      }
      if (summary.configured) setProject(summary.projectDir);
    });
    root.appendChild(card);
  });
}

function refreshProjectBoard(force) {
  force = !!force;
  if (!state.projectDirs.length) {
    state.projectSummaries = [];
    renderProjectBoard();
    return Promise.resolve();
  }
  return fetch('/api/projects/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectDirs: state.projectDirs, refresh: force })
  })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      state.projectSummaries = data.projects || [];
      renderProjectBoard();
      if (state.projectSummaries.some(function(project) { return project.state === 'indexing' || project.stale; })) {
        clearTimeout(state.boardPollTimer);
        state.boardPollTimer = setTimeout(function() { refreshProjectBoard(false); }, 800);
      }
    })
    .catch(function(err) {
      qs('project-board-list').innerHTML = '<div class="empty-list"><strong>Unable to refresh project board</strong><span>' + esc(err.message || err) + '</span></div>';
    });
}

function resetProjectView(message) {
  state.detailRequest++;
  state.specsRequest++;
  state.artifactRequest++;
  state.reader = null;
  qs('artifact-reader').hidden = true;
  qs('task-overview').hidden = false;
  state.specs = [];
  state.counts = {};
  state.selectedId = '';
  state.detail = null;
  qs('project-path').textContent = message || 'Select a project directory';
  qs('last-sync').textContent = '尚未同步';
  qs('spec-detail').classList.add('hidden');
  qs('empty-detail').classList.remove('hidden');
  qs('empty-detail').innerHTML = '<strong>' + esc(message || '尚未载入项目') + '</strong><span>选择项目后查看任务。</span>';
  renderProjectProfile(null);
  render();
}

function renderPhaseTabs() {
  var root = qs('phase-tabs');
  root.innerHTML = '';
  [['all', '全部'], ['active', '活动'], ['archived', '归档']].forEach(function(item) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'phase-tab' + (state.scope === item[0] ? ' active' : '');
    button.textContent = item[1];
    button.setAttribute('aria-pressed', String(state.scope === item[0]));
    button.addEventListener('click', function() {
      state.scope = item[0];
      render();
      if (narrowScreen.matches) qs('task-navigation-panel').open = true;
      var replacement = root.querySelectorAll('button')[['all', 'active', 'archived'].indexOf(item[0])];
      if (replacement) replacement.focus();
    });
    root.appendChild(button);
  });
  var filter = qs('phase-filter');
  if (!filter.options.length) filter.innerHTML = phases.map(function(item) {
    return '<option value="' + esc(item[0]) + '">' + esc(item[0] === 'all' ? '全部阶段' : ConsoleView.phaseLabel(item[0])) + '</option>';
  }).join('');
  filter.value = state.phase;
}

function renderMiniGates(spec) {
  return '<div class="mini-gates">' + gateDefinitions.map(function(gate) {
    return '<span class="mini-gate ' + gateTone(spec, gate[0]) + '"></span>';
  }).join('') + '</div>';
}

function renderSpecList() {
  var root = qs('spec-list');
  root.innerHTML = '';
  var specs = filteredSpecs();
  if (!specs.length) {
    var empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.innerHTML = '<strong>' + (state.specs.length ? '没有匹配的任务' : '当前项目暂无任务') + '</strong><span>可搜索任务名、版本或状态。</span>' +
      (state.search || state.scope !== 'all' || state.phase !== 'all' ? '<button type="button" id="empty-clear">清除筛选</button>' : '');
    root.appendChild(empty);
    if (qs('empty-clear')) qs('empty-clear').onclick = clearFilters;
    return;
  }
  specs.forEach(function(spec) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'spec-item' + (state.selectedId === spec.id ? ' active' : '');
    button.setAttribute('aria-current', String(state.selectedId === spec.id));
    button.innerHTML = [
      '<strong>' + esc(spec.taskName) + '</strong>',
      '<small>' + esc(spec.version) + ' · ' + esc(ConsoleView.workLabel(spec)) + '</small>',
      ConsoleView.isArchived(spec) ? '' : '<small>' + esc(ConsoleView.statusLabel(spec.status)) + ' · ' + esc(ConsoleView.phaseLabel(spec.phase)) + '</small>'
    ].join('');
    button.addEventListener('click', function() {
      loadDetail(spec.id, spec);
      if (narrowScreen.matches) {
        qs('task-navigation-panel').open = false;
        qs('detail-title').focus();
      }
    });
    root.appendChild(button);
  });
}

function nextBlocker(spec) {
  spec = spec || {};
  if (spec.phase === 'archived' || spec.phase === 'archive_authorization') return spec.phase;
  return spec.phase || 'research';
}

function gateEvidenceState(workflow) {
  if (!workflow) return '-';
  return workflow.gateEvidence ? 'present' : 'missing';
}

function renderBlocker(spec) {
  var workflow = spec.workflow || {};
  var archived = ConsoleView.isArchived(spec);
  var phase = spec.phase || 'research';
  var instructions = {
    research: ['确认目标与范围', '在 Spec 中明确需求、范围和风险。'],
    innovate: ['选择实现方案', '比较可行方案，记录选择与权衡。'],
    design: ['完善设计方案', '补全技术设计，使实现路径与验收要求一致。'],
    acceptance: ['明确验收标准', '记录可以观察和验证的完成条件。'],
    plan: ['确认实施计划', '阅读 Plan，并按当前协作方式取得批准。'],
    execute: ['记录实施结果', '按批准的计划实施，保存步骤结果和验证证据。'],
    challenge: ['完成独立审查', '请获授权的独立 reviewer 核查实现与验收证据。'],
    learning: ['完成学习检查', '记录本次任务需要保留的可复用规则。'],
    archive_authorization: ['等待归档授权', '完成条件已满足；归档仍需当前用户单独授权。']
  };
  var instruction = archived ? ['已归档 · 只读', '阅读历史制品；本记录不按当前规则重新评估门禁。'] : instructions[phase] || ['查看任务状态', '阅读 Spec 了解当前任务要求。'];
  if (!archived && workflow.stopReason && workflow.stopReason !== 'none' && workflow.stopReason !== 'archive_authorization') {
    instruction = ['处理推进条件', '当前流程已暂停。请阅读 Spec 与下方当前条件，按提示处理后继续。'];
  }
  var gate = workflow.gates && workflow.gates[phase];
  if (phase === 'execute' && gate && gate.state === 'pass') gate = workflow.gates.completion;
  var blockers = !archived && gate && Array.isArray(gate.blockers) ? gate.blockers : [];
  qs('next-blocker').classList.toggle('archived', archived);
  qs('next-blocker').innerHTML = '<div class="blocker-card"><div><span class="next-label">' + (archived ? '历史记录' : '下一步') + '</span>' +
    '<strong>' + esc(instruction[0]) + '</strong><p>' + esc(instruction[1]) + '</p></div>' +
    '<button id="read-next" class="primary-action" type="button"><img class="ui-icon rail-icon" src="/icons/file-text.png" alt="" width="20" height="20">' + (archived ? '阅读 Spec' : phase === 'plan' ? '阅读计划' : '阅读任务') + '</button></div>' +
    (blockers.length ? '<details class="current-requirements"><summary>当前条件 · ' + blockers.length + ' 项</summary><ul class="current-blockers">' + blockers.map(function(item) {
      return '<li>' + esc(item.message || item) + '</li>';
    }).join('') + '</ul></details>' : '');
  qs('read-next').onclick = function() { previewArtifact('spec', phase === 'plan' ? 'Plan' : 'Intake'); };
}

var RISK_FLAG_TONES = {
  security: 'risk-security',
  billing: 'risk-billing',
  migration: 'risk-migration',
  'public-api': 'risk-public-api',
  irreversible: 'risk-irreversible'
};

var RISK_FLAG_LABELS = {
  security: 'Security',
  billing: 'Billing',
  migration: 'Migration',
  'public-api': 'Public API',
  irreversible: 'Irreversible'
};

function renderRiskFlags(spec) {
  var workflow = spec.workflow || {};
  var flags = Array.isArray(workflow.riskFlags) ? workflow.riskFlags : [];
  var root = qs('risk-flags');
  root.innerHTML = '';
  if (!flags.length) {
    root.innerHTML = '<div class="risk-flags-row"><span class="pill not-started">No risk flags</span></div>';
    return;
  }
  root.innerHTML = '<div class="risk-flags-row">' + flags.map(function(flag) {
    var tone = RISK_FLAG_TONES[flag] || 'risk-default';
    var label = RISK_FLAG_LABELS[flag] || flag;
    return '<span class="risk-flag ' + tone + '">' + esc(label) + '</span>';
  }).join('') + '</div>';
}

function renderBlockers(spec) {
  var workflow = spec.workflow || {};
  var blockers = Array.isArray(workflow.blockers) ? workflow.blockers : [];
  var root = qs('blockers');
  root.innerHTML = '';
  if (!blockers.length) {
    root.innerHTML = '<div class="blockers-row"><span class="pill complete">No blockers</span></div>';
    return;
  }
  root.innerHTML = '<ul class="blockers-list">' + blockers.map(function(blocker) {
    return '<li class="blocker-item">' + esc(blocker) + '</li>';
  }).join('') + '</ul>';
}

function renderProviderReadiness(spec) {
  var root = qs('provider-readiness');
  var readiness = spec.workflow && spec.workflow.facts && spec.workflow.facts.providerReadiness || { state: 'ready' };
  var required = Array.isArray(readiness.requiredProviders) ? readiness.requiredProviders : [];
  var missing = Array.isArray(readiness.missingProviders) ? readiness.missingProviders : [];
  root.innerHTML = '<div class="blockers-row"><span class="pill ' +
    (readiness.state === 'ready' || readiness.state === 'configured' ? 'complete' : 'not-started') + '">' +
    esc(readiness.state || 'ready') + '</span><span> Required: ' + esc(required.join(', ') || 'none') +
    '; Missing: ' + esc(missing.join(', ') || 'none') + '</span></div>';
}

function verificationTone(value) {
  if (value === 'ready' || value === 'PASS' || value === 'fresh' || value === 'passed') return 'complete';
  if (value === 'configured' || value === 'configured-no-runs' || value === 'stale') return 'waiting';
  if (value === 'blocked' || value === 'FAIL' || value === 'BLOCKED' || value === 'failed') return 'bad';
  return 'not-started';
}

function verificationEmpty(title, message) {
  return '<div class="verification-empty"><strong>' + esc(title) + '</strong><span>' + esc(message) + '</span></div>';
}

function diagnosticHtml(values) {
  values = Array.isArray(values) ? values : [];
  if (!values.length) return '';
  return '<div class="projection-diagnostics">' + values.map(function(item) {
    item = item || {};
    return '<div class="projection-diagnostic"><code>' + esc(item.code || 'attention') + '</code>' +
      '<span>' + esc(item.message || 'No additional detail is available.') + '</span>' +
      (item.recovery ? '<small>' + esc(item.recovery) + '</small>' : '') + '</div>';
  }).join('') + '</div>';
}

function profileTone(state) {
  if (state === 'confirmed') return 'complete';
  if (state === 'missing') return 'waiting';
  if (state === 'invalid') return 'bad';
  return 'not-started';
}

function renderProjectProfile(info) {
  var root = qs('project-profile');
  var view = info && info.profile;
  if (!view || view.schemaVersion !== 1) {
    root.innerHTML = '<div class="project-profile-head"><div><h2>Project Profile</h2><p>Read-only project context</p></div>' +
      '<span class="pill not-started">Unavailable</span></div>' +
      '<div class="projection-empty">Load an initialized project to inspect its confirmed Profile summary.</div>';
    return;
  }
  var units = Array.isArray(view.units) ? view.units : [];
  root.innerHTML = [
    '<div class="project-profile-head"><div><h2>Project Profile</h2><p>Read-only project context</p></div>',
    '<span class="pill ' + profileTone(view.state) + '">' + esc(readable(view.state)) + '</span></div>',
    '<div class="profile-summary-grid">',
    '<div><span>Revision</span><strong>' + esc(view.revision || '-') + '</strong></div>',
    '<div><span>Digest</span><strong>' + esc(view.digest || '-') + '</strong></div>',
    '<div><span>Units</span><strong>' + esc(view.unitCount || 0) + '</strong></div>',
    '<div><span>Relations</span><strong>' + esc(view.relationCount || 0) + '</strong></div>',
    '</div>',
    units.length ? '<div class="profile-units">' + units.map(function(unit) {
      return '<div class="profile-unit"><strong>' + esc(unit.id) + '</strong><span>' + esc((unit.roles || []).join(', ') || 'no roles') + '</span></div>';
    }).join('') + '</div>' : '',
    diagnosticHtml(view.diagnostics)
  ].join('');
}

function qualityTone(state) {
  if (state === 'available') return 'complete';
  if (state === 'blocking') return 'waiting';
  if (state === 'not_applicable') return 'not-started';
  return 'bad';
}

function qualityStateLabel(state) {
  if (state === 'not_applicable') return 'Not applicable';
  return readable(state);
}

function qualitySourceHtml(source) {
  source = source || {};
  var declared = Array.isArray(source.declaredAffectedUnits) ? source.declaredAffectedUnits : [];
  var effective = Array.isArray(source.effectiveAffectedUnits) ? source.effectiveAffectedUnits : [];
  if (!source.profileRevision && !source.profileDigest && !declared.length && !effective.length) return '';
  return '<div class="quality-source"><strong>Exact Profile input</strong><dl>' +
    '<dt>Revision</dt><dd>' + esc(source.profileRevision || '-') + '</dd>' +
    '<dt>Digest</dt><dd>' + esc(source.profileDigest || '-') + '</dd>' +
    '<dt>Declared units</dt><dd>' + esc(declared.join(', ') || 'none') + '</dd>' +
    '<dt>Effective units</dt><dd>' + esc(effective.join(', ') || 'none') + '</dd>' +
    '</dl></div>';
}

function qualityFocusHtml(values) {
  values = Array.isArray(values) ? values : [];
  if (!values.length) return '';
  return '<div class="quality-group"><h4>Policy focus</h4><div class="quality-focus-list">' + values.map(function(item) {
    item = item || {};
    var reasons = (item.reasons || []).map(function(reason) {
      if (reason.kind === 'role') return reason.unitId + ' / ' + reason.role;
      if (reason.kind === 'relation') return reason.from + ' → ' + reason.to + ' / ' + reason.relationKind;
      return '';
    }).filter(Boolean);
    return '<div class="quality-focus"><strong>' + esc(item.id || '-') + '</strong><span>' +
      esc((item.recommendedCapabilities || []).join(', ') || 'no capabilities') + '</span>' +
      (reasons.length ? '<small>' + esc(reasons.join('; ')) + '</small>' : '') + '</div>';
  }).join('') + '</div></div>';
}

function qualityAcHtml(values, mappings) {
  values = Array.isArray(values) ? values : [];
  mappings = Array.isArray(mappings) ? mappings : [];
  if (!values.length && !mappings.length) return '';
  return '<div class="quality-group"><h4>Acceptance mapping</h4><div class="quality-scroll"><table class="quality-table"><thead><tr>' +
    '<th>AC</th><th>Verification</th><th>Provider</th><th>Capability</th></tr></thead><tbody>' +
    values.map(function(fact) {
      fact = fact || {};
      var mapping = mappings.find(function(item) { return item && item.acId === fact.acId; }) || {};
      return '<tr><th>' + esc(fact.acId || '-') + '</th><td>' + esc(fact.verification || '-') + '</td><td>' +
        esc(fact.provider || '-') + '</td><td>' + esc(mapping.verificationCapability || '-') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

function qualityReadinessHtml(readiness) {
  if (!readiness) return '';
  return '<div class="quality-group"><h4>E2E readiness</h4><div class="quality-readiness"><span class="pill ' +
    verificationTone(readiness.state) + '">' + esc(readiness.state || 'unknown') + '</span><span>Required: ' +
    esc((readiness.requiredProviders || []).join(', ') || 'none') + '; Missing: ' +
    esc((readiness.missingProviders || []).join(', ') || 'none') + '</span>' +
    ((readiness.issues || []).length ? '<small>' + esc(readiness.issues.join('; ')) + '</small>' : '') + '</div></div>';
}

function renderQualityPlan(spec) {
  var root = qs('quality-plan');
  var view = spec && spec.qualityPlan;
  if (!view || view.schemaVersion !== 1) {
    root.innerHTML = '<div class="projection-empty"><strong>Quality Plan unavailable</strong><span>Quality details are loaded only for the selected Spec.</span></div>';
    return;
  }
  root.innerHTML = [
    '<div class="quality-overview"><div><strong>Current Quality Plan</strong><span>Derived from the selected Spec only</span></div>',
    '<span class="pill ' + qualityTone(view.state) + '">' + esc(qualityStateLabel(view.state)) + '</span></div>',
    view.policyVersion ? '<div class="quality-policy-version">Policy version: ' + esc(view.policyVersion) + '</div>' : '',
    qualitySourceHtml(view.source),
    qualityFocusHtml(view.policyFocus),
    qualityAcHtml(view.acFacts, view.acMappings),
    qualityReadinessHtml(view.e2eReadiness),
    diagnosticHtml(view.diagnostics)
  ].join('');
}

function renderVerificationEvidence(spec) {
  var view = spec.verification;
  var summaryRoot = qs('verification-summary');
  var runsRoot = qs('verification-runs');
  var matrixRoot = qs('verification-matrix');
  var detailsRoot = qs('verification-details');
  if (!view) {
    summaryRoot.innerHTML = verificationEmpty('Loading evidence', 'Verification details are loaded only for the selected Spec.');
    runsRoot.innerHTML = matrixRoot.innerHTML = detailsRoot.innerHTML = '';
    return;
  }
  var providers = Array.isArray(view.providers) ? view.providers : [];
  if (!providers.length) {
    var requiredMessage = view.state === 'required'
      ? 'A referenced Provider is not configured. Ask the agent to run verify init, then reload this page.'
      : 'This Spec does not reference an E2E Provider.';
    summaryRoot.innerHTML = verificationEmpty(view.state === 'required' ? 'Provider required' : 'No Provider required', requiredMessage);
    runsRoot.innerHTML = matrixRoot.innerHTML = detailsRoot.innerHTML = '';
    return;
  }
  summaryRoot.innerHTML = '<div class="verification-provider-grid">' + providers.map(function(provider) {
    return [
      '<article class="verification-provider-card">',
      '<div class="verification-card-head"><strong>' + esc(provider.id) + '</strong><span class="pill ' + verificationTone(provider.readiness) + '">' + esc(provider.readiness) + '</span></div>',
      '<dl><dt>Adapter</dt><dd>' + esc(provider.adapter) + '</dd><dt>Config</dt><dd>' + esc(provider.config) + '</dd>',
      '<dt>Package</dt><dd>' + esc(provider.packageRoot) + '</dd><dt>Projects</dt><dd>' + esc((provider.projects || []).join(', ')) + '</dd>',
      '<dt>Tool</dt><dd>' + esc(provider.toolVersion || 'not resolved') + '</dd></dl>',
      (provider.issues || []).map(function(issue) { return '<p class="verification-issue">' + esc(issue) + '</p>'; }).join(''),
      '</article>'
    ].join('');
  }).join('') + '</div>';

  var allRuns = [];
  providers.forEach(function(provider) {
    (provider.runs || []).forEach(function(run) { allRuns.push({ provider: provider.id, run: run }); });
  });
  if (!allRuns.length) {
    runsRoot.innerHTML = verificationEmpty('Configured, no Runs', 'The Provider is configured. Ask the agent to execute the formal verification gate.');
    detailsRoot.innerHTML = '';
  } else {
    runsRoot.innerHTML = '<h4>Run history</h4><div class="verification-scroll"><table class="verification-table"><thead><tr>' +
      '<th>Provider</th><th>Run</th><th>Created</th><th>Status</th><th>Gate</th><th>Freshness</th><th>Reasons</th></tr></thead><tbody>' +
      allRuns.map(function(item) {
        var run = item.run;
        return '<tr><td>' + esc(item.provider) + '</td><td><code>' + esc(run.runId) + '</code></td><td>' + esc(formatDate(run.createdAt)) +
          '</td><td><span class="pill ' + verificationTone(run.status) + '">' + esc(run.status) + '</span></td><td><span class="pill ' +
          verificationTone(run.gateDecision) + '">' + esc(run.gateDecision) + '</span></td><td><span class="pill ' + verificationTone(run.freshness) + '">' +
          esc(run.freshness) + '</span></td><td>' + esc((run.freshnessReasons || []).join(', ') || 'none') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    detailsRoot.innerHTML = '<h4>Diagnostics &amp; attachments</h4><div class="verification-detail-list">' + allRuns.map(function(item) {
      var run = item.run;
      var diagnostics = (run.diagnostics || []).map(function(diagnostic) {
        return '<li><code>' + esc(diagnostic.code) + '</code> ' + esc(diagnostic.message) + '</li>';
      }).join('');
      var attachments = (run.attachments || []).map(function(attachment) {
        return '<li><strong>' + esc(attachment.name) + '</strong> ' + esc(attachment.mediaType) + ' · ' + esc(attachment.size) +
          ' bytes · <code>' + esc(attachment.sha256) + '</code> · <code>' + esc(attachment.path) + '</code></li>';
      }).join('');
      return '<details><summary>' + esc(item.provider + ' / ' + run.runId) + '</summary>' +
        (diagnostics ? '<h5>Diagnostics</h5><ul>' + diagnostics + '</ul>' : '<p>No diagnostics.</p>') +
        (attachments ? '<h5>Attachments</h5><ul>' + attachments + '</ul>' : '<p>No attachments.</p>') + '</details>';
    }).join('') + '</div>';
  }

  matrixRoot.innerHTML = providers.map(function(provider) {
    var matrix = provider.matrix || { acIds: [], projects: [], cells: [] };
    if (!matrix.acIds.length || !matrix.projects.length) return verificationEmpty('No matrix targets', 'No AC × project targets are available.');
    return '<h4>' + esc(provider.id) + ' coverage matrix</h4><div class="verification-scroll"><table class="verification-table verification-matrix-table"><thead><tr><th>Acceptance</th>' +
      matrix.projects.map(function(project) { return '<th>' + esc(project) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      matrix.acIds.map(function(acId) {
        return '<tr><th>' + esc(acId) + '</th>' + matrix.projects.map(function(project) {
          var cell = matrix.cells.find(function(candidate) { return candidate.acId === acId && candidate.project === project; }) || { state: 'missing', runId: '' };
          return '<td><span class="pill ' + verificationTone(cell.state) + '">' + esc(cell.state) + '</span>' +
            (cell.runId ? '<small>' + esc(cell.runId) + '</small>' : '') + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }).join('');
}

function renderDesignMethod(spec) {
  var workflow = spec.workflow || {};
  var dm = workflow.designMethod || {};
  var root = qs('design-method');
  root.innerHTML = '';
  if (!dm.applies) {
    root.innerHTML = '<div class="design-method-row"><span class="pill not-started">Not applicable</span> <span>' + esc((dm.notes && dm.notes[0]) || 'micro mode does not use standalone design methodology') + '</span></div>';
    return;
  }
  var html = '<div class="design-method-row">';
  if (dm.methods && dm.methods.length) {
    html += '<div class="dm-group"><strong>Methods</strong>';
    dm.methods.forEach(function(m) { html += '<span class="dm-tag">' + esc(m) + '</span>'; });
    html += '</div>';
  }
  if (dm.focusFields && dm.focusFields.length) {
    html += '<div class="dm-group"><strong>Focus Fields</strong>';
    dm.focusFields.forEach(function(f) { html += '<span class="dm-tag">' + esc(f) + '</span>'; });
    html += '</div>';
  }
  if (dm.notes && dm.notes.length) {
    html += '<div class="dm-group"><strong>Notes</strong><ul>';
    dm.notes.forEach(function(n) { html += '<li>' + esc(n) + '</li>'; });
    html += '</ul></div>';
  }
  html += '</div>';
  root.innerHTML = html;
}

function renderLearningTriggers(spec) {
  var completion = spec.completion || {};
  var learningArtifact = completion.learningArtifact || {};
  var triggers = Array.isArray(learningArtifact.triggers) ? learningArtifact.triggers : [];
  var required = !!completion.learningRequired;
  var root = qs('learning-triggers');
  root.innerHTML = '';
  if (!required) {
    root.innerHTML = '<div class="learning-triggers-row"><span class="pill not-started">Not required</span> <span>Learning Record is not required for current archive signals</span></div>';
    return;
  }
  var html = '<div class="learning-triggers-row"><strong>Learning required</strong>';
  if (triggers.length) {
    html += '<ul class="learning-triggers-list">';
    triggers.forEach(function(t) { html += '<li class="learning-trigger-item">' + esc(t) + '</li>'; });
    html += '</ul>';
  }
  html += '</div>';
  root.innerHTML = html;
}

function challengeVerdictTone(verdict) {
  if (!verdict) return 'not-started';
  if (verdict === 'PASS') return 'complete';
  if (verdict === 'PASS_WITH_CONCERNS') return 'waiting';
  if (verdict.indexOf('FAIL_') === 0) return 'bad';
  return 'not-started';
}

function renderChallengeVerdict(spec) {
  var workflow = spec.workflow || {};
  var verdict = workflow.facts && workflow.facts.challenge && workflow.facts.challenge.verdict || '';
  var backtrack = workflow.backtrackTarget || '';
  var root = qs('challenge-verdict');
  root.innerHTML = '';
  var tone = challengeVerdictTone(verdict);
  var html = '<div class="challenge-verdict-row">';
  html += '<strong>Challenge</strong> ';
  html += '<span class="pill ' + tone + '">' + esc(verdict || (ConsoleView.isArchived(spec) ? '历史记录' : '尚未记录独立审查结果')) + '</span>';
  if (verdict.indexOf('FAIL_') === 0 && backtrack) {
    html += ' <span class="backtrack-target">Backtrack: ' + esc(backtrack) + '</span>';
  }
  html += '</div>';
  if (verdict && workflow.challengeSummary) html += '<p class="challenge-summary">' + esc(workflow.challengeSummary) + '</p>';
  root.innerHTML = html;
}

var STOP_REASON_TONES = {
  pass: 'complete',
  max_iterations: 'waiting',
  human_required: 'bad',
  budget_exhausted: 'waiting',
  archive_authorization: 'waiting',
  continue: 'progress'
};

var STOP_REASON_LABELS = {
  pass: 'Pass',
  max_iterations: 'Max iterations',
  human_required: 'Human required',
  budget_exhausted: 'Budget exhausted',
  archive_authorization: 'Archive authorization required',
  continue: 'Continue'
};

function renderCruiseRun(spec) {
  var workflow = spec.workflow || {};
  var run = spec.cruiseRun || {};
  var root = qs('cruise-run');
  root.innerHTML = '';
  var enabled = workflow.autonomyMode !== 'human';
  var maxIter = workflow.maxIterations || 5;
  if (!enabled && !run.count) {
    root.innerHTML = '<div class="cruise-run-row"><span class="pill not-started">Human</span> <span>Human-guided workflow</span></div>';
    return;
  }
  var html = '<div class="cruise-run-row">';
  html += '<div class="cruise-meta"><span class="cruise-label">Enabled</span><span class="pill ' + (enabled ? 'progress' : 'not-started') + '">' + esc(enabled ? 'true' : 'false') + '</span></div>';
  html += '<div class="cruise-meta"><span class="cruise-label">Max iterations</span><span>' + esc(maxIter) + '</span></div>';
  if (run.count) {
    var latest = run.latest || {};
    var stopReason = latest.stopReason || '';
    var stopTone = STOP_REASON_TONES[stopReason] || 'not-started';
    var stopLabel = STOP_REASON_LABELS[stopReason] || stopReason;
    html += '<div class="cruise-latest">';
    html += '<div class="cruise-meta"><span class="cruise-label">Latest run</span><span>#' + esc(latest.iteration || '-') + ' / ' + esc(latest.driver || '-') + '</span></div>';
    html += '<div class="cruise-meta"><span class="cruise-label">Verdict</span><span class="pill ' + challengeVerdictTone(latest.challengeVerdict) + '">' + esc(latest.challengeVerdict || '-') + '</span></div>';
    html += '<div class="cruise-meta"><span class="cruise-label">Stop reason</span><span class="pill ' + stopTone + '">' + esc(stopLabel) + '</span></div>';
    html += '</div>';
    html += '<div class="cruise-meta"><span class="cruise-label">Total runs</span><span>' + esc(run.count) + '</span></div>';
    if (run.malformedCount) {
      html += '<div class="cruise-meta"><span class="cruise-label">Corrupted entries</span><span class="pill bad">' + esc(run.malformedCount) + '</span></div>';
    }
  } else if (enabled) {
    html += '<div class="cruise-meta"><span class="pill not-started">No runs recorded</span></div>';
  }
  html += '</div>';
  root.innerHTML = html;
}

var AC_COVERAGE_TONES = {
  missing: 'not-started',
  pass: 'complete',
  fail: 'bad',
  skipped: 'waiting',
  invalid: 'bad'
};

var AC_COVERAGE_DIAGNOSTICS = {
  'ac-coverage-records-missing': true,
  'ac-coverage-invalid-evidence': true,
  'ac-coverage-skip-approval-incomplete': true,
  'ac-coverage-unavailable': true
};

function renderAcCoverage(spec) {
  var root = qs('ac-coverage');
  root.innerHTML = '';
  var coverage = spec && spec.acCoverage;
  if (!coverage || coverage.schemaVersion !== 1 || !Array.isArray(coverage.items) || !Array.isArray(coverage.diagnostics)) {
    root.innerHTML = '<div class="ac-coverage-row"><span class="pill not-started">暂无结构化 Coverage 数据</span> <span>无法安全显示 AC Coverage 状态</span></div>';
    return;
  }
  var labels = {
    missing: 'Missing',
    pass: 'Pass',
    fail: 'Fail',
    skipped: 'Skipped',
    invalid: 'Invalid'
  };
  var html = '<div class="ac-coverage-summary">';
  if (coverage.completionState === 'missing') {
    html += '<div class="ac-coverage-item"><span class="pill not-started">Coverage records missing</span></div>';
  }
  var seenAcIds = {};
  coverage.items.forEach(function(item) {
    item = item || {};
    var acId = String(item.acId || '').toUpperCase();
    if (!/^AC-\d+$/.test(acId) || seenAcIds[acId] || !Object.prototype.hasOwnProperty.call(AC_COVERAGE_TONES, item.state)) return;
    seenAcIds[acId] = true;
    var itemState = item.state;
    var approval = item.skipApprovalState === 'approved' ? 'Skip approved' :
      item.skipApprovalState === 'incomplete' ? 'Skip approval incomplete' : '';
    html += '<div class="ac-coverage-item"><span class="pill ' + AC_COVERAGE_TONES[itemState] + '">' +
      esc(acId) + '</span> <span>' + labels[itemState] + (approval ? ' — ' + approval : '') + '</span></div>';
  });
  var seenDiagnosticCodes = {};
  coverage.diagnostics.forEach(function(diagnostic) {
    if (!diagnostic || !AC_COVERAGE_DIAGNOSTICS[diagnostic.code] || seenDiagnosticCodes[diagnostic.code]) return;
    seenDiagnosticCodes[diagnostic.code] = true;
    html += '<div class="ac-coverage-item ac-coverage-warning"><span class="pill progress">⚠</span> <span>' + esc(diagnostic.code) + '</span></div>';
  });
  html += '</div>';
  root.innerHTML = html;
}

function renderGateList(spec) {
  if (spec.status === 'archived' || spec.phase === 'archived') {
    qs('gate-score').textContent = '历史记录';
    qs('gate-list').innerHTML = '<p>归档记录不按当前规则重新评估门禁。</p>';
    return;
  }
  spec = spec || {};
  spec.completion = spec.completion || {};
  var root = qs('gate-list');
  root.innerHTML = '';
  var stats = gateStats(spec);
  qs('gate-score').textContent = stats.done + ' of ' + stats.total + ' gates resolved';
  gateDefinitions.forEach(function(gate) {
    var key = gate[0];
    var done = gateValue(spec, key);
    var tone = gateTone(spec, key);
    var row = document.createElement('div');
    row.className = 'gate';
    var description = gate[2];
    if (key === 'design' && spec.artifacts && spec.artifacts.design && spec.artifacts.design.notRequired) {
      description = 'Not required by this task\'s workflow policy';
    } else if (key === 'executeLog' && spec.artifacts && spec.artifacts.executeLog && spec.artifacts.executeLog.notRequired) {
      description = 'Verification is recorded in Spec';
    } else if (key === 'completionVerification' && spec.artifacts && spec.artifacts.executeLog && spec.artifacts.executeLog.notRequired) {
      description = 'Fresh verification recorded in Spec';
    } else if (key === 'challengePass' && gateNotRequired(spec, key)) {
      description = 'Independent review is not required by this task\'s risk';
    }
    row.innerHTML = [
      '<div><strong>' + esc(gate[1]) + '</strong><small>' + esc(description) + '</small></div>',
      '<span class="pill ' + tone + '">' + (gateNotRequired(spec, key) ? 'Not required' : done ? 'Done' : tone === 'bad' ? 'Failed' : tone === 'waiting' ? 'Approval' : tone === 'progress' ? 'Current' : 'Not started') + '</span>'
    ].join('');
    root.appendChild(row);
  });
}

function artifactHtml(name, type, artifact, readOnly) {
  var icon = type === 'design' ? 'edit-3' : type === 'learning' ? 'book-open' : 'file-text';
  var title = '<strong><img class="ui-icon artifact-icon" src="/icons/' + icon + '.png" alt="" width="24" height="24">' + esc(name) + '</strong>';
  if (artifact && artifact.notRequired && !artifact.exists) {
    var note = name === 'Design'
      ? '根据任务风险与设计选择，按需创建'
      : name === 'Execute Log' ? '验证记录保存在 Spec'
      : '当前无需 Learning Record';
    return [
      '<div class="artifact">',
      '<div class="artifact-top">' + title + '<span class="pill not-started">按需</span></div>',
      '<div class="path">' + esc(note) + '</div>',
      '<div class="artifact-actions">',
      '<button type="button" disabled>阅读</button>',
      '</div>',
      '</div>'
    ].join('');
  }
  var exists = artifact && artifact.exists;
  var hasContent = artifact && artifact.hasContent;
  var tone = hasContent ? 'complete' : exists ? 'progress' : 'not-started';
  var label = hasContent ? '可阅读' : exists ? '草稿' : '未创建';
  return [
    '<div class="artifact">',
    '<div class="artifact-top">' + title + '<span class="pill ' + tone + '">' + esc(label) + '</span></div>',
    '<div class="path">' + esc(artifact && (artifact.relativePath || artifact.ref) || '尚未创建制品') + '</div>',
    '<div class="artifact-actions">',
    '<button data-preview-artifact="' + esc(type) + '" type="button"' + (exists ? '' : ' disabled') + '>阅读</button>',
    readOnly ? '' : '<button data-open-artifact="' + esc(type) + '" type="button"' + (exists ? '' : ' disabled') + '>打开文件</button>',
    '</div>',
    '</div>'
  ].join('');
}

function renderArtifacts(spec) {
  var artifacts = spec.artifacts || {};
  var readOnly = ConsoleView.isArchived(spec);
  qs('artifact-list').innerHTML = [
    artifactHtml('Spec', 'spec', {
      exists: !!spec.relativePath,
      hasContent: !!spec.relativePath,
      ref: spec.fileName,
      relativePath: spec.relativePath
    }, readOnly),
    artifactHtml('Design', 'design', artifacts.design || {}, readOnly),
    artifactHtml('Execute Log', 'executeLog', artifacts.executeLog || {}, readOnly),
    artifactHtml('Learning', 'learning', artifacts.learning || {}, readOnly)
  ].join('');
  Array.prototype.forEach.call(document.querySelectorAll('[data-preview-artifact]'), function(button) {
    button.addEventListener('click', function() {
      previewArtifact(button.getAttribute('data-preview-artifact'));
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-open-artifact]'), function(button) {
    button.addEventListener('click', function() {
      openArtifact(button.getAttribute('data-open-artifact'), button);
    });
  });
}

function renderValidation(result) {
  result = result || { ok: false, issues: ['Validation data is unavailable.'] };
  result.issues = Array.isArray(result.issues) ? result.issues : [];
  var root = qs('validation-result');
  root.innerHTML = '';
  qs('validation-summary').textContent = result.ok ? 'Completion-ready; authorization required' : (result.issues.length + ' issue' + (result.issues.length === 1 ? '' : 's'));
  if (result.ok) {
    root.innerHTML = '<div class="validation-ok"><strong>Completion gate validation</strong><span class="pill complete">OK</span><span>Archive still requires explicit current-user authorization.</span></div>';
    return;
  }
  result.issues.forEach(function(issue) {
    var row = document.createElement('div');
    row.className = 'issue';
    row.textContent = issue;
    root.appendChild(row);
  });
}

function renderDetail(spec) {
  try {
    spec = spec || {};
    spec.completion = spec.completion || {};
    spec.validate = spec.validate || { ok: false, issues: ['Validation data is loading.'], issueCount: 1 };
    state.detail = spec;
    qs('empty-detail').classList.add('hidden');
    qs('spec-detail').classList.remove('hidden');
    qs('detail-eyebrow').textContent = text(spec.version) + ' / ' + text(spec.slug);
    qs('detail-title').textContent = text(spec.taskName || spec.fileName || spec.id);
    qs('detail-path').textContent = text(spec.relativePath);
    qs('detail-mode').textContent = text(spec.mode);
    qs('detail-status').textContent = ConsoleView.statusLabel(spec.status);
    qs('detail-phase').textContent = ConsoleView.phaseLabel(spec.phase);
    qs('detail-work-state').textContent = ConsoleView.workLabel(spec);
    qs('detail-updated').textContent = formatDate(spec.updatedAt);
    var archived = ConsoleView.isArchived(spec);
    qs('validate').hidden = archived;
    qs('validate').disabled = false;
    qs('gate-section').hidden = archived;
    qs('validation-section').hidden = archived;
    qs('phase-progress').hidden = archived;
    renderProgress(spec);
    renderBlocker(spec);
    renderRiskFlags(spec);
    renderChallengeVerdict(spec);
    renderBlockers(spec);
    renderQualityPlan(spec);
    renderProviderReadiness(spec);
    renderVerificationEvidence(spec);
    renderGateList(spec);
    renderArtifacts(spec);
    renderDesignMethod(spec);
    renderLearningTriggers(spec);
    renderAcCoverage(spec);
    renderCruiseRun(spec);
    renderValidation(spec.validate);
    qs('validate').onclick = function() {
      runValidate(spec.id);
    };
    updateSelectionNotice();
  } catch (e) {
    showDetailError(e);
  }
}

function showDetailError(err) {
  qs('empty-detail').classList.add('hidden');
  qs('spec-detail').classList.remove('hidden');
  qs('detail-eyebrow').textContent = 'Render error';
  qs('detail-title').textContent = 'Unable to render spec';
  qs('detail-path').textContent = err.message || String(err);
  qs('detail-mode').textContent = '-';
  qs('detail-status').textContent = '-';
  qs('detail-phase').textContent = '-';
  qs('detail-work-state').textContent = '-';
  qs('detail-updated').textContent = '-';
  qs('next-blocker').innerHTML = '';
  qs('quality-plan').innerHTML = '<div class="projection-empty"><strong>Quality Plan unavailable</strong><span>Unable to render this selected Spec.</span></div>';
  qs('gate-list').innerHTML = '';
  qs('artifact-list').innerHTML = '';
  renderValidation({ ok: false, issues: [err.message || String(err)] });
}

function render() {
  qs('spec-total').textContent = filteredSpecs().length + ' / ' + state.specs.length + ' 项';
  qs('clear-search').hidden = !state.search;
  renderMetrics();
  renderPhaseTabs();
  renderSpecList();
  updateSelectionNotice();
}

function updateSelectionNotice() {
  qs('selection-notice').hidden = !state.selectedId || filteredSpecs().some(function(spec) { return spec.id === state.selectedId; });
}

function clearFilters() {
  state.search = ''; state.scope = 'all'; state.phase = 'all';
  qs('search').value = '';
  render();
  if (narrowScreen.matches) qs('task-navigation-panel').open = false;
  qs('search').focus();
}

function renderProgress(spec) {
  var steps = ['research', 'innovate', 'design', 'acceptance', 'plan', 'execute', 'challenge', 'learning', 'archive_authorization'];
  qs('phase-progress').innerHTML = steps.map(function(phase) {
    var gate = spec.workflow && spec.workflow.gates && spec.workflow.gates[phase === 'archive_authorization' ? 'completion' : phase];
    return '<li class="' + (phase === spec.phase ? 'current' : gate && gate.state === 'pass' ? 'complete' : '') + '"' +
      (phase === spec.phase ? ' aria-current="step"' : '') + '>' + esc(phase === 'archive_authorization' ? '归档' : ConsoleView.phaseLabel(phase)) + '</li>';
  }).join('');
}

function loadDetail(id, fallbackSpec) {
  var request = ++state.detailRequest;
  var projectDir = state.project && state.project.projectDir;
  function current() { return request === state.detailRequest && id === state.selectedId && projectDir === (state.project && state.project.projectDir); }
  if (state.selectedId !== id) {
    closeReader(false);
    qs('task-goal').textContent = '正在读取目标…';
    qs('technical-details').open = false;
  }
  state.selectedId = id;
  if (fallbackSpec) {
    render();
    renderDetail(fallbackSpec);
  }
  fetch('/api/specs/' + encodeURIComponent(id))
    .then(function(res) {
      return res.json().then(function(body) {
        return { ok: res.ok, body: body };
      });
    })
    .then(function(result) {
      if (!result.ok || result.body.error) {
        throw new Error(result.body.error || 'Unable to load spec.');
      }
      return result.body;
    })
    .then(function(spec) {
      if (!current()) return;
      render();
      renderDetail(spec);
      loadGoal(id, current);
    })
    .catch(function(err) {
      if (!current()) return;
      if (fallbackSpec) {
        renderValidation({ ok: false, issues: [err.message || String(err)] });
        return;
      }
      qs('empty-detail').classList.remove('hidden');
      qs('spec-detail').classList.add('hidden');
      qs('empty-detail').innerHTML = '<strong>Unable to load spec</strong><span>' + esc(err.message || err) + '</span>';
    });
}

function runValidate(id) {
  if (!state.detail || ConsoleView.isArchived(state.detail)) return;
  var projectDir = state.project && state.project.projectDir;
  function current() { return state.selectedId === id && projectDir === (state.project && state.project.projectDir); }
  var button = qs('validate');
  button.disabled = true;
  button.textContent = '检查中';
  fetch('/api/specs/' + encodeURIComponent(id) + '/validate', { method: 'POST' })
    .then(function(res) { return res.json(); })
    .then(function(result) {
      if (!current()) return;
      renderValidation(result);
    })
    .catch(function(err) {
      if (!current()) return;
      renderValidation({ ok: false, issues: [err.message || String(err)] });
    })
    .finally(function() {
      if (!current()) return;
      button.disabled = false;
      button.textContent = '检查归档条件';
    });
}

function selectInitialSpec() {
  if (state.selectedId && state.specs.some(function(spec) { return spec.id === state.selectedId; })) {
    var selected = state.specs.find(function(spec) { return spec.id === state.selectedId; });
    loadDetail(state.selectedId, selected);
    return;
  }
  var first = state.specs.find(function(spec) { return spec.phase !== 'archived'; }) || state.specs[0];
  if (first) loadDetail(first.id, first);
  else {
    state.selectedId = ''; state.detail = null; state.detailRequest++;
    closeReader(false);
    qs('empty-detail').classList.remove('hidden');
    qs('spec-detail').classList.add('hidden');
    qs('empty-detail').innerHTML = '<strong>当前项目暂无任务</strong><span>创建 Spec 后可在这里阅读。</span>';
  }
}

function openArtifact(artifact, button) {
  var spec = state.detail;
  if (!spec || !spec.id || ConsoleView.isArchived(spec)) return;
  var projectDir = state.project && state.project.projectDir;
  var request = state.detailRequest;
  function current() { return state.selectedId === spec.id && request === state.detailRequest && projectDir === (state.project && state.project.projectDir); }
  var original = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = '正在打开';
  }
  fetch('/api/specs/' + encodeURIComponent(spec.id) + '/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifact: artifact })
  })
    .then(function(res) {
      return res.json().then(function(body) {
        return { ok: res.ok, body: body };
      });
    })
    .then(function(result) {
      if (!current()) return;
      if (!result.ok || result.body.error) throw new Error(result.body.error || 'Unable to open artifact.');
      qs('validation-summary').textContent = '已打开 ' + text(result.body.target && result.body.target.relativePath);
    })
    .catch(function(err) {
      if (!current()) return;
      renderValidation({ ok: false, issues: [err.message || String(err)] });
    })
    .finally(function() {
      if (!current()) return;
      if (button) {
        button.disabled = false;
        button.textContent = original || 'Open';
      }
    });
}

function loadGoal(id, current) {
  fetch('/api/specs/' + encodeURIComponent(id) + '/artifact?artifact=spec').then(function(res) {
    if (!res.ok) throw new Error('目标读取失败');
    return res.json();
  }).then(function(body) {
    if (!current()) return;
    qs('task-goal').textContent = ConsoleView.goalFromSpec(body.content) || '未填写目标 · 可阅读 Spec 查看任务上下文';
  }).catch(function() {
    if (current()) qs('task-goal').textContent = '目标暂不可用 · 请刷新或阅读 Spec';
  });
}

function closeReader(focus) {
  state.artifactRequest++;
  state.reader = null;
  qs('artifact-reader').hidden = true;
  qs('task-overview').hidden = false;
  if (focus) {
    var button = qs('artifact-list').querySelector('[data-preview-artifact="spec"]');
    if (button) button.focus();
  }
}

function setReaderMode(raw) {
  qs('reader-content').hidden = raw;
  qs('reader-raw').hidden = !raw;
  qs('reader-formatted').setAttribute('aria-pressed', String(!raw));
  qs('reader-source').setAttribute('aria-pressed', String(raw));
}

function previewArtifact(artifact, section) {
  var spec = state.detail;
  if (!spec || !spec.id) return;
  var request = ++state.artifactRequest;
  var projectDir = state.project && state.project.projectDir;
  function current() { return request === state.artifactRequest && spec.id === state.selectedId && projectDir === (state.project && state.project.projectDir); }
  state.reader = { artifact: artifact, specId: spec.id };
  qs('artifact-reader').hidden = false;
  qs('task-overview').hidden = true;
  qs('reader-title').textContent = '正在读取…';
  qs('reader-label').textContent = ConsoleView.isArchived(spec) ? '历史制品 · 只读' : '任务制品';
  qs('reader-content').innerHTML = '';
  qs('reader-raw').textContent = '';
  qs('reader-status').textContent = '正在读取制品';
  qs('reader-open').hidden = true;
  qs('reader-window').href = previewUrl(spec.id, artifact);
  setReaderMode(false);
  fetch('/api/specs/' + encodeURIComponent(spec.id) + '/artifact?artifact=' + encodeURIComponent(artifact)).then(function(res) {
    return res.json().then(function(body) { if (!res.ok || body.error) throw new Error(body.error || '无法读取制品'); return body; });
  }).then(function(body) {
    if (!current()) return;
    qs('reader-title').textContent = body.label + ' · ' + body.relativePath;
    qs('reader-status').textContent = '';
    qs('reader-content').innerHTML = ConsoleView.documentHtml(body.content);
    qs('reader-raw').textContent = body.content || '';
    qs('reader-open').hidden = ConsoleView.isArchived(spec);
    qs('reader-open').onclick = function() { openArtifact(artifact, qs('reader-open')); };
    var target = Array.prototype.find.call(qs('reader-content').querySelectorAll('[data-section]'), function(node) { return node.getAttribute('data-section') === section; });
    (target || qs('reader-title')).focus();
  }).catch(function(err) {
    if (!current()) return;
    qs('reader-title').textContent = '无法读取制品';
    qs('reader-status').textContent = err.message || String(err);
    qs('reader-title').focus();
  });
}

function loadSpecs(force) {
  force = !!force;
  if (!state.project || !state.project.configured) {
    resetProjectView('Select a project directory');
    return;
  }
  var request = ++state.specsRequest;
  var projectDir = state.project.projectDir;
  function current() { return request === state.specsRequest && projectDir === (state.project && state.project.projectDir); }
  qs('last-sync').textContent = force ? '正在刷新…' : '正在同步…';
  fetch('/api/specs' + (force ? '?refresh=1' : ''))
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!current()) return;
      if (data.error) throw new Error(data.error);
      state.specs = (data.specs || []).filter(ConsoleView.isTaskRecord);
      state.counts = data.counts || {};
      qs('project-path').textContent = data.projectDir;
      qs('last-sync').textContent = data.state === 'indexing'
        ? '正在建立索引…'
        : (data.stale ? '正在刷新…' : '已同步 ' + new Date().toLocaleTimeString());
      render();
      if (data.state === 'indexing' || data.stale) {
        clearTimeout(state.specsPollTimer);
        state.specsPollTimer = setTimeout(function() { loadSpecs(false); }, 700);
      } else {
        selectInitialSpec();
      }
    })
    .catch(function(err) {
      if (!current()) return;
      qs('last-sync').textContent = '同步失败，可重试';
      qs('spec-list').innerHTML = '<div class="empty-list"><strong>无法载入任务</strong><span>' + esc(err.message || err) + '</span></div>';
    });
}

function renderProject(info) {
  var previous = state.project && state.project.projectDir;
  if (previous !== (info && info.projectDir)) {
    resetProjectView('正在切换项目…');
    state.search = ''; state.scope = 'all'; state.phase = 'all';
    qs('search').value = '';
  }
  state.project = info;
  qs('project-error').textContent = '';
  qs('project-input').value = info && info.projectDir ? info.projectDir : '';
  qs('project-state').textContent = info && info.configured ? '已载入' : '未载入';
  qs('project-name').textContent = info && info.configured ? info.projectDir.split(/[\\/]/).filter(Boolean).pop() : '选择项目';
  renderProjectProfile(info);
  if (info && info.configured) {
    addProjectDir(info.projectDir);
    qs('project-path').textContent = info.projectDir;
    refreshProjectBoard();
  } else {
    resetProjectView('Select a project directory');
  }
}

function loadProjectInfo() {
  var request = state.projectRequest;
  state.projectDirs = storageProjectDirs();
  fetch('/api/project')
    .then(function(res) { return res.json(); })
    .then(function(info) {
      if (request !== state.projectRequest) return;
      var remembered = localStorage.getItem('sdd-console-project');
      if (remembered) addProjectDir(remembered);
      if (!info.configured && remembered) {
        qs('project-input').value = remembered;
        setProject(remembered);
        return;
      }
      renderProject(info);
      refreshProjectBoard();
      if (info.configured) loadSpecs(false);
    })
    .catch(function(err) {
      if (request !== state.projectRequest) return;
      qs('project-error').textContent = err.message || String(err);
      resetProjectView('Unable to read project state');
    });
}

function setProject(projectDir) {
  var request = ++state.projectRequest;
  clearTimeout(state.specsPollTimer);
  resetProjectView('正在切换项目…');
  state.search = ''; state.scope = 'all'; state.phase = 'all';
  qs('search').value = '';
  if (state.project) state.project.configured = false;
  qs('project-error').textContent = '';
  state.projectSwitch = state.projectSwitch.catch(function() {}).then(function() {
    return fetch('/api/project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectDir: projectDir })
    });
  })
    .then(function(res) {
      return res.json().then(function(body) { return { ok: res.ok, body: body }; });
    })
    .then(function(result) {
      if (request !== state.projectRequest) return;
      if (!result.ok) throw new Error(result.body.error || 'Unable to load project.');
      localStorage.setItem('sdd-console-project', result.body.projectDir);
      addProjectDir(result.body.projectDir);
      renderProject(result.body);
      loadSpecs(false);
    })
    .catch(function(err) {
      if (request !== state.projectRequest) return;
      qs('project-error').textContent = err.message || String(err);
      resetProjectView('项目载入失败，请重新选择');
    });
  return state.projectSwitch;
}

function chooseProjectFolder() {
  var request = ++state.projectRequest;
  qs('project-error').textContent = '';
  qs('choose-folder').disabled = true;
  qs('choose-folder').textContent = '选择中';
  state.projectSwitch = state.projectSwitch.catch(function() {}).then(function() {
    return fetch('/api/project/browse', { method: 'POST' });
  })
    .then(function(res) {
      return res.json().then(function(body) { return { ok: res.ok, body: body }; });
    })
    .then(function(result) {
      if (request !== state.projectRequest) return;
      if (result.body && result.body.cancelled) {
        if (!state.project || !state.project.configured) loadProjectInfo();
        return;
      }
      if (!result.ok) throw new Error(result.body.error || 'Unable to choose project folder.');
      localStorage.setItem('sdd-console-project', result.body.projectDir);
      addProjectDir(result.body.projectDir);
      renderProject(result.body);
      loadSpecs(false);
    })
    .catch(function(err) {
      if (request !== state.projectRequest) return;
      qs('project-error').textContent = err.message || String(err);
    })
    .finally(function() {
      qs('choose-folder').disabled = false;
      qs('choose-folder').textContent = '切换项目';
    });
  return state.projectSwitch;
}

qs('refresh').addEventListener('click', function() { loadSpecs(true); });
qs('refresh-project-board').addEventListener('click', function() { refreshProjectBoard(true); });
qs('choose-folder').addEventListener('click', chooseProjectFolder);
qs('project-picker').addEventListener('click', function(event) {
  if (event.target.id === 'project-input' || event.target.id === 'project-name') chooseProjectFolder();
});
qs('use-current').addEventListener('click', function() {
  var cwd = state.project && state.project.cwd ? state.project.cwd : '';
  qs('project-input').value = cwd;
  setProject(cwd);
});
qs('search').addEventListener('input', function(event) {
  state.search = event.target.value;
  render();
  if (narrowScreen.matches) qs('task-navigation-panel').open = true;
});
qs('clear-search').addEventListener('click', function() {
  state.search = ''; qs('search').value = ''; render(); qs('search').focus();
});
qs('reset-filters').addEventListener('click', clearFilters);
qs('phase-filter').addEventListener('change', function(event) { state.phase = event.target.value; render(); });
qs('reader-close').addEventListener('click', function() { closeReader(true); });
qs('reader-formatted').addEventListener('click', function() { setReaderMode(false); });
qs('reader-source').addEventListener('click', function() { setReaderMode(true); });
qs('sort-order').addEventListener('change', function(event) {
  state.sort = event.target.value;
  render();
});

function adjustNavigation() { qs('task-navigation-panel').open = !narrowScreen.matches || !!state.search; }
if (narrowScreen.addEventListener) narrowScreen.addEventListener('change', adjustNavigation);
adjustNavigation();

loadProjectInfo();
