var state = {
  specs: [],
  counts: {},
  selectedId: '',
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
  ['review', 'Review'],
  ['ready', 'Ready'],
  ['archived', 'Archived']
];

var gateDefinitions = [
  ['research', 'Research', 'Confirmed requirement or invocation baseline'],
  ['innovate', 'Innovate', 'Options or explicit skip reason'],
  ['design', 'Design', 'Technical design or design note'],
  ['acceptance', 'Acceptance', 'Observable acceptance criteria'],
  ['plan', 'Plan Approval', 'Human approval recorded'],
  ['executeLog', 'Execute Log', 'Execution facts recorded'],
  ['review', 'Review', 'Review section filled'],
  ['reviewPass', 'PASS Verdict', 'Final verdict allows archive']
];

var blockerText = {
  research: 'Research still needs a confirmed requirement or usable invocation baseline.',
  innovate: 'Innovate needs options, or a documented skip reason in lite mode.',
  design: 'Design is missing or empty. Standard and lite specs need an external design artifact.',
  acceptance: 'Acceptance criteria are missing or incomplete.',
  plan: 'Plan approval is missing. Fill Plan Approved By and Approved At before Execute.',
  execute: 'Execute Log is missing or empty. Record the execution facts before Review.',
  review: 'Review is missing or does not contain a PASS verdict.',
  ready: 'All archive gates pass. This spec is ready to archive.',
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
  if (phase === 'ready') return 'complete';
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

function gateValue(spec, key) {
  if (key === 'design' && spec.mode === 'micro') return true;
  return !!spec.completion[key];
}

function gateStats(spec) {
  var total = gateDefinitions.length;
  var done = gateDefinitions.filter(function(gate) { return gateValue(spec, gate[0]); }).length;
  return { done: done, total: total };
}

function gatePhase(key) {
  if (key === 'executeLog') return 'execute';
  if (key === 'review' || key === 'reviewPass') return 'review';
  return key;
}

function gateTone(spec, key) {
  if (gateValue(spec, key)) return 'complete';
  var phase = gatePhase(key);
  if (spec.phase === phase) return phase === 'plan' ? 'waiting' : 'progress';
  return 'not-started';
}

function previewUrl(specId, artifact) {
  return '/preview.html?spec=' + encodeURIComponent(specId) + '&artifact=' + encodeURIComponent(artifact);
}

function filteredSpecs() {
  var query = state.search.trim().toLowerCase();
  var specs = state.specs.filter(function(spec) {
    var phaseMatch = state.phase === 'all' || spec.phase === state.phase;
    if (!phaseMatch) return false;
    if (!query) return true;
    return [
      spec.taskName,
      spec.slug,
      spec.mode,
      spec.status,
      spec.phase,
      spec.relativePath,
      spec.reviewVerdict
    ].join(' ').toLowerCase().indexOf(query) !== -1;
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
  var active = state.specs.filter(function(spec) { return spec.phase !== 'archived'; }).length;
  var blocked = state.specs.reduce(function(sum, spec) { return sum + (spec.validate.issueCount || 0); }, 0);
  var ready = state.specs.filter(function(spec) { return spec.phase === 'ready'; }).length;
  qs('metric-total').textContent = total;
  qs('metric-active').textContent = active;
  qs('metric-blocked').textContent = blocked;
  qs('metric-ready').textContent = ready;
}

function projectSpark(summary) {
  var counts = summary.counts || {};
  var complete = summary.ready || 0;
  var progress = (counts.research || 0) + (counts.innovate || 0) + (counts.design || 0) +
    (counts.acceptance || 0) + (counts.execute || 0) + (counts.review || 0);
  var waiting = counts.plan || 0;
  var notStarted = counts.archived || 0;
  return [
    '<span class="mini-gate complete" title="ready: ' + esc(complete) + '"></span>',
    '<span class="mini-gate progress" title="in progress: ' + esc(progress) + '"></span>',
    '<span class="mini-gate waiting" title="waiting approval: ' + esc(waiting) + '"></span>',
    '<span class="mini-gate not-started" title="archived: ' + esc(notStarted) + '"></span>'
  ].join('');
}

function renderProjectBoard() {
  var root = qs('project-board-list');
  root.innerHTML = '';
  qs('project-board-summary').textContent = state.projectDirs.length + ' project' + (state.projectDirs.length === 1 ? '' : 's') + ' tracked';
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
      '<button type="button" data-remove="' + esc(summary.projectDir) + '">Remove</button>',
      '</div>',
      '<div class="project-card-path">' + esc(summary.projectDir) + '</div>',
      summary.state === 'indexing' ? '<div class="project-card-path">Indexing...</div>' : '',
      '<div class="project-stats">',
      '<div><span>Total</span><strong>' + esc(summary.total || 0) + '</strong></div>',
      '<div><span>Active</span><strong>' + esc(summary.active || 0) + '</strong></div>',
      '<div><span>Ready</span><strong>' + esc(summary.ready || 0) + '</strong></div>',
      '<div><span>Gates</span><strong>' + esc(summary.issueCountLightweight ? 'Open' : (summary.issueCount || 0)) + '</strong></div>',
      '</div>',
      '<div class="phase-spark">' + projectSpark(summary) + '</div>',
      summary.error ? '<div class="project-card-path">' + esc(summary.error) + '</div>' : ''
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
  state.specs = [];
  state.counts = {};
  state.selectedId = '';
  state.detail = null;
  qs('project-path').textContent = message || 'Select a project directory';
  qs('last-sync').textContent = 'Not synced';
  qs('spec-detail').classList.add('hidden');
  qs('empty-detail').classList.remove('hidden');
  qs('empty-detail').innerHTML = '<strong>No project loaded</strong><span>Enter a project directory to inspect specs.</span>';
  render();
}

function renderPhaseTabs() {
  var root = qs('phase-tabs');
  root.innerHTML = '';
  phases.forEach(function(item) {
    var phase = item[0];
    var label = item[1];
    var count = phase === 'all' ? state.specs.length : (state.counts[phase] || 0);
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'phase-tab' + (state.phase === phase ? ' active' : '');
    button.innerHTML = '<span>' + esc(label) + '</span><strong>' + esc(count) + '</strong>';
    button.addEventListener('click', function() {
      state.phase = phase;
      render();
    });
    root.appendChild(button);
  });
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
    empty.innerHTML = '<strong>No matching specs</strong><span>Try another phase or search term.</span>';
    root.appendChild(empty);
    return;
  }
  specs.forEach(function(spec) {
    var stats = gateStats(spec);
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'spec-item' + (state.selectedId === spec.id ? ' active' : '');
    button.innerHTML = [
      '<div class="spec-row">',
      '<span class="spec-name">' + esc(spec.taskName) + '</span>',
      '<span class="pill ' + phaseTone(spec.phase) + '">' + esc(spec.phase) + '</span>',
      '</div>',
      '<div class="spec-row meta">',
      '<span>' + esc(spec.version) + ' / ' + esc(spec.mode) + ' / ' + stats.done + '/' + stats.total + ' gates</span>',
      '<span class="pill ' + validationTone(spec) + '">' + (spec.validate.ok ? 'valid' : esc(spec.validate.issueCount) + ' issues') + '</span>',
      '</div>',
      renderMiniGates(spec),
      '<div class="spec-row meta">',
      '<span class="path">' + esc(spec.relativePath) + '</span>',
      '<span>' + esc(formatDate(spec.updatedAt)) + '</span>',
      '</div>'
    ].join('');
    button.addEventListener('click', function() {
      loadDetail(spec.id, spec);
    });
    root.appendChild(button);
  });
}

function nextBlocker(spec) {
  spec = spec || {};
  if (spec.phase === 'archived' || spec.phase === 'ready') return spec.phase;
  return spec.phase || 'research';
}

function renderBlocker(spec) {
  var phase = nextBlocker(spec);
  var tone = phaseTone(phase);
  qs('next-blocker').innerHTML = [
    '<div class="blocker-card">',
    '<span class="pill ' + tone + '">' + esc(phase) + '</span>',
    '<div><strong>' + (phase === 'ready' ? 'Ready to archive' : phase === 'archived' ? 'Archived' : 'Next blocker') + '</strong>',
    '<span>' + esc(blockerText[phase] || 'Review this spec before moving forward.') + '</span></div>',
    '</div>'
  ].join('');
}

function renderGateList(spec) {
  spec = spec || {};
  spec.completion = spec.completion || {};
  var root = qs('gate-list');
  root.innerHTML = '';
  var stats = gateStats(spec);
  qs('gate-score').textContent = stats.done + ' of ' + stats.total + ' gates complete';
  gateDefinitions.forEach(function(gate) {
    var key = gate[0];
    var done = gateValue(spec, key);
    var tone = gateTone(spec, key);
    var row = document.createElement('div');
    row.className = 'gate';
    row.innerHTML = [
      '<div><strong>' + esc(gate[1]) + '</strong><small>' + esc(key === 'design' && spec.mode === 'micro' ? 'Not required for micro mode' : gate[2]) + '</small></div>',
      '<span class="pill ' + tone + '">' + (done ? 'Done' : tone === 'waiting' ? 'Approval' : tone === 'progress' ? 'Current' : 'Not started') + '</span>'
    ].join('');
    root.appendChild(row);
  });
}

function artifactHtml(name, type, artifact) {
  if (artifact && artifact.notRequired) {
    return [
      '<div class="artifact">',
      '<div class="artifact-top"><strong>' + esc(name) + '</strong><span class="pill not-started">Not required</span></div>',
      '<div class="path">micro mode keeps design intent inside Plan</div>',
      '<div class="artifact-actions">',
      '<button type="button" disabled>Preview</button>',
      '<button type="button" disabled>Edit</button>',
      '</div>',
      '</div>'
    ].join('');
  }
  var exists = artifact && artifact.exists;
  var hasContent = artifact && artifact.hasContent;
  var tone = hasContent ? 'complete' : exists ? 'progress' : 'not-started';
  var label = hasContent ? 'OK' : exists ? 'Empty' : 'Missing';
  return [
    '<div class="artifact">',
    '<div class="artifact-top"><strong>' + esc(name) + '</strong><span class="pill ' + tone + '">' + esc(label) + '</span></div>',
    '<div class="path">ref: ' + esc(artifact && artifact.ref ? artifact.ref : '-') + '</div>',
    '<div class="path">path: ' + esc(artifact && artifact.relativePath ? artifact.relativePath : '-') + '</div>',
    '<div class="artifact-actions">',
    '<button data-preview-artifact="' + esc(type) + '" type="button"' + (exists ? '' : ' disabled') + '>Preview</button>',
    '<button data-open-artifact="' + esc(type) + '" type="button"' + (exists ? '' : ' disabled') + '>Edit</button>',
    '</div>',
    '</div>'
  ].join('');
}

function renderArtifacts(spec) {
  var artifacts = spec.artifacts || {};
  qs('artifact-list').innerHTML = [
    artifactHtml('Spec', 'spec', {
      exists: !!spec.relativePath,
      hasContent: !!spec.relativePath,
      ref: spec.fileName,
      relativePath: spec.relativePath
    }),
    artifactHtml('Design', 'design', artifacts.design || {}),
    artifactHtml('Execute Log', 'executeLog', artifacts.executeLog || {})
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
  qs('validation-summary').textContent = result.ok ? 'Archive-ready' : (result.issues.length + ' issue' + (result.issues.length === 1 ? '' : 's'));
  if (result.ok) {
    root.innerHTML = '<div class="validation-ok"><strong>Archive-ready validation</strong><span class="pill complete">OK</span></div>';
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
    qs('detail-status').textContent = text(spec.status);
    qs('detail-phase').textContent = text(spec.phase);
    qs('detail-updated').textContent = formatDate(spec.updatedAt);
    renderBlocker(spec);
    renderGateList(spec);
    renderArtifacts(spec);
    renderValidation(spec.validate);
    qs('validate').onclick = function() {
      runValidate(spec.id);
    };
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
  qs('detail-updated').textContent = '-';
  qs('next-blocker').innerHTML = '';
  qs('gate-list').innerHTML = '';
  qs('artifact-list').innerHTML = '';
  renderValidation({ ok: false, issues: [err.message || String(err)] });
}

function render() {
  qs('spec-total').textContent = filteredSpecs().length + ' shown / ' + state.specs.length + ' total';
  renderMetrics();
  renderPhaseTabs();
  renderSpecList();
}

function loadDetail(id, fallbackSpec) {
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
      state.selectedId = id;
      render();
      renderDetail(spec);
    })
    .catch(function(err) {
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
  var button = qs('validate');
  button.disabled = true;
  button.textContent = 'Validating';
  fetch('/api/specs/' + encodeURIComponent(id) + '/validate', { method: 'POST' })
    .then(function(res) { return res.json(); })
    .then(function(result) {
      renderValidation(result);
    })
    .catch(function(err) {
      renderValidation({ ok: false, issues: [err.message || String(err)] });
    })
    .finally(function() {
      button.disabled = false;
      button.textContent = 'Validate';
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
}

function openArtifact(artifact, button) {
  var spec = state.detail;
  if (!spec || !spec.id) return;
  var original = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Opening';
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
      if (!result.ok || result.body.error) throw new Error(result.body.error || 'Unable to open artifact.');
      qs('validation-summary').textContent = 'Opened ' + text(result.body.target && result.body.target.relativePath);
    })
    .catch(function(err) {
      renderValidation({ ok: false, issues: [err.message || String(err)] });
    })
    .finally(function() {
      if (button) {
        button.disabled = false;
        button.textContent = original || 'Open';
      }
    });
}

function previewArtifact(artifact) {
  var spec = state.detail;
  if (!spec || !spec.id) return;
  window.open(previewUrl(spec.id, artifact), '_blank', 'noopener');
}

function loadSpecs(force) {
  force = !!force;
  if (!state.project || !state.project.configured) {
    resetProjectView('Select a project directory');
    return;
  }
  qs('last-sync').textContent = force ? 'Refreshing index...' : 'Syncing...';
  fetch('/api/specs' + (force ? '?refresh=1' : ''))
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.error) throw new Error(data.error);
      state.specs = data.specs || [];
      state.counts = data.counts || {};
      qs('project-path').textContent = data.projectDir + ' / ' + data.docsDir;
      qs('last-sync').textContent = data.state === 'indexing'
        ? 'Indexing...'
        : (data.stale ? 'Refreshing...' : 'Synced ' + new Date().toLocaleTimeString());
      render();
      if (data.state === 'indexing' || data.stale) {
        clearTimeout(state.specsPollTimer);
        state.specsPollTimer = setTimeout(function() { loadSpecs(false); }, 700);
      } else {
        selectInitialSpec();
      }
    })
    .catch(function(err) {
      qs('last-sync').textContent = 'Sync failed';
      qs('spec-list').innerHTML = '<div class="empty-list"><strong>Unable to load specs</strong><span>' + esc(err.message || err) + '</span></div>';
    });
}

function renderProject(info) {
  state.project = info;
  qs('project-error').textContent = '';
  qs('project-input').value = info && info.projectDir ? info.projectDir : '';
  qs('project-state').textContent = info && info.configured ? 'Loaded' : 'Not loaded';
  if (info && info.configured) {
    addProjectDir(info.projectDir);
    qs('project-path').textContent = info.projectDir + ' / ' + info.docsDir;
    refreshProjectBoard();
  } else {
    resetProjectView('Select a project directory');
  }
}

function loadProjectInfo() {
  state.projectDirs = storageProjectDirs();
  fetch('/api/project')
    .then(function(res) { return res.json(); })
    .then(function(info) {
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
      qs('project-error').textContent = err.message || String(err);
      resetProjectView('Unable to read project state');
    });
}

function setProject(projectDir) {
  qs('project-error').textContent = '';
  return fetch('/api/project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectDir: projectDir })
  })
    .then(function(res) {
      return res.json().then(function(body) { return { ok: res.ok, body: body }; });
    })
    .then(function(result) {
      if (!result.ok) throw new Error(result.body.error || 'Unable to load project.');
      localStorage.setItem('sdd-console-project', result.body.projectDir);
      addProjectDir(result.body.projectDir);
      renderProject(result.body);
      loadSpecs(false);
    })
    .catch(function(err) {
      qs('project-error').textContent = err.message || String(err);
      resetProjectView('Select a project directory');
    });
}

function chooseProjectFolder() {
  qs('project-error').textContent = '';
  qs('choose-folder').disabled = true;
  qs('choose-folder').textContent = 'Choosing';
  return fetch('/api/project/browse', { method: 'POST' })
    .then(function(res) {
      return res.json().then(function(body) { return { ok: res.ok, body: body }; });
    })
    .then(function(result) {
      if (result.body && result.body.cancelled) return;
      if (!result.ok) throw new Error(result.body.error || 'Unable to choose project folder.');
      localStorage.setItem('sdd-console-project', result.body.projectDir);
      addProjectDir(result.body.projectDir);
      renderProject(result.body);
      loadSpecs(false);
    })
    .catch(function(err) {
      qs('project-error').textContent = err.message || String(err);
    })
    .finally(function() {
      qs('choose-folder').disabled = false;
      qs('choose-folder').textContent = 'Choose Folder';
    });
}

qs('refresh').addEventListener('click', function() { loadSpecs(true); });
qs('refresh-project-board').addEventListener('click', function() { refreshProjectBoard(true); });
qs('choose-folder').addEventListener('click', chooseProjectFolder);
qs('project-picker').addEventListener('click', function(event) {
  if (event.target.id === 'use-current' || event.target.id === 'choose-folder') return;
  chooseProjectFolder();
});
qs('use-current').addEventListener('click', function() {
  var cwd = state.project && state.project.cwd ? state.project.cwd : '';
  qs('project-input').value = cwd;
  setProject(cwd);
});
qs('search').addEventListener('input', function(event) {
  state.search = event.target.value;
  render();
});
qs('sort-order').addEventListener('change', function(event) {
  state.sort = event.target.value;
  render();
});

loadProjectInfo();
